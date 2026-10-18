import { NextResponse } from 'next/server'
import { cmsMutation, readCms, type CmsAccess, type CmsReader } from './cms-command'
import { readCmsSaveEnvelope } from './cms-atomic-save'

export type CmsContentListKind = 'about_values' | 'about_timeline' | 'about_founders' | 'contact_info' | 'bespoke_process' | 'bespoke_manufacturing'
type Access = CmsAccess

export { readCmsSaveEnvelope }

export async function loadCmsContentListSnapshot(
  client: CmsReader,
  kind: CmsContentListKind,
) {
  const { data, error } = await readCms(client, 'cms_content_list_snapshot_v1', { p_kind: kind })
  if (error) {
    throw new Error(error.code === 'PGRST202' || error.code === '42883'
      ? 'This CMS section is awaiting its database migration.'
      : 'Unable to load this CMS section.')
  }
  return data as { items: Array<Record<string, unknown>>; revision: string }
}

export async function saveCmsContentList(
  access: Access,
  kind: CmsContentListKind,
  envelope: { requestId: string; revision: string; deletedIds: string[] },
  items: Array<Record<string, unknown>>,
) {
  const retainedIds = items.flatMap((item) => item.id == null ? [] : [String(item.id)])
  if (new Set(retainedIds).size !== retainedIds.length) {
    return NextResponse.json({ error: 'The same saved item cannot appear more than once.' }, { status: 400 })
  }
  if (envelope.deletedIds.some((id) => retainedIds.includes(id))) {
    return NextResponse.json({ error: 'An item cannot be retained and deleted in the same save.' }, { status: 400 })
  }
  const { data, error } = await cmsMutation(access, 'cms_save_content_list_v1', {
    p_request_id: envelope.requestId,
    p_expected_revision: envelope.revision,
    p_kind: kind,
    p_items: items,
    p_deleted_ids: envelope.deletedIds,
  })

  if (!error) return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'no-store' } })
  return contentListError(error)
}

export function contentListError(error: {code?:string}) {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return NextResponse.json({ error: 'This CMS section is awaiting its database update. Existing content was not changed.' }, { status: 503 })
  }
  if (error.code === '40001') return NextResponse.json({ error: 'This section changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (error.code === '22023' || error.code === '22P02' || error.code === '23503' || error.code === '23514') {
    return NextResponse.json({ error: 'The section contains invalid or conflicting data.' }, { status: 400 })
  }
  return NextResponse.json({ error: 'Unable to save this section. No part of the save was committed.' }, { status: 500 })
}
