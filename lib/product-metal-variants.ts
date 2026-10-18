import type { CatalogMetal } from '@/lib/product-catalog'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ProductVariantMediaItem = {
  id?: string
  product_id?: string
  variant_id?: string | null
  media_type: 'image' | 'video'
  media_path: string
  alt_text?: string | null
  sort_order: number
  is_default_fallback?: boolean
}

export type ProductMetalVariant = {
  id?: string
  product_id?: string
  metal_id: string
  price: number
  is_default: boolean
  sort_order: number
  media_items?: ProductVariantMediaItem[]
}

function isMissingRelation(error: { message?: string | null } | null | undefined, table: string) {
  return (
    error?.message?.includes(`relation "${table}" does not exist`) ||
    error?.message?.includes(`Could not find the table 'public.${table}' in the schema cache`)
  ) ?? false
}

function normalizeMediaItems(items: ProductVariantMediaItem[] | null | undefined) {
  return (items ?? [])
    .map((item, index) => ({
      id: item.id,
      media_type: item.media_type === 'video' ? 'video' : 'image',
      media_path: item.media_path?.trim() ?? '',
      alt_text: item.alt_text?.trim() || null,
      sort_order: Number(item.sort_order ?? index + 1),
      is_default_fallback: Boolean(item.is_default_fallback),
    }))
    .filter((item) => item.media_path.length > 0)
}

export function buildCombinedMetalDisplayLabel(metal: Pick<CatalogMetal, 'display_label' | 'name' | 'purity_label' | 'base_metal_name'>) {
  const purity = metal.purity_label?.trim()
  const baseMetal = metal.base_metal_name?.trim() || metal.name.trim()
  const displayLabel = metal.display_label?.trim()
  const generatedLabel = (() => {
    if (!purity) return baseMetal

    const normalizedPurity = purity.toLowerCase()
    const normalizedBaseMetal = baseMetal.toLowerCase()
    return normalizedBaseMetal === normalizedPurity || normalizedBaseMetal.startsWith(`${normalizedPurity} `)
      ? baseMetal
      : `${purity} ${baseMetal}`.trim()
  })()

  if (displayLabel && displayLabel !== metal.name.trim() && displayLabel !== baseMetal) {
    return displayLabel
  }
  return generatedLabel
}

export async function replaceProductMetalVariants(
  adminClient: SupabaseClient,
  productId: string,
  variants: ProductMetalVariant[]
) {
  const existingResult = await adminClient
    .from('product_metal_variants')
    .select('id, metal_id')
    .eq('product_id', productId)

  if (existingResult.error && !isMissingRelation(existingResult.error, 'product_metal_variants')) {
    return { error: existingResult.error }
  }

  const nextVariants = variants
    .map((variant, index) => ({
      metal_id: variant.metal_id,
      price: Number(variant.price ?? 0),
      is_default: Boolean(variant.is_default),
      sort_order: Number(variant.sort_order ?? index + 1),
    }))
    .filter((variant) => variant.metal_id)

  if (nextVariants.length < 1) {
    const deleteResult = await adminClient.from('product_metal_variants').delete().eq('product_id', productId)
    if (deleteResult.error && !isMissingRelation(deleteResult.error, 'product_metal_variants')) {
      return { error: deleteResult.error }
    }
    return { data: [] as Array<{ id: string; metal_id: string }> }
  }

  const hasExplicitDefault = nextVariants.some((variant) => variant.is_default)
  const normalizedVariants = nextVariants.map((variant, index) => ({
    ...variant,
    is_default: hasExplicitDefault ? variant.is_default : index === 0,
  }))

  const existingByMetalId = new Map(
    ((existingResult.data ?? []) as Array<{ id: string; metal_id: string }>).map((row) => [row.metal_id, row.id])
  )
  const keepMetalIds = new Set(normalizedVariants.map((variant) => variant.metal_id))
  const deleteIds = ((existingResult.data ?? []) as Array<{ id: string; metal_id: string }>)
    .filter((row) => !keepMetalIds.has(row.metal_id))
    .map((row) => row.id)

  if (deleteIds.length > 0) {
    const deleteResult = await adminClient.from('product_metal_variants').delete().in('id', deleteIds)
    if (deleteResult.error) return { error: deleteResult.error }
  }

  const persisted: Array<{ id: string; metal_id: string }> = []

  for (const variant of normalizedVariants) {
    const existingId = existingByMetalId.get(variant.metal_id)
    if (existingId) {
      const updateResult = await adminClient
        .from('product_metal_variants')
        .update({
          price: variant.price,
          is_default: variant.is_default,
          sort_order: variant.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId)
        .select('id, metal_id')
        .single()
      if (updateResult.error) return { error: updateResult.error }
      persisted.push(updateResult.data)
    } else {
      const insertResult = await adminClient
        .from('product_metal_variants')
        .insert({
          product_id: productId,
          metal_id: variant.metal_id,
          price: variant.price,
          is_default: variant.is_default,
          sort_order: variant.sort_order,
        })
        .select('id, metal_id')
        .single()
      if (insertResult.error) return { error: insertResult.error }
      persisted.push(insertResult.data)
    }
  }

  return { data: persisted }
}

export async function replaceProductVariantMediaItems(
  adminClient: SupabaseClient,
  productId: string,
  params: {
    variants: ProductMetalVariant[]
    defaultMediaItems?: ProductVariantMediaItem[]
    persistedVariantRows: Array<{ id: string; metal_id: string }>
  }
) {
  const existingResult = await adminClient
    .from('product_variant_media_items')
    .select('id')
    .eq('product_id', productId)

  if (existingResult.error && !isMissingRelation(existingResult.error, 'product_variant_media_items')) {
    return { error: existingResult.error }
  }

  const deleteResult = await adminClient.from('product_variant_media_items').delete().eq('product_id', productId)
  if (deleteResult.error && !isMissingRelation(deleteResult.error, 'product_variant_media_items')) {
    return { error: deleteResult.error }
  }

  const variantIdByMetalId = new Map(params.persistedVariantRows.map((row) => [row.metal_id, row.id]))
  const insertRows: Array<Record<string, unknown>> = []

  for (const [index, item] of normalizeMediaItems(params.defaultMediaItems).entries()) {
    insertRows.push({
      product_id: productId,
      variant_id: null,
      media_type: item.media_type,
      media_path: item.media_path,
      alt_text: item.alt_text,
      sort_order: Number(item.sort_order ?? index + 1),
      is_default_fallback: true,
    })
  }

  for (const variant of params.variants) {
    const variantId = variantIdByMetalId.get(variant.metal_id)
    if (!variantId) continue

    for (const [index, item] of normalizeMediaItems(variant.media_items).entries()) {
      insertRows.push({
        product_id: productId,
        variant_id: variantId,
        media_type: item.media_type,
        media_path: item.media_path,
        alt_text: item.alt_text,
        sort_order: Number(item.sort_order ?? index + 1),
        is_default_fallback: false,
      })
    }
  }

  if (insertRows.length < 1) {
    return { ok: true }
  }

  const insertResult = await adminClient.from('product_variant_media_items').insert(insertRows)
  if (insertResult.error) return { error: insertResult.error }
  return { ok: true }
}

export async function loadProductMetalVariantBundle(adminClient: SupabaseClient, productId: string) {
  const [variantsResult, mediaResult] = await Promise.all([
    adminClient
      .from('product_metal_variants')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true }),
    adminClient
      .from('product_variant_media_items')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true }),
  ])

  const variants =
    variantsResult.error && isMissingRelation(variantsResult.error, 'product_metal_variants')
      ? []
      : ((variantsResult.data ?? []) as ProductMetalVariant[])

  const mediaItems =
    mediaResult.error && isMissingRelation(mediaResult.error, 'product_variant_media_items')
      ? []
      : ((mediaResult.data ?? []) as ProductVariantMediaItem[])

  const defaultMediaItems = mediaItems.filter((item) => item.variant_id == null && item.is_default_fallback)

  return {
    metalVariants: variants.map((variant) => ({
      ...variant,
      media_items: mediaItems.filter((item) => item.variant_id === variant.id),
    })),
    defaultVariantMediaItems: defaultMediaItems,
  }
}
