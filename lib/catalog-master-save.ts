import { NextResponse } from 'next/server'
import { z } from 'zod'
import { catalogMutation, catalogReader, readCatalog, type CatalogAccess, type CatalogReader } from './catalog-command'

export type CatalogMasterKind = 'gst_slab' | 'certificate' | 'material_value' | 'ring_size' | 'stone_shape' | 'style' | 'content_rule'
type Access = CatalogAccess
type RpcClient = CatalogReader

const required = (max = 10_000) => z.string().trim().min(1).max(max)
const optional = (max = 10_000) => z.string().max(max).nullable().optional()
const order = z.coerce.number().int().min(0).max(1_000_000)
const status = z.enum(['active', 'hidden'])
const slug = z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase URL slug with hyphens only.')

const schemas: Record<CatalogMasterKind, z.ZodTypeAny> = {
  gst_slab: z.object({ name: required(200), code: required(50), percentage: z.coerce.number().min(0).max(100), description: optional(2_000), status, display_order: order }).strict(),
  certificate: z.object({ name: required(200), code: optional(100), status, display_order: order }).strict(),
  material_value: z.object({ name: required(200), slug, cta_mode: z.enum(['both', 'enquire_only', 'checkout_only']), cta_label: optional(200), status, display_order: order }).strict(),
  ring_size: z.object({ name: required(200), slug, status, display_order: order }).strict(),
  stone_shape: z.object({ name: required(200), slug, svg_asset_url: optional(2_000), status, display_order: order }).strict(),
  style: z.object({ name: required(200), icon_svg_path: optional(2_000), status, display_order: order }).strict(),
  content_rule: z.object({ kind: z.enum(['shipping', 'care_warranty']), name: required(200), slug, title: required(500), body: required(50_000), status, display_order: order }).strict(),
}

const saveEnvelope = z.object({
  request_id: z.string().uuid(),
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/).nullable(),
  item: z.record(z.string(), z.unknown()),
}).strict()
const deleteEnvelope = z.object({ request_id: z.string().uuid(), expected_revision: z.string().regex(/^[a-f0-9]{32}$/) }).strict()

export type CatalogMasterRow = Record<string, unknown> & { id: string; _revision: string }
export type CatalogMasterSnapshot = { item: Record<string, unknown> | null; revision: string }

export async function loadCatalogMasterList(client: RpcClient, kind: CatalogMasterKind) {
  const { data, error } = await readCatalog(client, 'catalog_master_list_v1', { p_kind: kind })
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883' ? 'Catalog masters are awaiting their database migration.' : 'Unable to load catalog masters.')
  return (Array.isArray(data) ? data : []) as CatalogMasterRow[]
}

export function catalogMasterErrorResponse(error: { code?: string; message?: string }, action: 'save' | 'delete') {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'This catalog section is awaiting its database update. Existing data was not changed.' }, { status: 503 })
  if (error.code === '40001') return NextResponse.json({ error: 'This catalog record changed after you opened it. Reload before continuing.' }, { status: 409 })
  if (error.code === 'P0001') return NextResponse.json({ error: 'This catalog record conflicts with another saved record.' }, { status: 409 })
  if (error.code === 'P0002') return NextResponse.json({ error: 'The catalog record no longer exists.' }, { status: 404 })
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'This catalog record contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: `Unable to ${action} this catalog record. No partial changes were committed.` }, { status: 500 })
}

export async function listCatalogMasters(access: Access, kind: CatalogMasterKind) {
  try {
    const items = await loadCatalogMasterList(catalogReader(access), kind)
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { if ('provider' in access) throw error;
    return NextResponse.json({ error: 'Unable to load this catalog section.' }, { status: 503 })
  }
}

export async function saveCatalogMaster(access: Access, kind: CatalogMasterKind, id: string | null, input: unknown) {
  const envelope = saveEnvelope.safeParse(input)
  if (!envelope.success) return NextResponse.json({ error: envelope.error.issues[0]?.message ?? 'Invalid save request.' }, { status: 400 })
  if ((id === null) !== (envelope.data.expected_revision === null)) return NextResponse.json({ error: id === null ? 'New records cannot include an existing revision.' : 'An existing revision is required.' }, { status: 400 })
  const item = schemas[kind].safeParse(envelope.data.item)
  if (!item.success) return NextResponse.json({ error: item.error.issues[0]?.message ?? 'Invalid catalog details.' }, { status: 400 })
  const parsedId = id === null ? null : z.string().uuid().safeParse(id)
  if (parsedId !== null && !parsedId.success) return NextResponse.json({ error: 'Invalid catalog record ID.' }, { status: 400 })
  const { data, error } = await catalogMutation(access, 'catalog_save_master_v1', {
    p_request_id: envelope.data.request_id,
    p_expected_revision: envelope.data.expected_revision,
    p_kind: kind,
    p_id: parsedId === null ? null : parsedId.data,
    p_item: item.data,
  })
  if (error) return catalogMasterErrorResponse(error, 'save')
  const snapshot = data as CatalogMasterSnapshot
  return NextResponse.json({ ok: true, item: snapshot.item, revision: snapshot.revision }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function deleteCatalogMaster(access: Access, kind: CatalogMasterKind, id: string, input: unknown) {
  const parsedId = z.string().uuid().safeParse(id)
  const envelope = deleteEnvelope.safeParse(input)
  if (!parsedId.success || !envelope.success) return NextResponse.json({ error: 'A valid record ID, request ID, and revision are required.' }, { status: 400 })
  const { data, error } = await catalogMutation(access, 'catalog_delete_master_v1', {
    p_request_id: envelope.data.request_id,
    p_expected_revision: envelope.data.expected_revision,
    p_kind: kind,
    p_id: parsedId.data,
  })
  if (error) return catalogMasterErrorResponse(error, 'delete')
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
