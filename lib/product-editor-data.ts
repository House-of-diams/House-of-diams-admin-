import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductRecord } from '@/lib/product-catalog'
import { loadProductLinkSelections } from '@/lib/product-catalog-links'
import { loadProductCustomDropdowns } from '@/lib/product-custom-dropdowns'
import type { ProductEditorItem } from '@/lib/product-editor'
import { loadProductFaqItems } from '@/lib/product-faqs'
import { loadProductMetalVariantBundle } from '@/lib/product-metal-variants'

type ProductEditorLoadResult =
  | { status: 'found'; item: ProductEditorItem }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

function isMissingRelation(error: { message?: string | null } | null | undefined, table: string) {
  return Boolean(
    error?.message?.includes(`relation "${table}" does not exist`) ||
      error?.message?.includes(`Could not find the table 'public.${table}' in the schema cache`)
  )
}

function optionalRows<T>(
  result: { data: T[] | null; error: { message?: string | null } | null },
  table: string
) {
  if (!result.error || isMissingRelation(result.error, table)) {
    return { data: result.error ? [] : (result.data ?? []) }
  }
  return { error: true as const }
}

export async function loadProductEditorItem(
  adminClient: SupabaseClient,
  lookupValue: string
): Promise<ProductEditorLoadResult> {
  const lookup = lookupValue.trim()
  if (!lookup) return { status: 'not_found' }

  try {
    const slugResult = await adminClient.from('products').select('id').eq('slug', lookup).maybeSingle()
    if (slugResult.error) return { status: 'error', message: 'Unable to load the product.' }

    const idResult = slugResult.data?.id
      ? slugResult
      : await adminClient.from('products').select('id').eq('id', lookup).maybeSingle()

    if (idResult.error) return { status: 'error', message: 'Unable to load the product.' }
    if (!idResult.data?.id) return { status: 'not_found' }

    const id = String(idResult.data.id)
    const [
      productResult,
      metalsResult,
      materialValuesResult,
      purityPricesResult,
      metalMediaResult,
      shapeResult,
      linkSelections,
      metalVariantBundle,
      faqItems,
      customDropdowns,
    ] = await Promise.all([
      adminClient.from('products').select('*').eq('id', id).single(),
      adminClient.from('product_metal_selections').select('metal_id').eq('product_id', id).order('sort_order', { ascending: true }),
      adminClient.from('product_material_value_selections').select('material_value_id').eq('product_id', id).order('sort_order', { ascending: true }),
      adminClient.from('product_purity_prices').select('*').eq('product_id', id).order('sort_order', { ascending: true }),
      adminClient.from('product_metal_media').select('*').eq('product_id', id),
      adminClient.from('product_stone_shapes').select('shape_id').eq('product_id', id),
      loadProductLinkSelections(adminClient, id),
      loadProductMetalVariantBundle(adminClient, id),
      loadProductFaqItems(adminClient, id),
      loadProductCustomDropdowns(adminClient, id),
    ])

    if (productResult.error || !productResult.data || customDropdowns.error) {
      return { status: 'error', message: 'Unable to load the complete product.' }
    }

    const metals = optionalRows(metalsResult, 'product_metal_selections')
    const materialValues = optionalRows(materialValuesResult, 'product_material_value_selections')
    const purityPrices = optionalRows(purityPricesResult, 'product_purity_prices')
    const metalMedia = optionalRows(metalMediaResult, 'product_metal_media')
    const shapes = optionalRows(shapeResult, 'product_stone_shapes')
    if (metals.error || materialValues.error || purityPrices.error || metalMedia.error || shapes.error) {
      return { status: 'error', message: 'Unable to load the complete product.' }
    }

    return {
      status: 'found',
      item: {
        ...(productResult.data as ProductRecord),
        metal_ids: metals.data.map((entry: { metal_id: string }) => entry.metal_id),
        linked_subcategory_ids: linkSelections.linkedSubcategoryIds,
        linked_option_ids: linkSelections.linkedOptionIds,
        material_value_ids: materialValues.data.map((entry: { material_value_id: string }) => entry.material_value_id),
        shape_ids: shapes.data.map((entry: { shape_id: string }) => entry.shape_id),
        purity_prices: purityPrices.data,
        metal_media: metalMedia.data,
        metal_variants: metalVariantBundle.metalVariants,
        default_variant_media_items: metalVariantBundle.defaultVariantMediaItems,
        faq_items: faqItems,
        custom_dropdowns: customDropdowns.data ?? [],
      },
    }
  } catch {
    return { status: 'error', message: 'Unable to load the product.' }
  }
}
