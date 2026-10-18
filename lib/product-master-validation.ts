import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ProductMasterValidationPayload = {
  main_category_id?: string | null
  subcategory_id?: string | null
  linked_subcategory_ids?: string[]
  option_id?: string | null
  linked_option_ids?: string[]
  style_id?: string | null
  gst_slab_id?: string | null
  metal_ids?: string[]
  metal_variants?: Array<{ metal_id?: string | null }>
  certificate_ids?: string[]
  ring_enabled?: boolean
  ring_category_id?: string | null
  material_value_ids?: string[]
  shape_ids?: string[]
  shipping_rule_id?: string | null
  care_warranty_rule_id?: string | null
}

type ValidationResult = { ok: true } | { ok: false; message: string }

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}

function invalid(label: string): ValidationResult {
  return {
    ok: false,
    message: `${label} no longer exists in master data. Please refresh the product form and choose a valid value.`,
  }
}

async function loadRowsByIds<T extends { id: string }>(adminClient: SupabaseClient, table: string, ids: string[], columns: string) {
  if (ids.length < 1) return { rows: [] as T[], error: null }
  const { data, error } = await adminClient.from(table).select(columns).in('id', ids)
  return { rows: (data ?? []) as unknown as T[], error }
}

export type ProductMasterRowLoader = <T extends { id: string }>(table: string, ids: string[], columns: string) => Promise<{ rows: T[]; error: unknown }>

async function validateSimpleIds(load: ProductMasterRowLoader, table: string, ids: string[], label: string) {
  const { rows, error } = await load<{ id: string }>(table, ids, 'id')
  if (error) return { ok: false, message: 'Unable to validate the selected master data.' } as ValidationResult
  return rows.length === ids.length ? ({ ok: true } as ValidationResult) : invalid(label)
}

export async function validateProductMasterRows(
  load: ProductMasterRowLoader,
  payload: ProductMasterValidationPayload
): Promise<ValidationResult> {
  const categoryId = payload.main_category_id?.trim()
  if (!categoryId) return invalid('Selected category')

  const categoryCheck = await validateSimpleIds(load, 'catalog_categories', [categoryId], 'Selected category')
  if (!categoryCheck.ok) return categoryCheck

  const subcategoryIds = uniqueStrings([payload.subcategory_id, ...(payload.linked_subcategory_ids ?? [])])
  const { rows: subcategoryRows, error: subcategoryError } = await load<{ id: string; category_id: string }>(
    'catalog_subcategories',
    subcategoryIds,
    'id, category_id'
  )
  if (subcategoryError) return { ok: false, message: 'Unable to validate the selected subcategories.' }
  if (subcategoryRows.length !== subcategoryIds.length) return invalid('Selected subcategory')
  const primarySubcategory = payload.subcategory_id ? subcategoryRows.find((row) => row.id === payload.subcategory_id) : null
  if (primarySubcategory && primarySubcategory.category_id !== categoryId) {
    return { ok: false, message: 'Selected subcategory does not belong to the selected category. Please refresh and choose again.' }
  }

  const optionIds = uniqueStrings([payload.option_id, ...(payload.linked_option_ids ?? [])])
  const { rows: optionRows, error: optionError } = await load<{ id: string; subcategory_id: string }>(
    'catalog_options',
    optionIds,
    'id, subcategory_id'
  )
  if (optionError) return { ok: false, message: 'Unable to validate the selected options.' }
  if (optionRows.length !== optionIds.length) return invalid('Selected option')
  const primaryOption = payload.option_id ? optionRows.find((row) => row.id === payload.option_id) : null
  if (primaryOption && payload.subcategory_id && primaryOption.subcategory_id !== payload.subcategory_id) {
    return { ok: false, message: 'Selected option does not belong to the selected subcategory. Please refresh and choose again.' }
  }
  const allowedSubcategoryIds = new Set(subcategoryIds)
  const hasMismatchedLinkedOption = optionRows.some((row) => allowedSubcategoryIds.size > 0 && !allowedSubcategoryIds.has(row.subcategory_id))
  if (hasMismatchedLinkedOption) {
    return { ok: false, message: 'One selected option does not belong to the selected subcategory list. Please refresh and choose again.' }
  }

  const validations: Array<Promise<ValidationResult>> = []
  if (payload.style_id) validations.push(validateSimpleIds(load, 'catalog_styles', [payload.style_id], 'Selected style'))
  if (payload.gst_slab_id) validations.push(validateSimpleIds(load, 'catalog_gst_slabs', [payload.gst_slab_id], 'Selected GST slab'))

  const metalIds = uniqueStrings([...(payload.metal_ids ?? []), ...(payload.metal_variants ?? []).map((entry) => entry.metal_id)])
  if (metalIds.length > 0) validations.push(validateSimpleIds(load, 'catalog_metals', metalIds, 'Selected metal'))

  const certificateIds = uniqueStrings(payload.certificate_ids ?? [])
  if (certificateIds.length > 0) validations.push(validateSimpleIds(load, 'catalog_certificates', certificateIds, 'Selected certificate'))

  const materialValueIds = uniqueStrings(payload.material_value_ids ?? [])
  if (materialValueIds.length > 0) validations.push(validateSimpleIds(load, 'catalog_material_values', materialValueIds, 'Selected material value'))

  const shapeIds = uniqueStrings(payload.shape_ids ?? [])
  if (shapeIds.length > 0) validations.push(validateSimpleIds(load, 'catalog_stone_shapes', shapeIds, 'Selected stone shape'))

  if (payload.ring_enabled && payload.ring_category_id) {
    validations.push(validateSimpleIds(load, 'catalog_ring_categories', [payload.ring_category_id], 'Selected ring category'))
  }

  const simpleResults = await Promise.all(validations)
  const firstFailure = simpleResults.find((result) => !result.ok)
  if (firstFailure) return firstFailure

  const contentRuleIds = uniqueStrings([payload.shipping_rule_id, payload.care_warranty_rule_id])
  const { rows: contentRuleRows, error: contentRuleError } = await load<{ id: string; kind: string }>(
    'product_content_rules',
    contentRuleIds,
    'id, kind'
  )
  if (contentRuleError) return { ok: false, message: 'Unable to validate the selected content rules.' }
  if (contentRuleRows.length !== contentRuleIds.length) return invalid('Selected content rule')
  if (payload.shipping_rule_id && contentRuleRows.find((row) => row.id === payload.shipping_rule_id)?.kind !== 'shipping') {
    return { ok: false, message: 'Selected shipping rule is not a shipping rule. Please refresh and choose again.' }
  }
  if (payload.care_warranty_rule_id && contentRuleRows.find((row) => row.id === payload.care_warranty_rule_id)?.kind !== 'care_warranty') {
    return { ok: false, message: 'Selected care and warranty rule is not a care/warranty rule. Please refresh and choose again.' }
  }

  return { ok: true }
}

export async function validateProductMasterReferences(adminClient: SupabaseClient, payload: ProductMasterValidationPayload): Promise<ValidationResult> {
  return validateProductMasterRows((table, ids, columns) => loadRowsByIds(adminClient, table, ids, columns), payload)
}
