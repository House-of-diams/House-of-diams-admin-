import { NextResponse } from 'next/server'
import { z } from 'zod'
import { navbarMutation, type CatalogAccess } from './catalog-command'
import { mapSectionTypeToDb, normalizeNavbarItemForSave } from './navbar'

type Access = CatalogAccess
const uuid = z.string().uuid()
const bigintId = z.string().regex(/^[1-9][0-9]*$/).max(19).refine(value => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt('9223372036854775807'), 'Invalid navbar source ID.')
const shortText = z.string().max(500)
const longText = z.string().max(2_000)
const integer = z.coerce.number().int().min(0).max(1_000_000)
const source = z.object({ id: bigintId.optional(), sourceKind: z.enum(['subcategory_option', 'metal', 'stone_shape', 'ring_size', 'certificate', 'style']), sourceItemId: uuid, label: shortText, sortOrder: integer, isActive: z.boolean() }).strict()
const link = z.object({ id: uuid.optional(), label: shortText, url: longText }).strict()
const section = z.object({ id: z.string().min(1).max(200), title: shortText, iconSvgPath: longText.nullish(), type: z.enum(['Subcategory Options', 'Manual Links', 'Metal Swatches', 'Stone Shapes', 'Ring Sizes', 'Certificates', 'Styles', 'Category Link']), sourceLabel: shortText, sourceSubcategoryId: uuid.nullable(), sourceCategorySlug: shortText.nullish(), column: integer, showAsFilter: z.boolean().optional(), enableCategoryLink: z.boolean().optional(), linkedCategoryId: uuid.nullable().optional(), selectedSourceItems: z.array(source).max(1_000).optional(), links: z.array(link).max(500) }).strict()
const featured = z.object({ id: uuid.optional(), enabled: z.boolean(), imageUrl: longText, buttonLabel: shortText, buttonUrl: longText, imageAlt: longText }).strict()
const item = z.object({ id: z.string().min(1).max(200), label: shortText, slug: shortText, type: z.enum(['mega', 'direct']), linkedCategoryId: uuid.nullable().optional(), visible: z.boolean(), url: longText.optional(), columns: integer.optional(), sections: z.array(section).max(500).optional(), featuredImage: featured.optional() }).strict()
const envelope = z.object({
  request_id: uuid,
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  items: z.array(item).min(1).max(500),
  deleted_ids: z.object({ sections: z.array(uuid).max(1_000), links: z.array(uuid).max(2_000), source_items: z.array(bigintId).max(5_000), featured_cards: z.array(uuid).max(500) }).strict(),
}).strict()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function unique(values: string[]) { return new Set(values).size === values.length }
export function navbarSaveErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'The navbar editor is awaiting its database update. Existing navigation was not changed.' }, { status: 503 })
  if (error.code === '40001' || error.code === 'PT409') return NextResponse.json({ error: 'The navbar changed after you opened it. Reload before saving again.' }, { status: 409 })
  // Keep production errors non-enumerable, but make local development failures
  // actionable instead of collapsing every unexpected database error into one toast.
  if (process.env.NODE_ENV !== 'production' && error.code && error.message) {
    console.error('Navbar save failed:', error)
    return NextResponse.json({ error: `Navbar save failed (${error.code}): ${error.message}` }, { status: 500 })
  }
  if (error.code === '23503') return NextResponse.json({ error: 'A selected navbar value no longer exists. Reload and try again.' }, { status: 400 })
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'The navbar contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: 'Unable to save the navbar. No partial changes were committed.' }, { status: 500 })
}

export async function saveNavbar(access: Access, input: unknown) {
  const parsed = envelope.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid navbar save request.' }, { status: 400 })
  const deleted = parsed.data.deleted_ids
  if (![deleted.sections, deleted.links, deleted.source_items, deleted.featured_cards].every(unique)) return NextResponse.json({ error: 'Deleted navbar IDs must be unique.' }, { status: 400 })

  const normalized = parsed.data.items.map(normalizeNavbarItemForSave).filter((entry) => entry.label.trim())
  const itemKeys = new Set<string>()
  const sectionKeys = new Set<string>()
  const items: Record<string, unknown>[] = []
  const sections: Record<string, unknown>[] = []
  const links: Record<string, unknown>[] = []
  const sourceItems: Record<string, unknown>[] = []
  const featuredCards: Record<string, unknown>[] = []

  for (const [itemIndex, navItem] of normalized.entries()) {
    const itemKey = navItem.id
    if (itemKeys.has(itemKey)) return NextResponse.json({ error: 'Navbar item keys must be unique.' }, { status: 400 })
    itemKeys.add(itemKey)
    items.push({ key: itemKey, id: uuidPattern.test(navItem.id) ? navItem.id : null, label: navItem.label, slug: navItem.slug, item_type: navItem.type === 'mega' ? 'mega_menu' : 'direct_link', linked_category_id: navItem.type === 'mega' ? navItem.linkedCategoryId ?? null : null, direct_link_url: navItem.type === 'direct' ? navItem.url ?? '/' : null, display_order: itemIndex + 1, status: navItem.visible ? 'active' : 'hidden' })

    for (const [sectionIndex, navSection] of (navItem.type === 'mega' ? navItem.sections ?? [] : []).entries()) {
      const sectionKey = `${itemKey}:${navSection.id}`
      if (sectionKeys.has(sectionKey)) return NextResponse.json({ error: 'Navbar section keys must be unique.' }, { status: 400 })
      sectionKeys.add(sectionKey)
      const sectionType = mapSectionTypeToDb(navSection.type)
      sections.push({ key: sectionKey, id: uuidPattern.test(navSection.id) ? navSection.id : null, item_key: itemKey, title: navSection.title, icon_svg_path: navSection.iconSvgPath ?? null, section_type: sectionType, source_subcategory_id: sectionType === 'category_list' ? navSection.sourceSubcategoryId : null, source_category_slug: sectionType === 'category_link' ? navSection.sourceCategorySlug ?? null : null, enable_category_link: navSection.enableCategoryLink ?? false, linked_category_id: navSection.linkedCategoryId ?? null, column_number: Math.max(1, navSection.column), show_as_filter: navSection.showAsFilter ?? false, display_order: sectionIndex + 1, status: navItem.visible ? 'active' : 'hidden' })
      for (const [linkIndex, navLink] of navSection.links.entries()) links.push({ id: navLink.id ?? null, section_key: sectionKey, label: navLink.label, url: navLink.url, display_order: linkIndex + 1, status: navItem.visible ? 'active' : 'hidden' })
      for (const [sourceIndex, navSource] of (navSection.selectedSourceItems ?? []).entries()) sourceItems.push({ id: navSource.id ?? null, section_key: sectionKey, source_kind: navSource.sourceKind, source_item_id: navSource.sourceItemId, sort_order: navSource.sortOrder || sourceIndex + 1, is_active: navSource.isActive })
    }
    if (navItem.type === 'mega') {
      const card = navItem.featuredImage ?? { enabled: false, imageUrl: '', buttonLabel: '', buttonUrl: '', imageAlt: navItem.label }
      featuredCards.push({ id: card.id ?? null, item_key: itemKey, image_path: card.imageUrl || null, image_alt: card.imageAlt || navItem.label, button_label: card.buttonLabel || null, button_url: card.buttonUrl || null, enabled: card.enabled })
    }
  }

  const { data, error } = await navbarMutation(access, 'navbar_save_v1', { p_request_id: parsed.data.request_id, p_expected_revision: parsed.data.expected_revision, p_items: items, p_sections: sections, p_links: links, p_source_items: sourceItems, p_featured_cards: featuredCards, p_deleted_section_ids: deleted.sections, p_deleted_link_ids: deleted.links, p_deleted_source_item_ids: ('provider' in access ? deleted.source_items : deleted.source_items.map(Number)), p_deleted_featured_card_ids: deleted.featured_cards })
  if (error) return navbarSaveErrorResponse(error)
  return NextResponse.json({ ok: true, revision: (data as { revision?: string } | null)?.revision }, { headers: { 'Cache-Control': 'no-store' } })
}

const itemEnvelope = z.object({
  request_id: uuid,
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  item,
  deleted_ids: z.object({ sections: z.array(uuid).max(500), links: z.array(uuid).max(2_000), source_items: z.array(bigintId).max(5_000), featured_cards: z.array(uuid).max(10) }).strict(),
}).strict()

/** Saves one navbar item only. Other menu items are intentionally outside this transaction. */
export async function saveNavbarItem(access: Access, itemId: string, input: unknown) {
  if (!uuidPattern.test(itemId)) return NextResponse.json({ error: 'Invalid navbar item.' }, { status: 400 })
  const parsed = itemEnvelope.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid navbar save request.' }, { status: 400 })
  if (parsed.data.item.id !== itemId) return NextResponse.json({ error: 'Navbar item does not match this edit route.' }, { status: 400 })
  const deleted = parsed.data.deleted_ids
  if (![deleted.sections, deleted.links, deleted.source_items, deleted.featured_cards].every(unique)) return NextResponse.json({ error: 'Deleted navbar IDs must be unique.' }, { status: 400 })

  const navItem = normalizeNavbarItemForSave(parsed.data.item)
  const sections: Record<string, unknown>[] = []
  const links: Record<string, unknown>[] = []
  const sourceItems: Record<string, unknown>[] = []
  for (const [sectionIndex, navSection] of (navItem.type === 'mega' ? navItem.sections ?? [] : []).entries()) {
    const sectionKey = navSection.id
    const sectionType = mapSectionTypeToDb(navSection.type)
    sections.push({ key: sectionKey, id: uuidPattern.test(navSection.id) ? navSection.id : null, title: navSection.title, icon_svg_path: navSection.iconSvgPath ?? null, section_type: sectionType, source_subcategory_id: sectionType === 'category_list' ? navSection.sourceSubcategoryId : null, source_category_slug: sectionType === 'category_link' ? navSection.sourceCategorySlug ?? null : null, enable_category_link: navSection.enableCategoryLink ?? false, linked_category_id: navSection.linkedCategoryId ?? null, column_number: Math.max(1, navSection.column), show_as_filter: navSection.showAsFilter ?? false, display_order: sectionIndex + 1, status: navItem.visible ? 'active' : 'hidden' })
    for (const [linkIndex, navLink] of navSection.links.entries()) links.push({ id: navLink.id ?? null, section_key: sectionKey, label: navLink.label, url: navLink.url, display_order: linkIndex + 1, status: navItem.visible ? 'active' : 'hidden' })
    for (const [sourceIndex, navSource] of (navSection.selectedSourceItems ?? []).entries()) sourceItems.push({ id: navSource.id ?? null, section_key: sectionKey, source_kind: navSource.sourceKind, source_item_id: navSource.sourceItemId, sort_order: navSource.sortOrder || sourceIndex + 1, is_active: navSource.isActive })
  }
  const itemRow = { id: itemId, label: navItem.label, slug: navItem.slug, item_type: navItem.type === 'mega' ? 'mega_menu' : 'direct_link', linked_category_id: navItem.type === 'mega' ? navItem.linkedCategoryId ?? null : null, direct_link_url: navItem.type === 'direct' ? navItem.url ?? '/' : null, status: navItem.visible ? 'active' : 'hidden' }
  const card = navItem.featuredImage ?? { enabled: false, imageUrl: '', buttonLabel: '', buttonUrl: '', imageAlt: navItem.label }
  const featured = { id: card.id ?? null, image_path: card.imageUrl || null, image_alt: card.imageAlt || navItem.label, button_label: card.buttonLabel || null, button_url: card.buttonUrl || null, enabled: card.enabled }
  const { data, error } = await navbarMutation(access, 'navbar_item_save_v1', { p_request_id: parsed.data.request_id, p_expected_revision: parsed.data.expected_revision, p_item_id: itemId, p_item: itemRow, p_sections: sections, p_links: links, p_source_items: sourceItems, p_featured_card: featured, p_deleted_section_ids: deleted.sections, p_deleted_link_ids: deleted.links, p_deleted_source_item_ids: ('provider' in access ? deleted.source_items : deleted.source_items.map(Number)), p_deleted_featured_card_ids: deleted.featured_cards })
  if (error) return navbarSaveErrorResponse(error)
  return NextResponse.json({ ok: true, revision: (data as { revision?: string } | null)?.revision }, { headers: { 'Cache-Control': 'no-store' } })
}
