import { z } from 'zod'

export const siteSettingsSchema = z.object({
  whatsapp_number: z.string().trim().max(20).regex(/^\d*$/, 'WhatsApp number must contain digits only.'),
  default_gst_slab_id: z.string().uuid().nullable(),
  maintenance_mode_enabled: z.boolean(),
  maintenance_mode_message: z.string().trim().min(1, 'Maintenance message is required.').max(2_000),
  estimated_delivery_text: z.string().trim().min(1, 'Estimated delivery text is required.').max(240),
}).strict()

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.').max(256),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long.').max(256),
  confirmPassword: z.string().min(1, 'Confirm password is required.').max(256),
}).strict().superRefine((value, context) => {
  if (value.newPassword !== value.confirmPassword) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'New password and confirm password do not match.' })
  }
  if (value.newPassword === value.currentPassword) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['newPassword'], message: 'New password must be different from the current password.' })
  }
})

export function settingsDatabaseError(error: { code?: string; message?: string }) {
  if (error.code === '23503') return { status: 400, message: 'The selected GST slab is no longer available.' }
  if (['22023', '22P02', '23502', '23514'].includes(error.code ?? '')) return { status: 400, message: 'The settings details are invalid.' }
  return { status: 500, message: 'Unable to save settings.' }
}
