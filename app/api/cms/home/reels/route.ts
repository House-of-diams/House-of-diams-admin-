import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader, cmsMutation, readCms } from '@/lib/cms-command'
import { reelsSaveError, reelsSaveSchema } from '@/lib/cms-reels-save'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  const { data, error } = await readCms(cmsReader(access), 'cms_reels_snapshot_v1', {})
  if (error) {
    const failure = reelsSaveError(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const parsed = reelsSaveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'Save'}: ${issue.message}`).join(' '),
    }, { status: 400 })
  }
  const { request_id, expected_revision, deleted_ids, items, ...section } = parsed.data
  const { data, error } = await cmsMutation(access, 'cms_save_reels_v1', {
    p_request_id: request_id,
    p_expected_revision: expected_revision,
    p_section: section,
    p_items: items,
    p_deleted_ids: deleted_ids,
  })
  if (error) {
    const failure = reelsSaveError(error)
    return NextResponse.json({ error: failure.message }, { status: failure.status })
  }
  return NextResponse.json({ ok: true, ...data }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'
