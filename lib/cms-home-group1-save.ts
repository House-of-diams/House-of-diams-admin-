import { NextResponse } from 'next/server'
import { cmsMutation, readCms, type CmsAccess, type CmsReader } from './cms-command'
import { readCmsSaveEnvelope } from './cms-atomic-save'

export type HomeGroup1Kind = 'hero' | 'collection' | 'certifications' | 'discover_shapes' | 'bestsellers' | 'shop_by_category'
type Access = CmsAccess
type SnapshotRecord = Record<string, unknown>

export async function loadHomeGroup1Snapshot(client: CmsReader, kind: HomeGroup1Kind) {
  const { data, error } = await readCms(client, 'cms_home_group1_snapshot_v1', { p_kind: kind })
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883'
    ? 'This CMS section is awaiting its database migration.' : 'Unable to load this CMS section.')
  return data as { section: SnapshotRecord | null; items: SnapshotRecord[]; revision: string }
}

export const readHomeGroup1Envelope = readCmsSaveEnvelope

export async function saveHomeGroup1(
  access: Access,
  kind: HomeGroup1Kind,
  envelope: { requestId: string; revision: string; deletedIds: string[] },
  section: Record<string, unknown> | null,
  items: Array<Record<string, unknown>>,
) {
  const { data, error } = await cmsMutation(access, 'cms_save_home_group1_v1', {
    p_request_id: envelope.requestId,
    p_expected_revision: envelope.revision,
    p_kind: kind,
    p_section: section,
    p_items: items,
    p_deleted_ids: envelope.deletedIds,
  })
  if (!error) return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'no-store' } })
  return homeGroup1Error(error)
}

export function homeGroup1Error(error: {code?:string}) {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'This CMS section is awaiting its database update. Existing content was not changed.' }, { status: 503 })
  if (error.code === '40001') return NextResponse.json({ error: 'This section changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (error.code === '22023' || error.code === '22P02' || error.code === '23503') return NextResponse.json({ error: 'This section contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: 'Unable to save this section. No part of the save was committed.' }, { status: 500 })
}
