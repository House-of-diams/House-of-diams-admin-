import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { loadCmsSingletonSnapshot, saveCmsSingleton } from '@/lib/cms-singleton-save'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  try {
    return NextResponse.json(await loadCmsSingletonSnapshot(cmsReader(access), 'education_hero'), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load the Education hero.' }, { status: 503 })
  }

  })
}
export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
  return saveCmsSingleton(access, 'education_hero', await request.json().catch(() => null))

  })
}

export const runtime = 'nodejs'
