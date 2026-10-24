import 'server-only'
import { z } from 'zod'
import type { DbExecutor } from './db/query'
import { OperationsError } from './db/admin-repositories/operations-shared'
import { sanitizeCmsHtml } from './cms-html'
import { revisionOf, STALE_EDITOR_MESSAGE } from './revision'

// Education hubs (for example "Diamond 4Cs" at /education/diamond-4cs). Articles are filed under a hub from the article editor.
const text = (max: number) => z.string().trim().max(max)
const hubSchema = z.object({
  id: z.number().int().positive().nullable(),
  slug: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase address with hyphens only.'),
  name: text(120).min(1, 'Give the hub a name.'),
  intro_html: z.string().max(20_000),
  pillar_post_id: z.number().int().positive().nullable(),
  seo_title: text(120),
  seo_description: text(500),
  seo_h1: text(160),
  seo_indexable: z.boolean(),
  is_published: z.boolean(),
  sort_order: z.number().int().min(0).max(1_000_000),
}).strict()

export const educationHubSaveSchema = z.object({
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  hub: hubSchema,
}).strict()

export type EducationHubRow = Omit<z.infer<typeof hubSchema>, 'id'> & { id: number }
export type EducationHubPostChoice = { id: number; title: string; slug: string; hub_id: number | null }
export type EducationHubsSnapshot = { hubs: EducationHubRow[]; posts: EducationHubPostChoice[]; revision: string }

const num = (value: unknown) => (value == null ? null : Number(value))

export async function loadEducationHubs(db: DbExecutor): Promise<EducationHubsSnapshot> {
  const hubs = await db.query<Record<string, unknown>>(
    `SELECT id, slug, name, coalesce(intro_html,'') AS intro_html, pillar_post_id, coalesce(seo_title,'') AS seo_title,
            coalesce(seo_description,'') AS seo_description, coalesce(seo_h1,'') AS seo_h1, seo_indexable, is_published, sort_order
       FROM public.education_hubs ORDER BY sort_order, id`,
  )
  const posts = await db.query<Record<string, unknown>>('SELECT id, title, slug, hub_id FROM public.education_posts ORDER BY sort_order, id')
  const snapshot = {
    hubs: hubs.rows.map((row): EducationHubRow => ({
      id: Number(row.id), slug: String(row.slug), name: String(row.name), intro_html: String(row.intro_html ?? ''),
      pillar_post_id: num(row.pillar_post_id), seo_title: String(row.seo_title ?? ''), seo_description: String(row.seo_description ?? ''),
      seo_h1: String(row.seo_h1 ?? ''), seo_indexable: row.seo_indexable !== false, is_published: row.is_published === true, sort_order: Number(row.sort_order ?? 0),
    })),
    posts: posts.rows.map((row): EducationHubPostChoice => ({ id: Number(row.id), title: String(row.title), slug: String(row.slug), hub_id: num(row.hub_id) })),
  }
  return { ...snapshot, revision: revisionOf(snapshot) }
}

export async function saveEducationHub(db: DbExecutor, raw: unknown): Promise<EducationHubsSnapshot> {
  const { expected_revision: expected, hub } = educationHubSaveSchema.parse(raw)
  // One editor at a time; the revision check then runs against the locked state.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', ['admin:education_hubs'])
  const current = await loadEducationHubs(db)
  if (current.revision !== expected) throw new OperationsError(409, STALE_EDITOR_MESSAGE)

  const existing = hub.id === null ? null : current.hubs.find((entry) => entry.id === hub.id) ?? null
  if (hub.id !== null && !existing) throw new OperationsError(404, 'That hub no longer exists. Reload the page.')
  // An address change would break every link to the hub and its articles, and there is no redirect for it.
  if (existing && existing.slug !== hub.slug) throw new OperationsError(400, 'A hub address cannot be changed after it is created.')
  if (!existing) {
    const clash = await db.query('SELECT id FROM public.education_posts WHERE slug = $1::text', [hub.slug])
    if (clash.rows.length > 0) throw new OperationsError(400, 'An education article already uses that address. Choose another.')
  }
  if (hub.pillar_post_id !== null) {
    const pillar = existing ? await db.query<Record<string, unknown>>('SELECT id, hub_id FROM public.education_posts WHERE id = $1::bigint', [hub.pillar_post_id]) : null
    if (!existing || !pillar || pillar.rows.length !== 1 || Number(pillar.rows[0].hub_id) !== existing.id) {
      throw new OperationsError(400, 'The pillar article must already be filed under this hub.')
    }
  }

  const values = [hub.name, sanitizeCmsHtml(hub.intro_html), hub.pillar_post_id, hub.seo_title, hub.seo_description, hub.seo_h1, hub.seo_indexable, hub.is_published, hub.sort_order]
  if (!existing) {
    await db.query(
      `INSERT INTO public.education_hubs (slug, name, intro_html, pillar_post_id, seo_title, seo_description, seo_h1, seo_indexable, is_published, sort_order)
       VALUES ($1::text, $2::text, NULLIF($3::text,''), $4::bigint, NULLIF($5::text,''), NULLIF($6::text,''), NULLIF($7::text,''), $8::boolean, $9::boolean, $10::integer) RETURNING id`,
      [hub.slug, values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[7], values[8]],
    )
  } else {
    const { rows } = await db.query(
      `UPDATE public.education_hubs
          SET name = $2::text, intro_html = NULLIF($3::text,''), pillar_post_id = $4::bigint, seo_title = NULLIF($5::text,''),
              seo_description = NULLIF($6::text,''), seo_h1 = NULLIF($7::text,''), seo_indexable = $8::boolean, is_published = $9::boolean,
              sort_order = $10::integer, updated_at = now()
        WHERE id = $1::bigint RETURNING id`,
      [existing.id, ...values],
    )
    if (rows.length !== 1) throw new OperationsError(404, 'That hub no longer exists. Reload the page.')
  }
  return loadEducationHubs(db)
}
