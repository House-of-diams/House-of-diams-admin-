import 'server-only'
import type { z } from 'zod'
import type { portfolioCategoryCreateSchema, portfolioItemCreateSchema } from '../../bespoke-portfolio-validation'
import type { PortfolioCategory, PortfolioItem, BespokeSubmission } from '@/app/dashboard/bespoke/bespoke-client'
import type { DbExecutor } from '../query'
import { enforceVideoSave, videoReferenceSlots } from '../../video-save-admission'

type CategoryInput = z.infer<typeof portfolioCategoryCreateSchema>
type ItemInput = z.infer<typeof portfolioItemCreateSchema>
type PortfolioInputs = { category: CategoryInput; item: ItemInput }
type PortfolioRows = { category: PortfolioCategory; item: PortfolioItem }
const fields = {
  category: ['name','slug','image_path','display_order','status'],
  item: ['title','tag','category_id','media_type','media_path','thumbnail_path','gem_style','gem_color','dark_theme','short_description','display_order','status'],
} as const
const tables = { category: 'bespoke_portfolio_categories', item: 'bespoke_portfolio_items' } as const
const submissionColumns = 'id,full_name,email,phone,country,piece_type,stone_preference,approx_carat,preferred_metal,message,status,created_at'
export function createBespokeRepository(db: DbExecutor) {
  function tableFor(kind: keyof PortfolioRows) {
    if (!Object.hasOwn(tables,kind)) throw new Error('Unsupported portfolio kind')
    return tables[kind]
  }
  async function list<K extends keyof PortfolioRows>(kind: K): Promise<PortfolioRows[K][]> {
    const { rows } = await db.query<{item: PortfolioRows[K]}>(`SELECT to_jsonb(t) AS item FROM public.${tableFor(kind)} t ORDER BY display_order`)
    return rows.map(row => row.item)
  }
  async function exists(kind: keyof PortfolioRows, id: string) {
    return (await db.query(`SELECT id FROM public.${tableFor(kind)} WHERE id=$1::uuid`,[id])).rows.length === 1
  }
  async function save<K extends keyof PortfolioRows>(kind: K, input: PortfolioInputs[K], id?: string, expected?: string, now = new Date().toISOString()): Promise<PortfolioRows[K] | null> {
    const table = tableFor(kind)
    const columns = fields[kind]
    if (videoReferenceSlots(input).size) {
      const previous = id ? (await db.query<{ item: unknown }>(`SELECT to_jsonb(t) AS item FROM public.${table} t WHERE id=$1::uuid FOR UPDATE`, [id])).rows[0]?.item : null
      await enforceVideoSave(db, input, previous)
    }
    const projection = columns.map(column => `(jsonb_populate_record(NULL::public.${table},$1::jsonb)).${column}`).join(',')
    const sql = id
      ? `UPDATE public.${table} SET (${columns.join(',')},updated_at)=(${projection},$4::timestamptz) WHERE id=$2::uuid AND updated_at=$3::timestamptz RETURNING to_jsonb(${table}) AS item`
      : `INSERT INTO public.${table} (${columns.join(',')}) SELECT ${projection} RETURNING to_jsonb(${table}) AS item`
    const { rows } = await db.query<{item: PortfolioRows[K]}>(sql,id ? [JSON.stringify(input),id,expected,now] : [JSON.stringify(input)])
    if (rows.length > 1) throw new Error('Invalid portfolio result')
    return rows[0]?.item ?? null
  }
  async function remove(kind: keyof PortfolioRows, id: string, expected: string) {
    return (await db.query(`DELETE FROM public.${tableFor(kind)} WHERE id=$1::uuid AND updated_at=$2::timestamptz RETURNING id`,[id,expected])).rows.length === 1
  }
  async function submissions(filters: {from?:string;to?:string;q?:string} = {}, bounded = true): Promise<BespokeSubmission[]> {
    const { rows } = await db.query<{item:BespokeSubmission}>(`SELECT to_jsonb(t) AS item FROM (SELECT ${submissionColumns} FROM public.bespoke_submissions WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz) AND ($2::timestamptz IS NULL OR created_at <= $2::timestamptz) ORDER BY created_at DESC ${bounded ? 'LIMIT 1000' : ''}) t`,[filters.from ? `${filters.from}T00:00:00.000Z` : null, filters.to ? `${filters.to}T23:59:59.999Z` : null])
    const q=filters.q?.toLowerCase() ?? ''
    return rows.map(row=>row.item).filter(item=>!q || [item.full_name,item.email,item.phone,item.country,item.piece_type,item.stone_preference,item.approx_carat,item.preferred_metal,item.message,item.status].filter(Boolean).join(' ').toLowerCase().includes(q))
  }
  async function submission(id: string): Promise<BespokeSubmission | null> {
    const {rows}=await db.query<{item:BespokeSubmission}>(`SELECT to_jsonb(t) AS item FROM (SELECT ${submissionColumns} FROM public.bespoke_submissions WHERE id=$1::uuid) t`,[id])
    if(rows.length>1)throw new Error('Invalid submission result')
    return rows[0]?.item ?? null
  }
  return {list,exists,save,remove,submissions,submission}
}
