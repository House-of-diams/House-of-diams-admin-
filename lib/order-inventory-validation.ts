import { z } from 'zod'

export const orderStatusSchema = z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])

export const orderStatusUpdateSchema = z.object({
  status: orderStatusSchema,
  expected_status: orderStatusSchema,
  expected_courier_name: z.string().trim().max(200).nullable(),
  expected_courier_awb_number: z.string().trim().max(500).nullable(),
  courier_name: z.string().trim().max(200).nullable(),
  courier_awb_number: z.string().trim().max(500).nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === 'shipped' && !value.courier_name) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['courier_name'], message: 'Courier name is required for shipped orders.' })
  }
  if (value.status === 'shipped' && !value.courier_awb_number) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['courier_awb_number'], message: 'AWB or tracking number is required for shipped orders.' })
  }
})

export const inventoryUpdateSchema = z.object({
  expected_stock: z.number().int().min(0).max(1_000_000_000),
  stock_quantity: z.number().int().min(0).max(1_000_000_000),
  notes: z.string().trim().max(2_000).nullable().optional(),
}).strict()

export function adminMutationError(error: { code?: string; message?: string }, subject: 'order' | 'inventory') {
  if (error.code === 'PGRST202' || error.code === '42883') return { status: 503, message: 'Inventory saving is awaiting its database update. No stock was changed.' }
  if (error.code === '40001') return { status: 409, message: subject === 'order' ? 'This order changed after you opened it. Reload before saving.' : 'This stock level changed after you opened it. Reload before saving.' }
  if (error.code === 'P0002') return { status: 404, message: subject === 'order' ? 'Order not found.' : 'Product not found.' }
  if (['22023', '22P02', '23502', '23503', '23514'].includes(error.code ?? '')) return { status: 400, message: subject === 'order' ? 'The order update is invalid.' : 'The stock update is invalid.' }
  return { status: 500, message: subject === 'order' ? 'Unable to update the order.' : 'Unable to update stock. No changes were applied.' }
}
