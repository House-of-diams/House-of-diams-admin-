import type {
  ProductDetailSection,
  ProductFaqItem,
  ProductKeyValue,
  ProductMetalMedia,
  ProductPurityPrice,
  ProductRecord,
} from '@/lib/product-catalog'
import type { ProductCustomDropdown } from '@/lib/product-custom-dropdowns'
import type { ProductMetalVariant, ProductVariantMediaItem } from '@/lib/product-metal-variants'

export type ProductEditorItem = ProductRecord & {
  linked_subcategory_ids?: string[] | null
  linked_option_ids?: string[] | null
  metal_ids?: string[] | null
  material_value_ids?: string[] | null
  shape_ids?: string[] | null
  purity_prices?: ProductPurityPrice[] | null
  metal_media?: ProductMetalMedia[] | null
  metal_variants?: ProductMetalVariant[] | null
  default_variant_media_items?: ProductVariantMediaItem[] | null
  faq_items?: ProductFaqItem[] | null
  custom_dropdowns_enabled?: boolean | null
  custom_dropdowns?: ProductCustomDropdown[] | null
  allow_checkout?: boolean | null
}

const emptyRow = (): ProductKeyValue => ({ key: '', value: '' })

const emptySection = (): ProductDetailSection => ({
  id: 'new-section-1',
  title: '',
  rows: [emptyRow()],
  visible: true,
})

export function getProductEditorCacheKey(productLookupUrl: string) {
  return `product-edit:${productLookupUrl}`
}

export function normalizeProductEditorItem(item?: ProductEditorItem | null) {
  const purityValues = item?.purity_values ?? []
  const purityPrices = item?.purity_prices?.length
    ? item.purity_prices
    : purityValues.map((value, index) => ({
        id: `legacy-${index}-${value.toLowerCase().replace(/\s+/g, '-')}`,
        purity_label: value,
        price: 0,
        compare_at_price: null,
        sort_order: index + 1,
      }))
  const metalVariants = item?.metal_variants ?? []
  const imagePaths = [
    item?.image_1_path ?? null,
    item?.image_2_path ?? null,
    item?.image_3_path ?? null,
    item?.image_4_path ?? null,
  ]

  return {
    name: item?.name ?? '',
    sku: item?.sku ?? '',
    productLane: item?.product_lane ?? ('standard' as const),
    detailTemplate: item?.detail_template ?? ('standard' as const),
    featured: Boolean(item?.featured),
    basePrice: item?.base_price?.toString() ?? '',
    discountPrice: item?.discount_price?.toString() ?? '',
    gstSlabId: item?.gst_slab_id ?? '',
    stockQuantity: String(item?.stock_quantity ?? 0),
    allowCheckout: Boolean(item?.allow_checkout),
    description: item?.description ?? '',
    tagLine: item?.tag_line ?? '',
    seoTitle: item?.seo_title ?? '',
    seoDescription: item?.seo_description ?? '',
    h1Title: item?.h1_title ?? '',
    mainCategoryId: item?.main_category_id ?? '',
    subcategoryId: item?.subcategory_id ?? '',
    optionId: item?.option_id ?? '',
    linkedSubcategoryIds: item?.linked_subcategory_ids ?? [],
    linkedOptionIds: item?.linked_option_ids ?? [],
    styleId: item?.style_id ?? '',
    selectedMetalIds: metalVariants.length
      ? metalVariants.map((entry) => entry.metal_id)
      : (item?.metal_ids ?? []),
    selectedPurities: purityValues,
    purityPrices,
    defaultPurityPriceId: item?.default_purity_price_id ?? '',
    metalMedia: item?.metal_media ?? [],
    metalVariants,
    defaultVariantMediaItems: item?.default_variant_media_items ?? [],
    selectedCertificateIds: item?.certificate_ids ?? [],
    ringSizesEnabled: Boolean(item?.ring_enabled),
    ringCategoryId: item?.ring_category_id ?? '',
    fitLabel: item?.fit_label ?? 'Fit',
    fitOptions: item?.fit_options ?? [],
    fitEnabled: (item?.fit_options ?? []).length > 0,
    gemstoneLabel: item?.gemstone_label ?? '',
    gemstoneValues: item?.gemstone_value
      ? item.gemstone_value.split(',').map((value) => value.trim()).filter(Boolean)
      : [],
    selectedMaterialValueIds: item?.material_value_ids ?? [],
    shapesEnabled: Boolean(item?.shapes_enabled),
    selectedShapeIds: item?.shape_ids ?? [],
    engravingEnabled: Boolean(item?.engraving_enabled),
    engravingLabel: item?.engraving_label ?? 'Complimentary Engraving',
    customDropdownsEnabled: Boolean(item?.custom_dropdowns_enabled),
    customDropdowns: item?.custom_dropdowns ?? [],
    shippingEnabled: item?.shipping_enabled ?? true,
    careWarrantyEnabled: item?.care_warranty_enabled ?? true,
    shippingOverrideEnabled: Boolean(item?.shipping_override_enabled),
    careWarrantyOverrideEnabled: Boolean(item?.care_warranty_override_enabled),
    shippingRuleId: item?.shipping_rule_id ?? '',
    careWarrantyRuleId: item?.care_warranty_rule_id ?? '',
    shippingTitleOverride: item?.shipping_title_override ?? '',
    shippingBodyOverride: item?.shipping_body_override ?? '',
    careWarrantyTitleOverride: item?.care_warranty_title_override ?? '',
    careWarrantyBodyOverride: item?.care_warranty_body_override ?? '',
    features: item?.features ?? [],
    specifications: item?.specifications?.length ? item.specifications : [emptyRow()],
    productDetails: item?.product_details?.length ? item.product_details : [emptyRow()],
    detailSections: item?.detail_sections?.length ? item.detail_sections : [emptySection()],
    faqItems: item?.faq_items?.length ? item.faq_items : [],
    imagePaths,
    imageSlots: imagePaths.map((path) => path ?? ''),
    imageAlts: [
      item?.image_1_alt ?? '',
      item?.image_2_alt ?? '',
      item?.image_3_alt ?? '',
      item?.image_4_alt ?? '',
    ],
    videoPath: item?.video_path ?? null,
    model3dUrl: item?.model_3d_url ?? '',
    showImageSlots: [
      item?.show_image_1 ?? true,
      item?.show_image_2 ?? true,
      item?.show_image_3 ?? true,
      item?.show_image_4 ?? true,
    ],
    showVideo: item?.show_video ?? true,
    customOrderEnabled: Boolean(item?.custom_order_enabled),
    readyToShip: Boolean(item?.ready_to_ship),
    hiphopBadges: item?.hiphop_badges ?? [],
    chainLengthOptions: item?.chain_length_options ?? [],
    hiphopCaratLabel: item?.hiphop_carat_label ?? 'Diamond Carat',
    hiphopCaratValues: item?.hiphop_carat_values ?? [],
    gramWeightLabel: item?.gram_weight_label ?? 'Gram Weight',
    gramWeightValue: item?.gram_weight_value ?? '',
  }
}

export type NormalizedProductEditorItem = ReturnType<typeof normalizeProductEditorItem>
