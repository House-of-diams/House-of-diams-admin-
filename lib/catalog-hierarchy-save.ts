import { NextResponse } from 'next/server'
import { z } from 'zod'
import { catalogMutation, catalogReader, readCatalog, type CatalogAccess, type CatalogReader } from './catalog-command'

export type CatalogHierarchyKind = 'category' | 'subcategory' | 'option'
type Access = CatalogAccess
type RpcError = { code?: string; message?: string }
type RpcClient = CatalogReader

const required = (max = 200) => z.string().trim().min(1).max(max)
const optional = (max = 2_000) => z.string().max(max).nullable().optional()
const order = z.coerce.number().int().min(0).max(1_000_000)
const status = z.enum(['active', 'hidden'])
const slug = z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase URL slug with hyphens only.')
const category = z.object({
  code: required(100), name: required(), slug, show_in_nav: z.boolean(), nav_type: z.enum(['mega_menu', 'direct_link']).nullable(), direct_link_url: optional(), display_order: order, status,
  banner_desktop_image_path: optional(), banner_mobile_image_path: optional(), banner_desktop_image_alt: optional(), banner_mobile_image_alt: optional(), banner_title: optional(500), banner_subtitle: optional(2_000), banner_cta_label: optional(200), banner_cta_link: optional(), banner_enabled: z.boolean().optional(),
}).strict()
const subcategory = z.object({ category_id: z.string().uuid(), name: required(), slug, sub_type: z.enum(['standard', 'auto_shape', 'manual_style', 'auto_metal', 'gender_split']), icon_svg_path: optional(), image_path: optional(), image_alt: optional(500), display_order: order, status }).strict()
const option = z.object({ subcategory_id: z.string().uuid(), name: required(), slug, icon_svg_path: optional(), image_path: optional(), image_alt: optional(500), display_order: order, status }).strict()
const schemas = { category, subcategory, option } as const
const saveEnvelope = z.object({ request_id: z.string().uuid(), expected_revision: z.string().regex(/^[a-f0-9]{32}$/).nullable(), item: z.record(z.string(), z.unknown()) }).strict()
const deleteEnvelope = z.object({ request_id: z.string().uuid(), expected_revision: z.string().regex(/^[a-f0-9]{32}$/) }).strict()

export type CatalogHierarchyRow = Record<string, unknown> & { id: string; _revision: string }
type Snapshot = { item: CatalogHierarchyRow | null; revision: string }

export async function loadCatalogHierarchyList(client: RpcClient, kind: CatalogHierarchyKind) {
  const { data, error } = await readCatalog(client, 'catalog_hierarchy_list_v1', { p_kind: kind })
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883' ? 'Catalog hierarchy is awaiting its database migration.' : 'Unable to load the catalog hierarchy.')
  return (Array.isArray(data) ? data : []) as CatalogHierarchyRow[]
}

export function catalogHierarchyErrorResponse(error: RpcError, action: 'save' | 'delete') {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'Catalog hierarchy is awaiting its database update. Existing data was not changed.' }, { status: 503 })
  if (error.code === '40001' || error.code === 'P0001') return NextResponse.json({ error: 'This catalog hierarchy changed or conflicts with another saved record. Reload before continuing.' }, { status: 409 })
  if (error.code === 'P0002') return NextResponse.json({ error: 'This catalog record no longer exists.' }, { status: 404 })
  if (error.code === '42501') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'The catalog hierarchy contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: `Unable to ${action} this catalog record. No partial changes were committed.` }, { status: 500 })
}

async function loadSnapshot(client: RpcClient, kind: CatalogHierarchyKind, id: string): Promise<{ ok: false; error: RpcError } | { ok: true; snapshot: Snapshot }> {
  const { data, error } = await readCatalog(client, 'catalog_hierarchy_row_v1', { p_kind: kind, p_id: id })
  if (error) return { ok: false, error }
  return { ok: true, snapshot: data as Snapshot }
}

export async function saveCatalogHierarchy(access: Access, kind: CatalogHierarchyKind, id: string | null, input: unknown) {
  const envelope = saveEnvelope.safeParse(input)
  if (!envelope.success) return NextResponse.json({ error: envelope.error.issues[0]?.message ?? 'Invalid save request.' }, { status: 400 })
  if ((id === null) !== (envelope.data.expected_revision === null)) return NextResponse.json({ error: id === null ? 'New records cannot include an existing revision.' : 'An existing revision is required.' }, { status: 400 })
  const parsedId = id === null ? null : z.string().uuid().safeParse(id)
  if (parsedId !== null && !parsedId.success) return NextResponse.json({ error: 'Invalid catalog record ID.' }, { status: 400 })

  let candidate = envelope.data.item
  if (parsedId !== null) {
    const loaded = await loadSnapshot(catalogReader(access), kind, parsedId.data)
    if (!loaded.ok) return catalogHierarchyErrorResponse(loaded.error, 'save')
    if (!loaded.snapshot.item) return NextResponse.json({ error: 'This catalog record no longer exists.' }, { status: 404 })
    const excludedKeys = new Set(['id', '_revision', 'is_system_locked', 'category_lane'])
    const current = Object.fromEntries(
      Object.entries(loaded.snapshot.item).filter(([key]) => !excludedKeys.has(key)),
    )
    candidate = { ...current, ...candidate }
  }
  const item = schemas[kind].safeParse(candidate)
  if (!item.success) return NextResponse.json({ error: item.error.issues[0]?.message ?? 'Invalid catalog details.' }, { status: 400 })
  const { data, error } = await catalogMutation(access, 'catalog_hierarchy_save_v1', { p_request_id: envelope.data.request_id, p_expected_revision: envelope.data.expected_revision, p_kind: kind, p_id: parsedId === null ? null : parsedId.data, p_item: item.data })
  if (error) return catalogHierarchyErrorResponse(error, 'save')
  const snapshot = data as Snapshot
  return NextResponse.json({ ok: true, item: snapshot.item, revision: snapshot.revision }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function deleteCatalogHierarchy(access: Access, kind: CatalogHierarchyKind, id: string, input: unknown) {
  const parsedId = z.string().uuid().safeParse(id)
  const envelope = deleteEnvelope.safeParse(input)
  if (!parsedId.success || !envelope.success) return NextResponse.json({ error: 'A valid record ID, request ID, and revision are required.' }, { status: 400 })
  const { data, error } = await catalogMutation(access, 'catalog_hierarchy_delete_v1', { p_request_id: envelope.data.request_id, p_expected_revision: envelope.data.expected_revision, p_kind: kind, p_id: parsedId.data })
  if (error) return catalogHierarchyErrorResponse(error, 'delete')
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
