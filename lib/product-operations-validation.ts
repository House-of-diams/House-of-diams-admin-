import { z } from 'zod'

const uuid = z.string().uuid()
const lane = z.enum(['standard', 'hiphop', 'collection'])
const productIds = z.array(uuid).min(1).max(500).superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Product IDs must be unique.' })
  }
})

export const productStatusSchema = z.object({
  status: z.literal('draft'),
  expected_status: z.enum(['active', 'hidden', 'archived']),
}).strict()

export const duplicateProductSchema = z.object({ requestId: uuid }).strict()

export const bulkPriceSchema = z.object({
  requestId: uuid,
  ids: productIds,
  expectedPrices: z.array(z.object({ id: uuid, price: z.number().finite().positive().max(1_000_000_000) }).strict()).min(1).max(500),
  lane,
  operation: z.enum(['increase_amount', 'decrease_amount', 'increase_percent', 'decrease_percent']),
  value: z.number().finite().positive().max(1_000_000_000),
  confirmation: z.literal('ADJUST_BASE_PRICES'),
}).strict().superRefine((value, context) => {
  if (value.operation.endsWith('_percent') && value.value > 1_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Percentage adjustments cannot exceed 1000%.' })
  }
  if (value.operation === 'decrease_percent' && value.value >= 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Percentage decreases must be less than 100%.' })
  }
  const expectedIds = value.expectedPrices.map((item) => item.id)
  if (new Set(expectedIds).size !== expectedIds.length || expectedIds.length !== value.ids.length || value.ids.some((id) => !expectedIds.includes(id))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedPrices'], message: 'Price verification data must contain each selected product exactly once.' })
  }
})

export const bulkDeleteSchema = z.object({
  requestId: uuid,
  ids: productIds,
  lane,
  confirmation: z.literal('DELETE_PRODUCTS'),
}).strict()

export const activateDraftsSchema = z.object({
  requestId: uuid,
  ids: productIds,
  lane,
  confirmation: z.literal('ACTIVATE_DRAFTS'),
}).strict()

export const productMediaSignSchema = z.object({
  folder: z.enum(['products', 'hiphop']),
  contentType: z.literal('image/webp'),
  declaredSize: z.number().int().min(1).max(25 * 1024 * 1024),
  productKey: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/, 'Product media keys may only contain letters, numbers, hyphens, and underscores.'),
}).strict()

export const videoLibraryQuerySchema = z.object({
  refresh: z.enum(['0', '1']).optional(),
}).strict()

export function productVideoContentsMatch(mime: string, buffer: Buffer) {
  if (mime === 'video/webm') return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  if (mime === 'video/mp4' || mime === 'video/quicktime') return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp'
  return false
}

export type ProductOperationError = { code?: string; message?: string }

export function productOperationError(error: ProductOperationError, action: 'status' | 'duplicate' | 'price' | 'delete' | 'activate') {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return { status: 503, message: action === 'duplicate' ? 'Product duplication is awaiting its database migration.' : 'Product operations are awaiting their database migration.' }
  }
  if (error.code === 'P0002') return { status: 404, message: 'One or more selected products were not found.' }
  if (error.code === '40001' || error.code === '23505') return { status: 409, message: 'The selected products changed after you loaded them. Refresh the list and try again.' }
  if (error.code === '23503') return { status: 409, message: action === 'delete' ? 'One or more selected products are still referenced and cannot be deleted.' : 'A selected product dependency is no longer available.' }
  if (error.code === '42501') return { status: 403, message: 'Administrator access is required.' }
  if (['22023', '22P02', '23502', '23514', 'P0001'].includes(error.code ?? '')) return { status: 400, message: 'The product operation is invalid.' }
  const descriptions = {
    status: 'Unable to change the product status.',
    duplicate: 'Unable to duplicate this product. The original product was not changed.',
    price: 'Unable to update product prices. No prices were changed.',
    delete: 'Unable to delete the selected products. No products were deleted.',
    activate: 'Unable to activate the selected drafts. No statuses were changed.',
  }
  return { status: 500, message: descriptions[action] }
}
