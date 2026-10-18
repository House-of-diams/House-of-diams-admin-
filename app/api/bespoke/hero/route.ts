import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { loadBespokeHeroSnapshot, saveBespokeHero } from '@/lib/bespoke-hero-save'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  try {
    const snapshot = await loadBespokeHeroSnapshot(cmsReader(access))
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load the Bespoke Hero.' }, { status: 503 })
  }

  })
}

export async function PUT(request: Request) {
  return withCmsDataRoute(request, async access => saveBespokeHero(access, await request.json().catch(() => null)))
}

export const runtime = 'nodejs'
