import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { readCmsReference } from '@/lib/cms-reference-data'
import { saveCmsArticle } from '@/lib/cms-article-save'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  const { data, error } = await readCmsReference(cmsReader(access), 'education')
  if (error) return NextResponse.json({ error: 'Unable to load education posts.' }, { status: 500 })
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  return saveCmsArticle(access, 'education', null, await request.json().catch(() => null))

  })
}

export const runtime = 'nodejs'
