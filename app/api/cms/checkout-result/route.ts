import { resolveStoredImage } from '@/lib/image-reference'
import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'

import { loadCmsRelationalSnapshot, saveCmsRelational } from '@/lib/cms-relational-save'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
  try {
    const snapshot = await loadCmsRelationalSnapshot(cmsReader(access), 'checkout_result')
    const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
    const parent = snapshot.parent
    const url = (path: unknown) => typeof path === 'string' ? resolveStoredImage(path, bucket) ?? '' : ''
    return NextResponse.json({ page: parent ? { ...parent, main_banner_image_url: url(parent.main_banner_image_path), secondary_banner_image_url: url(parent.secondary_banner_image_path) } : null, states: snapshot.items, revision: snapshot.revision }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return NextResponse.json({ error: 'Unable to load Checkout Result content.' }, { status: 503 }) }

  })
}
export async function POST(request:Request){
  return withCmsDataRoute(request, async access => {return saveCmsRelational(access,'checkout_result',await request.json().catch(()=>null))
  })
}

export const runtime = 'nodejs'
