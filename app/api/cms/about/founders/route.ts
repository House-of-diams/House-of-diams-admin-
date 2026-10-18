import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { loadCmsContentListSnapshot, readCmsSaveEnvelope, saveCmsContentList } from '@/lib/cms-content-list-save'
import { cmsContentListSchemas } from '@/lib/cms-content-list-schemas'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  try {
    return NextResponse.json(await loadCmsContentListSnapshot(cmsReader(access), 'about_founders'), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load Founders.' }, { status: 503 })
  }

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  const envelope = readCmsSaveEnvelope(body)
  if (!envelope) return NextResponse.json({ error: 'This editor is out of date. Reload it before saving.' }, { status: 409 })
  const parsed = cmsContentListSchemas.about_founders.safeParse(body.items)
  if (!parsed.success) return NextResponse.json({ error: 'Every founder must be valid.' }, { status: 400 })
  const items = parsed.data.map((item) => ({ ...item, name: item.name.trim(), designation: item.designation.trim(), bio: item.bio.trim(), image_path: item.image_path.trim() }))
  return saveCmsContentList(access, 'about_founders', envelope, items)

  })
}

export const runtime = 'nodejs'
