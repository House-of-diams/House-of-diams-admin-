import type { DbExecutor } from './db/query'
import { createNavbarRepository } from './db/admin-repositories/navbar'
import { loadRdsProductBootstrap } from './db/admin-repositories/product-bootstrap'
import type { SupabaseClient } from '@supabase/supabase-js'
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

export async function loadNavbarBuilderData(client: SupabaseClient): Promise<NavbarBuilderPayload> {
  const [categoriesResult, subcategoriesResult, optionsResult, metalsResult, stoneShapesResult, ringSizesResult, certificatesResult, stylesResult, snapshotResult] = await Promise.all([
    client.from('catalog_categories').select('*').order('display_order', { ascending: true }),
    client.from('catalog_subcategories').select('*').order('display_order', { ascending: true }),
    client.from('catalog_options').select('*').order('display_order', { ascending: true }),
    client.from('catalog_metals').select('*').order('display_order', { ascending: true }),
    client.from('catalog_stone_shapes').select('*').order('display_order', { ascending: true }),
    client.from('catalog_ring_sizes').select('*').order('display_order', { ascending: true }),
    client.from('catalog_certificates').select('*').order('display_order', { ascending: true }),
    client.from('catalog_styles').select('*').order('display_order', { ascending: true }),
    client.rpc('navbar_snapshot_v1'),
  ])

  const error = categoriesResult.error || subcategoriesResult.error || optionsResult.error || metalsResult.error || stoneShapesResult.error || ringSizesResult.error || certificatesResult.error || stylesResult.error || snapshotResult.error
  if (error) {
    if (snapshotResult.error?.code === 'PGRST202' || snapshotResult.error?.code === '42883') throw new Error('The navbar editor is awaiting its database migration.')
    throw new Error('Unable to load the navbar editor.')
  }

  const categories = (categoriesResult.data ?? []) as CatalogCategory[]
  const subcategories = subcategoriesResult.data ?? []
  const options = optionsResult.data ?? []
  const metals = metalsResult.data ?? []
  const stoneShapes = stoneShapesResult.data ?? []
  const ringSizes = ringSizesResult.data ?? []
  const certificates = certificatesResult.data ?? []
  const styles = stylesResult.data ?? []
  const snapshot = snapshotResult.data as NavbarSnapshot
  const builtItems = snapshot.items.length
    ? buildNavbarItemsFromRows({
        items: snapshot.items,
        sections: snapshot.sections,
        sectionLinks: snapshot.links,
        sectionSourceItems: snapshot.source_items,
        featuredCards: snapshot.featured_cards,
        categories,
        subcategories,
        options,
        metals,
        stoneShapes,
        ringSizes,
        certificates,
        styles,
      })
    : buildFallbackNavbarItems(categories, subcategories, options)

  const itemRevisionResults = await Promise.all(
    snapshot.items.map((entry) => client.rpc('navbar_item_snapshot_v1', { p_item_id: entry.id }))
  )
  const itemRevisionError = itemRevisionResults.find((entry) => entry.error)?.error
  if (itemRevisionError) {
    if (itemRevisionError.code === 'PGRST202' || itemRevisionError.code === '42883') throw new Error('The navbar editor is awaiting its database migration.')
    throw new Error('Unable to load the navbar editor.')
  }
  const itemRevisions = Object.fromEntries(
    snapshot.items.map((entry, index) => [entry.id, ((itemRevisionResults[index].data as { revision?: string } | null)?.revision ?? '')])
  )

  return {
    revision: snapshot.revision,
    itemRevisions,
    items: syncNavbarItemsWithCatalog(builtItems, categories, subcategories, options),
    categories,
    subcategories,
    options,
    metals,
    stoneShapes,
    ringSizes,
    certificates,
    styles,
  }
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
