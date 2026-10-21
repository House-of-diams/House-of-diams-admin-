import { NextResponse } from 'next/server'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createOfferSectionRepository, offerSectionRevision } from '@/lib/db/admin-repositories/offer-section'
import { REVISION_HEADER } from '@/lib/revision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const rdsOnly = () => NextResponse.json({ error: 'The Offer Section needs the AWS database.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  return withOperationsRoute(request, async (access) => {
    if (!isOperationsRds(access)) return rdsOnly()
    const item = await createOfferSectionRepository(access.db).read()
    return Response.json({ item, revision: offerSectionRevision(item) })
  })
}

export async function POST(request: Request) {
  return withOperationsRoute(request, async (access) => {
    if (!isOperationsRds(access)) return rdsOnly()
    return Response.json(await createOfferSectionRepository(access.db).save(await request.json().catch(() => null), request.headers.get(REVISION_HEADER) ?? ''))
  })
}
