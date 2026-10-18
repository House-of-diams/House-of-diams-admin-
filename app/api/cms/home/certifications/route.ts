import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader, readCms } from '@/lib/cms-command'
import { readHomeGroup1Envelope, saveHomeGroup1 } from '@/lib/cms-home-group1-save'

type CertificationItem = { id?: number; title: string; description?: string; badge?: string; icon_path: string }

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  const { data, error } = await readCms(cmsReader(access), 'cms_home_group1_snapshot_v1', { p_kind: 'certifications' })
  if (error) return NextResponse.json({ error: 'Unable to load Certifications.' }, { status: 503 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  const body = await request.json().catch(() => null) as Record<string, any> | null
  if (!body || !body.section || !Array.isArray(body.items)
    || typeof body.section.eyebrow !== 'string' || typeof body.section.heading !== 'string') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  }
  const envelope = readHomeGroup1Envelope(body)
  if (!envelope) return NextResponse.json({ error: 'This editor is out of date. Reload it before saving.' }, { status: 409 })
  const valid = body.items.every((item: Partial<CertificationItem>) =>
    item && (typeof item.id === 'undefined' || Number.isSafeInteger(item.id))
    && typeof item.title === 'string' && typeof item.icon_path === 'string'
    && (typeof item.description === 'undefined' || typeof item.description === 'string')
    && (typeof item.badge === 'undefined' || typeof item.badge === 'string'))
  if (!valid) return NextResponse.json({ error: 'Every certification row must be valid.' }, { status: 400 })
  const items = (body.items as CertificationItem[]).map((item) => ({
    ...(item.id ? { id: item.id } : {}), title: item.title.trim(),
    description: item.description?.trim() ?? '', badge: item.badge?.trim() ?? '', icon_path: item.icon_path.trim(),
  }))
  return saveHomeGroup1(access, 'certifications', envelope, {
    eyebrow: body.section.eyebrow.trim(), heading: body.section.heading.trim(),
  }, items)

  })
}

export const runtime = 'nodejs'
