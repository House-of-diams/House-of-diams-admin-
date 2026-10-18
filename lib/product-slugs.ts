import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

import { buildProductSlugBase, getRetiredProductSlug, selectAvailableProductSlug } from '@/lib/product-slug-core'

export async function allocateProductSlug(client: SupabaseClient, name: string) {
  const base = buildProductSlugBase(name)
  const [productsResult, redirectsResult] = await Promise.all([
    client.from('products').select('slug').like('slug', `${base}%`),
    client.from('seo_redirects').select('source_path').like('source_path', `/shop/${base}%`),
  ])

  if (productsResult.error) {
    throw new Error(`Unable to check existing product slugs: ${productsResult.error.message}`)
  }
  if (redirectsResult.error) {
    throw new Error(`Unable to check retired product slugs: ${redirectsResult.error.message}`)
  }

  const unavailable = new Set<string>((productsResult.data ?? []).map((row: { slug: string }) => row.slug))
  for (const redirect of redirectsResult.data ?? []) {
    const retiredSlug = getRetiredProductSlug(String(redirect.source_path || ''))
    if (retiredSlug) unavailable.add(retiredSlug)
  }

  return selectAvailableProductSlug(base, unavailable)
}
