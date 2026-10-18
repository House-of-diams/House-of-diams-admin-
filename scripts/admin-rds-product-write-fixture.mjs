// Isolated synthetic draft, with no existing product IDs or media references.
export function productWriteFixture(categoryId, suffix) {
  const body = {}
  for (const key of ['description','tag_line','seo_title','seo_description','h1_title',
    'discount_price','gst_slab_id','subcategory_id','option_id','style_id',
    'default_purity_price_id','ring_category_id','fit_label','gemstone_label','gemstone_value',
    'engraving_label','shipping_rule_id','care_warranty_rule_id','shipping_title_override',
    'shipping_body_override','care_warranty_title_override','care_warranty_body_override',
    'image_1_path','image_2_path','image_3_path','image_4_path',
    'image_1_alt','image_2_alt','image_3_alt','image_4_alt','video_path','model_3d_url',
    'hiphop_carat_label','gram_weight_label','gram_weight_value']) body[key] = null
  for (const key of ['linked_subcategory_ids','linked_option_ids','metal_ids','metal_variants',
    'default_variant_media_items','purity_values','purity_prices','metal_media','certificate_ids',
    'ring_size_ids','fit_options','material_value_ids','shape_ids','custom_dropdowns',
    'features','specifications','product_details','detail_sections','faq_items',
    'hiphop_badges','chain_length_options','hiphop_carat_values']) body[key] = []
  for (const key of ['featured','allow_checkout','ring_enabled','shapes_enabled','show_purity',
    'engraving_enabled','custom_dropdowns_enabled','shipping_enabled','care_warranty_enabled',
    'shipping_override_enabled','care_warranty_override_enabled','show_image_1','show_image_2',
    'show_image_3','show_image_4','show_video','custom_order_enabled','ready_to_ship']) body[key] = false
  return { ...body, name: 'AWS Migration Probe ' + suffix, sku: 'AWS-PROBE-' + suffix,
    product_lane: 'standard', detail_template: 'standard', status: 'draft',
    main_category_id: categoryId, base_price: 1, stock_quantity: 0 }
}
