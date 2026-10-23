import type { CatalogMetal } from '@/lib/product-catalog'

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

