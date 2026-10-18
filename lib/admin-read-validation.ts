import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must use YYYY-MM-DD format.').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Enter a valid calendar date.')

export const notificationReadSchema = z.object({
  notificationKey: z.string().trim().max(100).regex(/^(order|bespoke|contact|product|newsletter):[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid notification key.'),
}).strict()

export const bespokeSubmissionQuerySchema = z.object({
  from: z.union([isoDate, z.literal('')]).optional(),
  to: z.union([isoDate, z.literal('')]).optional(),
  q: z.string().trim().max(200).optional(),
}).strict().superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'The end date must be on or after the start date.' })
  }
})

export function notificationWriteError(error: { code?: string; message?: string } | null) {
  if (error?.code === 'PGRST205' || error?.message?.includes('schema cache') || error?.message?.includes('does not exist')) {
    return { status: 503, message: 'Notification read-tracking is not enabled yet.' }
  }
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error?.code ?? '')) {
    return { status: 400, message: 'Unable to update this notification.' }
  }
  return { status: 500, message: 'Unable to update notification status.' }
}
