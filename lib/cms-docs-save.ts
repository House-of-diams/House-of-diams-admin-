import { sanitizeCmsHtml } from './cms-html'
import { NextResponse } from 'next/server'
import { cmsMutation, readCms, type CmsAccess, type CmsReader } from './cms-command'
import { docsSaveSchema } from './cms-docs-schema'
export { docsSaveSchema } from './cms-docs-schema'

type Access = CmsAccess
export function docsError(error: { code?: string; message?: string }, action: 'load' | 'save') {
  if (error.code === 'PGRST202' || error.code === '42883') return NextResponse.json({ error: 'Docs are awaiting their database update. Existing content was not changed.' }, { status: 503 })
  if (error.code === 'P0002') return NextResponse.json({ error: 'Docs page not found.' }, { status: 404 })
  if (error.code === '40001') return NextResponse.json({ error: 'This page changed after you opened it. Reload before saving again.' }, { status: 409 })
  if (['22023', '22P02', '23503', '23505', '23514'].includes(error.code ?? '')) return NextResponse.json({ error: 'The page contains invalid or conflicting data.' }, { status: 400 })
  return NextResponse.json({ error: `Unable to ${action} this page. No partial changes were committed.` }, { status: 500 })
}

export async function loadCmsDocsSnapshot(client: CmsReader, slug: string) {
  const { data, error } = await readCms(client, 'cms_docs_snapshot_v1', { p_slug: slug })
  if (error) return { response: docsError(error, 'load') }
  return { data: data as { page: Record<string, unknown>; blocks: Array<Record<string, unknown>>; revision: string } }
}

export async function saveCmsDocs(access: Access, slug: string, input: unknown) {
  const parsed = docsSaveSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid docs payload.' }, { status: 400 })
  const { data, error } = await cmsMutation(access, 'cms_save_docs_page_v1', {
    p_request_id: parsed.data.request_id,
    p_slug: slug,
    p_expected_revision: parsed.data.expected_revision,
    p_page: parsed.data.page,
    p_blocks: parsed.data.blocks.map(block => ({...block,body:sanitizeCmsHtml(block.body)})),
    p_deleted_block_ids: parsed.data.deleted_block_ids,
  })
  if (error) return docsError(error, 'save')
  return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'no-store' } })
}
