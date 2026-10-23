import type { ProductPayload } from '@/lib/product-payload-validation'
import { normalizeProductCustomDropdowns } from '@/lib/product-custom-dropdowns'

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

