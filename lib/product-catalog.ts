export type CatalogStatus = 'active' | 'hidden'
export type ProductStatus = 'draft' | 'active' | 'hidden' | 'archived'
export type WeddingGender = 'for_her' | 'for_him' | null
export type CategoryCode = string

export type ProductKeyValue = {
  key: string
  value: string
}

export type ProductDetailSection = {
  id: string
  title: string
  rows: ProductKeyValue[]
  visible: boolean
}

export type ProductFaqItem = {
  id?: string
  product_id?: string
  question: string
  answer: string
  sort_order: number
  is_active: boolean
  source?: 'admin' | 'google_sheet' | string
}

export type CatalogCategory = {
  id: string
  _revision?: string
  code: CategoryCode
  name: string
  slug: string
  is_system_locked?: boolean
  category_lane?: 'standard' | 'hiphop' | 'collection' | null
  show_in_nav?: boolean
  nav_type: 'mega_menu' | 'direct_link' | null
  direct_link_url: string | null
  banner_desktop_image_path?: string | null
  banner_mobile_image_path?: string | null
  banner_desktop_image_alt?: string | null
  banner_mobile_image_alt?: string | null
  banner_title?: string | null
  banner_subtitle?: string | null
  banner_cta_label?: string | null
  banner_cta_link?: string | null
  banner_enabled?: boolean
  display_order: number
  status: CatalogStatus
}

export type CatalogNavbarItem = {
  id: string
  label: string
  slug: string
  item_type: 'mega_menu' | 'direct_link'
  linked_category_id: string | null
  direct_link_url: string | null
  status: CatalogStatus
}

export type CatalogSubcategory = {
  id: string
  _revision?: string
  category_id: string
  name: string
  slug: string
  sub_type: 'standard' | 'auto_shape' | 'manual_style' | 'auto_metal' | 'gender_split'
  show_on_category_page?: boolean
  icon_svg_path?: string | null
  image_path?: string | null
  image_alt?: string | null
  display_order: number
  status: CatalogStatus
}

export type CatalogOption = {
  id: string
  _revision?: string
  subcategory_id: string
  name: string
  slug: string
  show_on_category_page?: boolean
  icon_svg_path?: string | null
  image_path?: string | null
  image_alt?: string | null
  display_order: number
  status: CatalogStatus
}

export type CatalogMetal = {
  id: string
  name: string
  slug: string
  purity_label?: string | null
  base_metal_name?: string | null
  display_label?: string | null
  is_combined_option?: boolean
  color_hex?: string | null
  composition_description?: string | null
  display_order: number
  status: CatalogStatus
  composition_parts?: MetalCompositionPart[]
}

export type MetalCompositionPart = {
  id?: number | string
  metal_id?: string
  part_name: string
  percentage: number
  color_hex?: string | null
  sort_order: number
}

export type CatalogMaterialValue = {
  id: string
  _revision?: string
  name: string
  slug: string
  cta_mode?: 'both' | 'enquire_only' | 'checkout_only'
  cta_label?: string | null
  display_order: number
  status: CatalogStatus
}

export type ProductPurityPrice = {
  id?: string
  product_id?: string
  purity_label: string
  price: number
  compare_at_price?: number | null
  sort_order: number
}

export type ProductMetalMedia = {
  id?: string
  product_id?: string
  metal_id: string
  image_1_path?: string | null
  image_2_path?: string | null
  image_3_path?: string | null
  image_4_path?: string | null
  video_path?: string | null
  is_default_fallback?: boolean
}

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

export type CatalogStoneShape = {
  id: string
  _revision?: string
  name: string
  slug: string
  svg_asset_url: string | null
  display_order: number
  status: CatalogStatus
}

export type CatalogRingSize = {
  id: string
  _revision?: string
  name: string
  slug: string
  display_order: number
  status: CatalogStatus
}

export type CatalogRingCategory = {
  id: string
  _revision?: string
  name: string
  slug: string
  description?: string | null
  display_order: number
  status: CatalogStatus
}

export type CatalogRingCategorySize = {
  id: string
  _revision?: string
  ring_category_id: string
  size_label: string
  size_value?: string | null
  display_order: number
  status: CatalogStatus
}

export type CatalogCertificate = {
  id: string
  _revision?: string
  name: string
  code?: string | null
  slug?: string | null
  display_order?: number | null
  status?: CatalogStatus
}

export type CatalogStyle = {
  id: string
  _revision?: string
  name: string
  icon_svg_path?: string | null
  display_order: number
  status: CatalogStatus
}

export type CatalogGstSlab = {
  id: string
  _revision?: string
  name: string
  code: string
  percentage: number
  description?: string | null
  display_order?: number | null
  status?: CatalogStatus
}

export type ProductContentRule = {
  id: string
  _revision?: string
  kind: 'shipping' | 'care_warranty'
  name: string
  slug: string
  title: string
  body: string
  display_order?: number | null
  status?: CatalogStatus
}

export type ProductRecord = {
  id: string
  name: string
  slug: string
  sku: string
  product_lane?: 'standard' | 'hiphop' | 'collection'
  detail_template?: 'standard' | 'hiphop'
  main_category_id: string
  subcategory_id: string | null
  option_id: string | null
  style_id?: string | null
  wedding_gender: WeddingGender
  description: string | null
  tag_line: string | null
  seo_title?: string | null
  seo_description?: string | null
  h1_title?: string | null
  base_price: number | null
  default_purity_price_id?: string | null
  discount_price: number | null
  gst_slab_id?: string | null
  featured: boolean
  status: ProductStatus
  image_1_path?: string | null
  image_2_path?: string | null
  image_3_path?: string | null
  image_4_path?: string | null
  image_1_alt?: string | null
  image_2_alt?: string | null
  image_3_alt?: string | null
  image_4_alt?: string | null
  video_path?: string | null
  model_3d_url?: string | null
  show_image_1?: boolean | null
  show_image_2?: boolean | null
  show_image_3?: boolean | null
  show_image_4?: boolean | null
  show_video?: boolean | null
  stock_quantity?: number | null
  custom_order_enabled?: boolean | null
  ready_to_ship?: boolean | null
  hiphop_badges?: string[] | null
  chain_length_options?: string[] | null
  hiphop_carat_label?: string | null
  hiphop_carat_values?: string[] | null
  gram_weight_label?: string | null
  gram_weight_value?: string | null
  features?: string[] | null
  purity_values?: string[] | null
  certificate_ids?: string[] | null
  ring_size_ids?: string[] | null
  ring_enabled?: boolean | null
  ring_category_id?: string | null
  fit_options?: string[] | null
  fit_label?: string | null
  gemstone_label?: string | null
  gemstone_value?: string | null
  material_value_ids?: string[] | null
  shapes_enabled?: boolean | null
  show_purity?: boolean | null
  engraving_enabled?: boolean | null
  engraving_label?: string | null
  shipping_rule_id?: string | null
  care_warranty_rule_id?: string | null
  shipping_enabled?: boolean | null
  care_warranty_enabled?: boolean | null
  shipping_override_enabled?: boolean | null
  care_warranty_override_enabled?: boolean | null
  shipping_title_override?: string | null
  shipping_body_override?: string | null
  care_warranty_title_override?: string | null
  care_warranty_body_override?: string | null
  specifications?: ProductKeyValue[] | null
  product_details?: ProductKeyValue[] | null
  detail_sections?: ProductDetailSection[] | null
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function formatCategoryPath(args: {
  category: CatalogCategory | undefined
  subcategory?: CatalogSubcategory | undefined
  option?: CatalogOption | undefined
}) {
  const { category, subcategory, option } = args
  if (!category) return ''

  return [category.name, subcategory?.name, option?.name].filter(Boolean).join(' > ')
}
