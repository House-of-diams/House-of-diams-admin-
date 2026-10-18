import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { loadHomeGroup1Snapshot, readHomeGroup1Envelope, saveHomeGroup1 } from '@/lib/cms-home-group1-save'

type DiscoverItem = { id?: string; title: string; description: string; image_path: string; image_alt?: string; shape_id?: string }

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  try {
    return NextResponse.json(await loadHomeGroup1Snapshot(cmsReader(access), 'discover_shapes'), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load Discover Shapes.' }, { status: 503 })
  }

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !Array.isArray(body.items)) return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  const envelope = readHomeGroup1Envelope(body)
  if (!envelope) return NextResponse.json({ error: 'This editor is out of date. Reload it before saving.' }, { status: 409 })
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const valid = body.items.every((value) => {
    const item = value as Partial<DiscoverItem>
    return value && typeof value === 'object' && (typeof item.id === 'undefined' || uuid.test(item.id))
      && typeof item.title === 'string' && typeof item.description === 'string' && typeof item.image_path === 'string'
      && (typeof item.image_alt === 'undefined' || typeof item.image_alt === 'string')
      && (typeof item.shape_id === 'undefined' || item.shape_id === '' || uuid.test(item.shape_id))
  })
  if (!valid) return NextResponse.json({ error: 'Every shape card must be valid.' }, { status: 400 })
  const items = (body.items as DiscoverItem[]).map((item) => ({
    ...(item.id ? { id: item.id } : {}), title: item.title.trim(), description: item.description.trim(),
    image_path: item.image_path.trim(), image_alt: item.image_alt?.trim() || item.title.trim(), shape_id: item.shape_id || null,
  }))
  return saveHomeGroup1(access, 'discover_shapes', envelope, null, items)

  })
}

export const runtime = 'nodejs'
