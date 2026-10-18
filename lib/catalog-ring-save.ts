import { NextResponse } from 'next/server'
import { z } from 'zod'
import { catalogMutation, catalogReader, readCatalog, type CatalogAccess, type CatalogReader } from './catalog-command'

type Access = CatalogAccess
type RpcClient = CatalogReader

const rowId = z.string().uuid().optional()
const revision = z.string().regex(/^[a-f0-9]{32}$/).optional()
const order = z.coerce.number().int().min(0).max(1_000_000)
const status = z.enum(['active', 'hidden'])
const category = z.object({ id: rowId, _revision: revision, name: z.string().trim().min(1).max(200), slug: z.string().trim().min(1).max(200), description: z.string().max(2_000).nullable().optional(), display_order: order, status }).strict()
const size = z.object({ id: rowId, _revision: revision, ring_category_id: z.string().uuid(), size_label: z.string().trim().min(1).max(100), size_value: z.string().max(100).nullable().optional(), display_order: order, status }).strict()
const envelope = z.object({ request_id: z.string().uuid(), expected_revision: z.string().regex(/^[a-f0-9]{32}$/), categories: z.array(z.record(z.string(), z.unknown())).max(500), sizes: z.array(z.record(z.string(), z.unknown())).max(2_000), deleted_category_ids: z.array(z.string().uuid()).max(500), deleted_size_ids: z.array(z.string().uuid()).max(2_000) }).strict()

export type CatalogRingCategoryRow = z.infer<typeof category>
export type CatalogRingSizeRow = z.infer<typeof size>
export type CatalogRingSnapshot = { categories: CatalogRingCategoryRow[]; sizes: CatalogRingSizeRow[]; revision: string }

export async function loadCatalogRingSnapshot(client: RpcClient) {
  const { data, error } = await readCatalog(client, 'catalog_ring_snapshot_v1', {})
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883' ? 'Ring catalog is awaiting its database migration.' : 'Unable to load ring catalog.')
  return data as CatalogRingSnapshot
}

export function catalogRingErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'Ring catalog is awaiting its database update. Existing data was not changed.' }, { status: 503 })
  if (error.code === '40001') return NextResponse.json({ error: 'The ring catalog changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (error.code === 'P0001') return NextResponse.json({ error: 'The ring catalog conflicts with another saved record.' }, { status: 409 })
  if (error.code === 'P0002') return NextResponse.json({ error: 'A ring catalog record no longer exists.' }, { status: 404 })
  if (['22023', '22P02', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'The ring catalog contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: 'Unable to save the ring catalog. No partial changes were committed.' }, { status: 500 })
}

export async function getCatalogRing(access: Access) {
  try { return NextResponse.json(await loadCatalogRingSnapshot(catalogReader(access)), { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { if ('provider' in access) throw error; return NextResponse.json({ error: 'Unable to load the ring catalog.' }, { status: 503 }) }
}

export async function saveCatalogRing(access: Access, input: unknown) {
  const parsed = envelope.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid ring catalog save request.' }, { status: 400 })
  const categories = z.array(category).safeParse(parsed.data.categories)
  const sizes = z.array(size).safeParse(parsed.data.sizes)
  if (!categories.success) return NextResponse.json({ error: categories.error.issues[0]?.message ?? 'Invalid ring category row.' }, { status: 400 })
  if (!sizes.success) return NextResponse.json({ error: sizes.error.issues[0]?.message ?? 'Invalid ring size row.' }, { status: 400 })
  const categoryIds = categories.data.flatMap((item) => item.id ? [item.id] : [])
  const sizeIds = sizes.data.flatMap((item) => item.id ? [item.id] : [])
  if (new Set(categoryIds).size !== categoryIds.length || new Set(sizeIds).size !== sizeIds.length || new Set(parsed.data.deleted_category_ids).size !== parsed.data.deleted_category_ids.length || new Set(parsed.data.deleted_size_ids).size !== parsed.data.deleted_size_ids.length) return NextResponse.json({ error: 'Ring catalog IDs must be unique.' }, { status: 400 })
  if (categoryIds.some((id) => parsed.data.deleted_category_ids.includes(id)) || sizeIds.some((id) => parsed.data.deleted_size_ids.includes(id))) return NextResponse.json({ error: 'A ring catalog row cannot be retained and deleted.' }, { status: 400 })
  const { data, error } = await catalogMutation(access, 'catalog_ring_save_v1', { p_request_id: parsed.data.request_id, p_expected_revision: parsed.data.expected_revision, p_categories: categories.data, p_sizes: sizes.data, p_deleted_category_ids: parsed.data.deleted_category_ids, p_deleted_size_ids: parsed.data.deleted_size_ids })
  if (error) return catalogRingErrorResponse(error)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
