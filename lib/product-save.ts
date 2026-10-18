import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductPayload } from '@/lib/product-payload-validation'
import { normalizeProductCustomDropdowns } from '@/lib/product-custom-dropdowns'

type ProductSaveParams = {
  actorId: string
  productId?: string | null
  slug?: string | null
  payload: ProductPayload
}

export function prepareProductSavePayload(
  payload: ProductPayload,
  basePrice: number,
  metalIds: string[],
): ProductPayload {
  return {
    ...payload,
    base_price: basePrice,
    metal_ids: metalIds,
    custom_dropdowns: normalizeProductCustomDropdowns(payload.custom_dropdowns).map((group, groupIndex) => ({
      ...group,
      display_order: groupIndex,
      options: group.options.map((option, optionIndex) => ({ ...option, display_order: optionIndex })),
    })),
  }
}

export async function saveProductAtomically(adminClient: SupabaseClient, params: ProductSaveParams) {
  return adminClient.rpc('admin_product_save_v1', {
    p_actor_id: params.actorId,
    p_product_id: params.productId ?? null,
    p_slug: params.slug ?? null,
    p_payload: params.payload,
  })
}
