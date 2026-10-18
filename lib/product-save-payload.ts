import type {
  ProductFaqItem,
  ProductMetalMedia,
  ProductMetalVariant,
  ProductPurityPrice,
  ProductVariantMediaItem,
} from './product-catalog'
import type { ProductCustomDropdown } from './product-custom-dropdowns'

export function serializeProductVariantMediaItems(items: ProductVariantMediaItem[], isDefaultFallback: boolean) {
  return items
    .filter((item) => item.media_path?.trim())
    .map((item, index) => ({
      id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      media_type: item.media_type === 'video' ? 'video' : 'image',
      media_path: item.media_path.trim(),
      alt_text: item.alt_text?.trim() || null,
      sort_order: index + 1,
      is_default_fallback: isDefaultFallback,
    }))
}

export function serializeProductMetalVariants(variants: ProductMetalVariant[]) {
  return variants.map((variant, index) => ({
    id: variant.id,
    product_id: variant.product_id,
    metal_id: variant.metal_id,
    price: Number(variant.price),
    is_default: Boolean(variant.is_default),
    sort_order: index + 1,
    media_items: serializeProductVariantMediaItems(variant.media_items ?? [], false),
  }))
}

export function serializeProductPurityPrices(prices: ProductPurityPrice[]) {
  return prices.map((price, index) => ({
    id: price.id,
    product_id: price.product_id,
    purity_label: price.purity_label,
    price: Number(price.price),
    compare_at_price: price.compare_at_price ?? null,
    sort_order: index + 1,
  }))
}

export function serializeProductMetalMedia(media: ProductMetalMedia[]) {
  return media.map((item) => ({
    id: item.id,
    product_id: item.product_id,
    metal_id: item.metal_id,
    image_1_path: item.image_1_path ?? null,
    image_2_path: item.image_2_path ?? null,
    image_3_path: item.image_3_path ?? null,
    image_4_path: item.image_4_path ?? null,
    video_path: item.video_path ?? null,
    is_default_fallback: Boolean(item.is_default_fallback),
  }))
}

export function serializeProductFaqItems(items: ProductFaqItem[]) {
  return items
    .map((item, index) => ({
      id: item.id,
      product_id: item.product_id,
      question: item.question.trim(),
      answer: item.answer.trim(),
      sort_order: index + 1,
      is_active: item.is_active !== false,
      source: item.source || 'admin',
    }))
    .filter((item) => item.question && item.answer)
}

export function serializeProductCustomDropdowns(groups: ProductCustomDropdown[]) {
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    label: group.label,
    is_enabled: Boolean(group.is_enabled),
    is_required: Boolean(group.is_required),
    display_order: Number(group.display_order),
    options: group.options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      is_enabled: Boolean(option.is_enabled),
      display_order: Number(option.display_order),
    })),
  }))
}
