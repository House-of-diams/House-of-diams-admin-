import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cmsMutation, readCms, type CmsAccess, type CmsReader } from './cms-command'

type Access = CmsAccess
const optionalText = (max: number) => z.string().max(max).nullish().transform((value) => value ?? '')
const slide = z.object({ id: z.string().uuid().optional(), clientId: z.string().max(200).optional(), sort_order: z.coerce.number().int().min(1).max(10_000), image_path: z.string().trim().min(1).max(2_000), mobile_image_path: optionalText(2_000), button_text: z.string().trim().min(1).max(500), button_link: z.string().trim().min(1).max(2_000) }).strict()
const item = z.object({ id: z.string().uuid().optional(), badge_text: optionalText(500), eyebrow: optionalText(500), heading_line_1: z.string().trim().min(1).max(500), heading_line_2: optionalText(500), subtitle: optionalText(10_000), primary_cta_label: optionalText(500), primary_cta_action: optionalText(2_000), secondary_cta_label: optionalText(500), secondary_cta_action: optionalText(2_000), slider_enabled: z.boolean(), status: z.enum(['active', 'hidden']) }).strict()
const envelope = z.object({ request_id: z.string().uuid(), expected_revision: z.string().regex(/^[a-f0-9]{32}$/), item: z.record(z.string(), z.unknown()), items: z.array(z.record(z.string(), z.unknown())).max(100), deleted_ids: z.array(z.string().uuid()).max(100) }).strict()
export type BespokeHeroSnapshot = { item: z.infer<typeof item> | null; items: z.infer<typeof slide>[]; revision: string }

export async function loadBespokeHeroSnapshot(client: CmsReader) {
  const { data, error } = await readCms(client, 'bespoke_hero_snapshot_v1', {})
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883' ? 'The Bespoke Hero is awaiting its database migration.' : 'Unable to load the Bespoke Hero.')
  return data as BespokeHeroSnapshot
}

export function errorResponse(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'The Bespoke Hero is awaiting its database update. Existing content was not changed.' }, { status: 503 })
  if (error.code === '40001') return NextResponse.json({ error: 'The Bespoke Hero changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'The Bespoke Hero contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: 'Unable to save the Bespoke Hero. No partial changes were committed.' }, { status: 500 })
}

export async function saveBespokeHero(access: Access, input: unknown) {
  const parsed = envelope.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid Bespoke Hero request.' }, { status: 400 })
  const parent = item.safeParse(parsed.data.item), slides = z.array(slide).safeParse(parsed.data.items)
  if (!parent.success) return NextResponse.json({ error: parent.error.issues[0]?.message ?? 'Invalid hero details.' }, { status: 400 })
  if (!slides.success) return NextResponse.json({ error: slides.error.issues[0]?.message ?? 'Invalid hero slide.' }, { status: 400 })
  const ids = slides.data.flatMap((entry) => entry.id ? [entry.id] : [])
  if (new Set(ids).size !== ids.length || new Set(parsed.data.deleted_ids).size !== parsed.data.deleted_ids.length || ids.some((id) => parsed.data.deleted_ids.includes(id))) return NextResponse.json({ error: 'Slide IDs must be unique and cannot also be deleted.' }, { status: 400 })
  const cleanSlides = slides.data.map((slideEntry) => {
    const entry = { ...slideEntry }
    delete entry.clientId
    return entry
  })
  const { data, error } = await cmsMutation(access, 'bespoke_hero_save_v1', { p_request_id: parsed.data.request_id, p_expected_revision: parsed.data.expected_revision, p_item: parent.data, p_items: cleanSlides, p_deleted_ids: parsed.data.deleted_ids })
  if (error) return errorResponse(error)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
