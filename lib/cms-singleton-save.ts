import { NextResponse } from 'next/server'
import { z } from 'zod'
import { cmsMutation, readCms, type CmsAccess, type CmsReader } from './cms-command'
import { cmsSingletonItemSchemas, type CmsSingletonKind } from './cms-singleton-schemas'

export type { CmsSingletonKind } from './cms-singleton-schemas'
type Access = CmsAccess

const envelopeSchema = z.object({
  request_id: z.string().uuid(),
  expected_revision: z.string().regex(/^[a-f0-9]{32}$/),
  item: z.record(z.string(), z.unknown()),
}).strict()

export type CmsSingletonSnapshot<T extends Record<string, unknown> = Record<string, unknown>> = { item: T | null; revision: string }

export async function loadCmsSingletonSnapshot<T extends Record<string, unknown>>(client: CmsReader, kind: CmsSingletonKind) {
  const { data, error } = await readCms(client, 'cms_singleton_snapshot_v1', { p_kind: kind })
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883'
    ? 'This CMS section is awaiting its database migration.' : 'Unable to load this CMS section.')
  return data as CmsSingletonSnapshot<T>
}

export function singletonError(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'This CMS section is awaiting its database update. Existing content was not changed.' }, { status: 503 })
  if (error.code === '40001') return NextResponse.json({ error: 'This section changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (['22023', '22P02', '23502', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'The section contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: 'Unable to save this section. No changes were committed.' }, { status: 500 })
}

export async function saveCmsSingleton(access: Access, kind: CmsSingletonKind, input: unknown) {
  const envelope = envelopeSchema.safeParse(input)
  if (!envelope.success) return NextResponse.json({ error: envelope.error.issues[0]?.message ?? 'Invalid save payload.' }, { status: 400 })
  const item = cmsSingletonItemSchemas[kind].safeParse(envelope.data.item)
  if (!item.success) return NextResponse.json({ error: item.error.issues[0]?.message ?? 'Invalid section details.' }, { status: 400 })
  const { data, error } = await cmsMutation(access, 'cms_save_singleton_v1', { p_request_id: envelope.data.request_id, p_expected_revision: envelope.data.expected_revision,
    p_kind: kind, p_item: item.data,
  })
  if (error) return singletonError(error)
  return NextResponse.json({ ok: true, ...(data as object) }, { headers: { 'Cache-Control': 'no-store' } })
}
