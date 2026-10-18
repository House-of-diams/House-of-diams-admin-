import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cmsMutation, readCms, type CmsAccess, type CmsReader } from './cms-command'

type Access = CmsAccess


const optionalText = (max: number) => z.string().max(max).nullish().transform((value) => value ?? '')
const uuid = z.string().uuid()
const status = z.enum(['active', 'hidden'])

const settingsSchema = z.object({
  id: uuid.optional(),
  intro_heading: optionalText(500),
  intro_subtitle: optionalText(10_000),
  footer_note: optionalText(10_000),
  status,
}).strict()

const rowSchema = z.object({
  id: uuid.optional(),
  label: z.string().trim().min(1).max(500),
  display_order: z.coerce.number().int().min(0).max(1_000_000),
  status,
}).strict()

const listsSchema = z.object({
  guarantees: z.array(rowSchema).max(500),
  pieceTypes: z.array(rowSchema).max(500),
  stoneOptions: z.array(rowSchema).max(500),
  caratOptions: z.array(rowSchema).max(500),
  metalOptions: z.array(rowSchema).max(500),
}).strict()

const deletedSchema = z.object({
  guarantees: z.array(uuid).max(500),
  pieceTypes: z.array(uuid).max(500),
  stoneOptions: z.array(uuid).max(500),
  caratOptions: z.array(uuid).max(500),
  metalOptions: z.array(uuid).max(500),
}).strict()

const envelopeSchema = z.object({
  request_id: uuid,
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  settings: z.record(z.string(), z.unknown()),
  lists: z.record(z.string(), z.unknown()),
  deleted_ids: z.record(z.string(), z.unknown()),
}).strict()

export type BespokeFormRow = z.infer<typeof rowSchema>
export type BespokeFormSettings = z.infer<typeof settingsSchema>
export type BespokeFormSnapshot = z.infer<typeof listsSchema> & {
  settings: BespokeFormSettings
  revision: string
}

export async function loadBespokeFormSnapshot(client: CmsReader) {
  const { data, error } = await readCms(client, 'bespoke_form_snapshot_v1', {})
  if (error) {
    throw new Error(
      error.code === 'PGRST202' || error.code === '42883'
        ? 'The Bespoke form is awaiting its database migration.'
        : 'Unable to load the Bespoke form configuration.'
    )
  }
  return data as BespokeFormSnapshot
}

export function saveErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return NextResponse.json(
      { error: 'The Bespoke form is awaiting its database update. Existing content was not changed.' },
      { status: 503 }
    )
  }
  if (error.code === '40001') return NextResponse.json({ error: 'The Bespoke form changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (error.code === '42501') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error.code ?? '')) {
    return NextResponse.json({ error: 'The Bespoke form contains invalid or conflicting data.' }, { status: 400 })
  }
  return NextResponse.json(
    { error: 'Unable to save the Bespoke form. No partial changes were committed.' },
    { status: 500 }
  )
}

export async function saveBespokeForm(access: Access, input: unknown) {
  const envelope = envelopeSchema.safeParse(input)
  if (!envelope.success) {
    return NextResponse.json(
      { error: envelope.error.issues[0]?.message ?? 'Invalid Bespoke form request.' },
      { status: 400 }
    )
  }

  const settings = settingsSchema.safeParse(envelope.data.settings)
  if (!settings.success) {
    return NextResponse.json(
      { error: settings.error.issues[0]?.message ?? 'Invalid Bespoke form settings.' },
      { status: 400 }
    )
  }
  const lists = listsSchema.safeParse(envelope.data.lists)
  if (!lists.success) {
    return NextResponse.json(
      { error: lists.error.issues[0]?.message ?? 'Invalid Bespoke form option.' },
      { status: 400 }
    )
  }
  const deletedIds = deletedSchema.safeParse(envelope.data.deleted_ids)
  if (!deletedIds.success) {
    return NextResponse.json(
      { error: deletedIds.error.issues[0]?.message ?? 'Invalid deleted option ID.' },
      { status: 400 }
    )
  }

  for (const key of Object.keys(lists.data) as Array<keyof typeof lists.data>) {
    const retained = lists.data[key].flatMap((row) => row.id ? [row.id] : [])
    const deleted = deletedIds.data[key]
    if (
      new Set(retained).size !== retained.length
      || new Set(deleted).size !== deleted.length
      || retained.some((id) => deleted.includes(id))
    ) {
      return NextResponse.json(
        { error: 'Option IDs must be unique and cannot also be deleted.' },
        { status: 400 }
      )
    }
  }

  const { data, error } = await cmsMutation(access, 'bespoke_form_save_v1', {
    p_request_id: envelope.data.request_id,
    p_expected_revision: envelope.data.expected_revision,
    p_settings: settings.data,
    p_lists: lists.data,
    p_deleted_ids: deletedIds.data,
  })
  if (error) return saveErrorResponse(error)

  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
