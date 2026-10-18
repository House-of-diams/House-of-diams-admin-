import { normalizeNavbarItemForSave, type NavbarItem } from './navbar'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const numericPattern = /^[1-9][0-9]*$/

function collectIds(items: NavbarItem[]) {
  const sectionIds: string[] = []
  const linkIds: string[] = []
  const sourceItemIds: string[] = []
  const featuredCardIds: string[] = []

  for (const item of items) {
    if (item.featuredImage?.id && uuidPattern.test(item.featuredImage.id)) featuredCardIds.push(item.featuredImage.id)
    for (const section of item.sections ?? []) {
      if (uuidPattern.test(section.id)) sectionIds.push(section.id)
      for (const link of section.links) if (link.id && uuidPattern.test(link.id)) linkIds.push(link.id)
      for (const source of section.selectedSourceItems ?? []) if (source.id && numericPattern.test(source.id)) sourceItemIds.push(source.id)
    }
  }

  return { sectionIds, linkIds, sourceItemIds, featuredCardIds }
}

function removed(original: string[], current: string[]) {
  const retained = new Set(current)
  return original.filter((id) => !retained.has(id))
}

export function navbarSaveBody(items: NavbarItem[], originalItems: NavbarItem[], expectedRevision: string) {
  const original = collectIds(originalItems)
  const normalizedItems = items.map(normalizeNavbarItemForSave)
  const current = collectIds(normalizedItems)
  return JSON.stringify({
    request_id: crypto.randomUUID(),
    expected_revision: expectedRevision,
    items: normalizedItems,
    deleted_ids: {
      sections: removed(original.sectionIds, current.sectionIds),
      links: removed(original.linkIds, current.linkIds),
      source_items: removed(original.sourceItemIds, current.sourceItemIds),
      featured_cards: removed(original.featuredCardIds, current.featuredCardIds),
    },
  })
}

/** Builds an intentionally item-scoped save request for the dedicated edit route. */
export function navbarItemSaveBody(item: NavbarItem, originalItem: NavbarItem, expectedRevision: string) {
  const original = collectIds([originalItem])
  const normalizedItem = normalizeNavbarItemForSave(item)
  const current = collectIds([normalizedItem])
  return JSON.stringify({
    request_id: crypto.randomUUID(),
    expected_revision: expectedRevision,
    item: normalizedItem,
    deleted_ids: {
      sections: removed(original.sectionIds, current.sectionIds),
      links: removed(original.linkIds, current.linkIds),
      source_items: removed(original.sourceItemIds, current.sourceItemIds),
      featured_cards: removed(original.featuredCardIds, current.featuredCardIds),
    },
  })
}
