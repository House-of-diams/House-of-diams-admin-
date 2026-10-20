import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { loadHomeGroup1Snapshot, saveHomeGroup1 } from '@/lib/cms-home-group1-save'
import { heroSaveSchema } from '@/lib/cms-hero-validation'
import { SAFE_LINK_MESSAGE } from '@/lib/link-validation.ts'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  try {
    return NextResponse.json(await loadHomeGroup1Snapshot(cmsReader(access), 'hero'), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Unable to load the Hero section.' }, { status: 500 })
  }

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const parsed = heroSaveSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    const link = parsed.error.issues.find((issue) => issue.path[0] === 'items' && issue.path[2] === 'button_link')
    if (link) return NextResponse.json({ error: `Slide ${Number(link.path[1]) + 1} button link: ${SAFE_LINK_MESSAGE}` }, { status: 400 })
    return NextResponse.json({ error: 'Invalid Hero section data. Check the fields and reload if this editor is stale.' }, { status: 400 })
  }
  const { request_id, expected_revision, deleted_ids, slider_enabled, seo_title, seo_description, items } = parsed.data
  const normalizedItems = items.map((item, index) => ({
    ...(item.id ? { id: item.id } : {}),
    sort_order: index + 1,
    image_path: item.image_path,
    mobile_image_path: item.mobile_image_path,
    headline: item.headline,
    subtitle: item.subtitle,
    button_text: item.button_text,
    button_link: item.button_link,
  }))
  return saveHomeGroup1(
    access,
    'hero',
    { requestId: request_id, revision: expected_revision, deletedIds: deleted_ids },
    { slider_enabled, seo_title, seo_description },
    normalizedItems,
  )

  })
}

export const runtime = 'nodejs'
