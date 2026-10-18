import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader, readCms } from '@/lib/cms-command'
import { readHomeGroup1Envelope, saveHomeGroup1 } from '@/lib/cms-home-group1-save'

type CollectionItem = { id?: number; label: string; title: string; description: string; image_path: string; link: string }

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  const { data, error } = await readCms(cmsReader(access), 'cms_home_group1_snapshot_v1', { p_kind: 'collection' })
  if (error) return NextResponse.json({ error: 'Unable to load Collection cards.' }, { status: 503 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  const envelope = readHomeGroup1Envelope(body)
  if (!envelope) return NextResponse.json({ error: 'This editor is out of date. Reload it before saving.' }, { status: 409 })
  const valid = body.items.every((value) => {
    const item = value as Partial<CollectionItem>
    return value && typeof value === 'object'
      && (typeof item.id === 'undefined' || Number.isSafeInteger(item.id))
      && typeof item.label === 'string' && typeof item.title === 'string'
      && typeof item.description === 'string' && typeof item.image_path === 'string' && typeof item.link === 'string'
  })
  if (!valid) return NextResponse.json({ error: 'Every collection card must be valid.' }, { status: 400 })
  const items = (body.items as CollectionItem[]).map((item) => ({
    ...(item.id ? { id: item.id } : {}), label: item.label.trim(), title: item.title.trim(),
    description: item.description.trim(), image_path: item.image_path.trim(), link: item.link.trim(),
  }))
  return saveHomeGroup1(access, 'collection', envelope, null, items)

  })
}

export const runtime = 'nodejs'
