import type { ProductFaqItem } from '@/lib/product-catalog'
import type { SupabaseClient } from '@supabase/supabase-js'

function isMissingRelation(error: { message?: string | null } | null | undefined, table: string) {
  return (
    error?.message?.includes(`relation "${table}" does not exist`) ||
    error?.message?.includes(`Could not find the table 'public.${table}' in the schema cache`)
  ) ?? false
}

export async function loadProductFaqItems(adminClient: SupabaseClient, productId: string) {
  const { data, error } = await adminClient
    .from('product_faq_items')
    .select('id, product_id, question, answer, sort_order, is_active, source')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })

  if (error) {
    if (isMissingRelation(error, 'product_faq_items')) return []
    throw error
  }

  return (data ?? []) as ProductFaqItem[]
}

export async function replaceProductFaqItems(adminClient: SupabaseClient, productId: string, items: ProductFaqItem[], source = 'admin') {
  const normalizedRows = items
    .map((item, index) => ({
      question: item.question?.trim() ?? '',
      answer: item.answer?.trim() ?? '',
      sort_order: Number(item.sort_order ?? index + 1),
      is_active: item.is_active !== false,
      source: item.source || source,
    }))
    .filter((item) => item.question && item.answer)
    .map((item, index) => ({
      ...item,
      product_id: productId,
      sort_order: item.sort_order || index + 1,
    }))

  const deleteResult = await adminClient.from('product_faq_items').delete().eq('product_id', productId)
  if (deleteResult.error) {
    if (isMissingRelation(deleteResult.error, 'product_faq_items')) return { ok: true }
    return { error: deleteResult.error }
  }

  if (normalizedRows.length < 1) return { ok: true }

  const insertResult = await adminClient.from('product_faq_items').insert(normalizedRows)
  if (insertResult.error) return { error: insertResult.error }
  return { ok: true }
}
