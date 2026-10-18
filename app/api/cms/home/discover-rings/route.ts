import { readCmsDataProvider } from '@/lib/cms-provider'
import { cmsErrorResponse } from '@/lib/cms-rds-handlers'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'

type DiscoverItem = {
  sort_order: number
  title: string
  description: string
  image_path: string
  image_alt?: string
  target_kind?: string
  target_id?: string
}

const tableName = 'discover_rings_items'

export async function GET(request: Request) {
  try { if (readCmsDataProvider(process.env) === 'rds') return NextResponse.json({ error: 'This editor has been removed.' }, { status: 410 }) } catch (error) { return cmsErrorResponse(error) }
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { data, error } = await access.adminClient
    .from(tableName)
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: 'Unable to load Discover Rings.' }, { status: 503 })
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  try { if (readCmsDataProvider(process.env) === 'rds') return NextResponse.json({ error: 'This editor has been removed.' }, { status: 410 }) } catch (error) { return cmsErrorResponse(error) }
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  const items = body.items.filter((item: DiscoverItem) => {
    return (
      typeof item.sort_order === 'number' &&
      typeof item.title === 'string' &&
      typeof item.description === 'string' &&
      typeof item.image_path === 'string' &&
      (typeof item.target_kind === 'undefined' || typeof item.target_kind === 'string') &&
      (typeof item.target_id === 'undefined' || typeof item.target_id === 'string')
    )
  }) as DiscoverItem[]

  const { error: deleteError } = await access.adminClient.from(tableName).delete().gte('sort_order', 0)
  if (deleteError) return NextResponse.json({ error: 'Unable to save Discover Rings. Existing content may be unchanged.' }, { status: 500 })

  if (items.length > 0) {
    const rows = items.map((item) => ({
      sort_order: item.sort_order,
      title: item.title,
      description: item.description,
      image_path: item.image_path,
      image_alt: item.image_alt || item.title,
      target_kind: item.target_kind || null,
      target_id: item.target_id || null,
      status: 'active',
    }))

    const { error: insertError } = await access.adminClient.from(tableName).insert(rows)
    if (insertError) return NextResponse.json({ error: 'Unable to finish saving Discover Rings.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const runtime = 'nodejs'
