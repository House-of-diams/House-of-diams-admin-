import { cache } from 'react'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import type { BootstrapPayload } from '@/components/product-form'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readProductDataProvider } from '@/lib/product-provider'
import { authorizeProductPage } from '@/lib/product-server-request'
import { adminTransaction } from '@/lib/db/pool'
import { loadRdsProductBootstrap } from '@/lib/db/admin-repositories/product-bootstrap'

async function loadOptionalTable<T>(adminClient: SupabaseClient, table: string, columns = '*'): Promise<T[]> {
  const result = await adminClient.from(table).select(columns).order('display_order', { ascending: true })
  if (result.error) return []
  return (result.data ?? []) as unknown as T[]
}

export const getProductFormBasicsBootstrap = cache(async (): Promise<BootstrapPayload> => {
  if (readProductDataProvider(process.env) === 'rds') {
    await authorizeProductPage()
    return adminTransaction(db => loadRdsProductBootstrap(db, 'basics'))
  }
  const adminClient = createSupabaseAdminClient()

  const [categoriesResult, subcategoriesResult, optionsResult, styles] = await Promise.all([
    adminClient.from('catalog_categories').select('id, code, name, slug, category_lane, nav_type, direct_link_url, display_order, status').order('display_order', { ascending: true }),
    adminClient.from('catalog_subcategories').select('id, category_id, name, slug, sub_type, display_order, status').order('display_order', { ascending: true }),
    adminClient.from('catalog_options').select('id, subcategory_id, name, slug, display_order, status').order('display_order', { ascending: true }),
    loadOptionalTable<NonNullable<BootstrapPayload['styles']>[number]>(adminClient, 'catalog_styles', 'id, name, icon_svg_path, display_order, status'),
  ])

  return {
    categories: categoriesResult.data ?? [],
    subcategories: subcategoriesResult.data ?? [],
    options: optionsResult.data ?? [],
    styles,
  }
})
