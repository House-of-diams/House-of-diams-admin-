import type { DbExecutor } from './db/query'
import { createNavbarRepository } from './db/admin-repositories/navbar'
import { loadRdsProductBootstrap } from './db/admin-repositories/product-bootstrap'
import {
  buildFallbackNavbarItems,
  buildNavbarItemsFromRows,
  syncNavbarItemsWithCatalog,
  type NavbarBuilderPayload,
} from './navbar'
import type { CatalogCategory } from './product-catalog'

export type NavbarSnapshot = {
  items: Parameters<typeof buildNavbarItemsFromRows>[0]['items']
  sections: Parameters<typeof buildNavbarItemsFromRows>[0]['sections']
  links: Parameters<typeof buildNavbarItemsFromRows>[0]['sectionLinks']
  source_items: Parameters<typeof buildNavbarItemsFromRows>[0]['sectionSourceItems']
  featured_cards: Parameters<typeof buildNavbarItemsFromRows>[0]['featuredCards']
  revision: string
  item_revisions?: Record<string, string>
}

/** Authorized executor only; all reference/snapshot failures deny rather than empty success. */
export async function loadRdsNavbarBuilderData(db: DbExecutor): Promise<NavbarBuilderPayload> {
  const references = await loadRdsProductBootstrap(db, 'all')
  const repo = createNavbarRepository(db)
  const snapshot = await repo.execute('navbar_snapshot_v1', {}) as NavbarSnapshot
  const { categories = [], subcategories = [], options = [], metals = [], stoneShapes = [], ringSizes = [], certificates = [], styles = [] } = references as NavbarBuilderPayload
  const builtItems = snapshot.items.length
    ? buildNavbarItemsFromRows({ items: snapshot.items, sections: snapshot.sections, sectionLinks: snapshot.links, sectionSourceItems: snapshot.source_items, featuredCards: snapshot.featured_cards, categories, subcategories, options, metals, stoneShapes, ringSizes, certificates, styles })
    : buildFallbackNavbarItems(categories, subcategories, options)
  const itemRevisions: Record<string, string> = {}
  for (const entry of snapshot.items) {
    const item = await repo.execute('navbar_item_snapshot_v1', { p_item_id: entry.id }) as { revision: string }
    itemRevisions[entry.id] = item.revision
  }
  // B2 uses READ COMMITTED. Refuse mixed content/revisions if another editor
  // changed the menu between the full snapshot and item revision reads.
  const confirmed = await repo.execute('navbar_snapshot_v1', {})
  if (confirmed.revision !== snapshot.revision) throw new Error('Navbar changed during loading')
  return { revision: snapshot.revision, itemRevisions, items: syncNavbarItemsWithCatalog(builtItems, categories, subcategories, options), categories, subcategories, options, metals, stoneShapes, ringSizes, certificates, styles }
}
