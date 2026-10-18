import type { SupabaseClient } from '@supabase/supabase-js'

function isMissingRelation(error: { message?: string | null } | null | undefined, table: string) {
  return (
    error?.message?.includes(`relation "${table}" does not exist`) ||
    error?.message?.includes(`Could not find the table 'public.${table}' in the schema cache`)
  ) ?? false
}

function uniqueOrderedIds(ids: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
  }

  return ordered
}

export function buildResolvedLinkedIds(primaryId: string | null | undefined, linkedIds: Array<string | null | undefined>) {
  return uniqueOrderedIds([primaryId, ...linkedIds])
}

export async function replaceProductSubcategoryLinks(
  adminClient: SupabaseClient,
  productId: string,
  primarySubcategoryId: string | null | undefined,
  linkedSubcategoryIds: Array<string | null | undefined>
) {
  const resolvedIds = buildResolvedLinkedIds(primarySubcategoryId, linkedSubcategoryIds)

  const deleteResult = await adminClient.from('product_subcategory_links').delete().eq('product_id', productId)
  if (deleteResult.error && !isMissingRelation(deleteResult.error, 'product_subcategory_links')) {
    return { error: deleteResult.error }
  }

  if (resolvedIds.length < 1) {
    return { ok: true }
  }

  const insertResult = await adminClient.from('product_subcategory_links').insert(
    resolvedIds.map((subcategoryId, index) => ({
      product_id: productId,
      subcategory_id: subcategoryId,
      is_primary: Boolean(primarySubcategoryId) && subcategoryId === primarySubcategoryId,
      sort_order: index + 1,
    }))
  )

  if (insertResult.error && !isMissingRelation(insertResult.error, 'product_subcategory_links')) {
    return { error: insertResult.error }
  }

  return { ok: true }
}

export async function replaceProductOptionLinks(
  adminClient: SupabaseClient,
  productId: string,
  primaryOptionId: string | null | undefined,
  linkedOptionIds: Array<string | null | undefined>
) {
  const resolvedIds = buildResolvedLinkedIds(primaryOptionId, linkedOptionIds)

  const deleteResult = await adminClient.from('product_option_links').delete().eq('product_id', productId)
  if (deleteResult.error && !isMissingRelation(deleteResult.error, 'product_option_links')) {
    return { error: deleteResult.error }
  }

  if (resolvedIds.length < 1) {
    return { ok: true }
  }

  const insertResult = await adminClient.from('product_option_links').insert(
    resolvedIds.map((optionId, index) => ({
      product_id: productId,
      option_id: optionId,
      is_primary: Boolean(primaryOptionId) && optionId === primaryOptionId,
      sort_order: index + 1,
    }))
  )

  if (insertResult.error && !isMissingRelation(insertResult.error, 'product_option_links')) {
    return { error: insertResult.error }
  }

  return { ok: true }
}

export async function loadProductLinkSelections(adminClient: SupabaseClient, productId: string) {
  const [subcategoryLinksResult, optionLinksResult] = await Promise.all([
    adminClient
      .from('product_subcategory_links')
      .select('subcategory_id, is_primary, sort_order')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true }),
    adminClient
      .from('product_option_links')
      .select('option_id, is_primary, sort_order')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true }),
  ])

  const linkedSubcategoryIds =
    subcategoryLinksResult.error && isMissingRelation(subcategoryLinksResult.error, 'product_subcategory_links')
      ? []
      : (subcategoryLinksResult.data ?? [])
          .filter((entry: { subcategory_id: string; is_primary?: boolean | null }) => !entry.is_primary)
          .map((entry: { subcategory_id: string }) => entry.subcategory_id)

  const linkedOptionIds =
    optionLinksResult.error && isMissingRelation(optionLinksResult.error, 'product_option_links')
      ? []
      : (optionLinksResult.data ?? [])
          .filter((entry: { option_id: string; is_primary?: boolean | null }) => !entry.is_primary)
          .map((entry: { option_id: string }) => entry.option_id)

  return { linkedSubcategoryIds, linkedOptionIds }
}
