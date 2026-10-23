import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { readCmsReference } from '@/lib/cms-reference-data'
import { loadCmsDocsSnapshot, saveCmsDocs } from '@/lib/cms-docs-save'

export const dynamic = 'force-dynamic'
const allowedSlugs = new Set(['terms', 'privacy-policy', 'shipping', 'returns'])

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!allowedSlugs.has(slug)) return NextResponse.json({ error: 'Docs page not found.' }, { status: 404 })
  return withCmsDataRoute(_request, async access => {
    const snapshot = await loadCmsDocsSnapshot(cmsReader(access), slug)
    if (snapshot.response) return snapshot.response
    if (slug !== 'returns') return NextResponse.json(snapshot.data)
    const categories = await readCmsReference(cmsReader(access), 'faqCategories')
    return NextResponse.json({ ...snapshot.data, faqCategories: categories.data })
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return withCmsDataRoute(request, async access => {
  const { slug } = await params
  if (!allowedSlugs.has(slug)) return NextResponse.json({ error: 'Docs page not found.' }, { status: 404 })
  return saveCmsDocs(access, slug, await request.json().catch(() => null))

  })
}

export const runtime = 'nodejs'
