import 'server-only'
import { z } from 'zod'
import type { DbExecutor } from './db/query'
import { revisionOf, STALE_EDITOR_MESSAGE } from './revision'
import { OperationsError } from './db/admin-repositories/operations-shared'

export const pageSeoKeys = ['about', 'b2b', 'bespoke', 'blog', 'collection', 'contact', 'education', 'faq', 'privacy-policy', 'returns', 'shipping', 'shop', 'terms'] as const

const settingsKey = 'global_site_settings'
const text = (max: number) => z.string().trim().max(max)
// A picture on this site ("/images/logo.png") or on an https address; never a script or protocol-relative link.
const imageRef = z.string().trim().max(2_000).regex(/^(?:https:\/\/[^\s"'<>]+|\/(?!\/)[^\s"'<>]*)?$/, 'Use an https:// address or a path starting with a single /.')
const httpsUrl = z.string().trim().max(500).regex(/^https:\/\/[^\s"'<>]+$/, 'Each profile link must start with https://.')
const verificationCode = z.string().trim().max(200).regex(/^[A-Za-z0-9_-]*$/, 'Paste only the verification code, not the whole tag.')

const pageSchema = z.object({
  page_key: z.enum(pageSeoKeys),
  seo_title: text(120),
  seo_description: text(500),
  og_image_path: imageRef,
  seo_indexable: z.boolean(),
}).strict()

const siteSchema = z.object({
  org_name: text(120),
  org_logo_path: imageRef,
  org_same_as: z.array(httpsUrl).max(20),
  default_og_image_path: imageRef,
  google_site_verification: verificationCode,
  bing_site_verification: verificationCode,
}).strict()

export const seoSettingsSaveSchema = z.object({
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  pages: z.array(pageSchema).max(pageSeoKeys.length).refine((pages) => new Set(pages.map((page) => page.page_key)).size === pages.length, 'Each page can appear once.'),
  site: siteSchema,
}).strict()

export type SeoPageRow = z.infer<typeof pageSchema>
export type SeoSiteRow = z.infer<typeof siteSchema>
export type SeoSettingsSnapshot = { pages: SeoPageRow[]; site: SeoSiteRow; revision: string }

export async function loadSeoSettings(db: DbExecutor): Promise<SeoSettingsSnapshot> {
  const pages = await db.query<SeoPageRow>(
    `SELECT page_key, coalesce(seo_title,'') AS seo_title, coalesce(seo_description,'') AS seo_description,
            coalesce(og_image_path,'') AS og_image_path, seo_indexable
       FROM public.page_seo ORDER BY page_key`,
  )
  const site = await db.query<SeoSiteRow>(
    `SELECT coalesce(org_name,'') AS org_name, coalesce(org_logo_path,'') AS org_logo_path, coalesce(org_same_as,'{}') AS org_same_as,
            coalesce(default_og_image_path,'') AS default_og_image_path, coalesce(google_site_verification,'') AS google_site_verification,
            coalesce(bing_site_verification,'') AS bing_site_verification
       FROM public.site_settings WHERE settings_key = $1::text`,
    [settingsKey],
  )
  if (site.rows.length !== 1) throw new OperationsError(503, 'Site settings are not set up yet.')
  const snapshot = { pages: pages.rows, site: site.rows[0] }
  return { ...snapshot, revision: revisionOf(snapshot) }
}

export async function saveSeoSettings(db: DbExecutor, raw: unknown): Promise<SeoSettingsSnapshot> {
  const input = seoSettingsSaveSchema.parse(raw)
  // One editor at a time; the revision check then runs against the locked state.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', ['admin:seo_settings'])
  if ((await loadSeoSettings(db)).revision !== input.expected_revision) throw new OperationsError(409, STALE_EDITOR_MESSAGE)
  for (const page of input.pages) {
    const { rows } = await db.query(
      `UPDATE public.page_seo
          SET seo_title = NULLIF($2::text,''), seo_description = NULLIF($3::text,''), og_image_path = NULLIF($4::text,''),
              seo_indexable = $5::boolean, updated_at = now()
        WHERE page_key = $1::text RETURNING page_key`,
      [page.page_key, page.seo_title, page.seo_description, page.og_image_path, page.seo_indexable],
    )
    if (rows.length !== 1) throw new OperationsError(404, 'That page is not set up for SEO yet.')
  }
  const { site } = input
  const { rows } = await db.query(
    `UPDATE public.site_settings
        SET org_name = NULLIF($2::text,''), org_logo_path = NULLIF($3::text,''), org_same_as = $4::text[],
            default_og_image_path = NULLIF($5::text,''), google_site_verification = NULLIF($6::text,''), bing_site_verification = NULLIF($7::text,'')
      WHERE settings_key = $1::text RETURNING settings_key`,
    [settingsKey, site.org_name, site.org_logo_path, site.org_same_as, site.default_og_image_path, site.google_site_verification, site.bing_site_verification],
  )
  if (rows.length !== 1) throw new OperationsError(503, 'Site settings are not set up yet.')
  return loadSeoSettings(db)
}
