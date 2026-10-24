import { NextResponse } from 'next/server'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createHomeOffersRepository } from '@/lib/db/admin-repositories/home-offers'
import { REVISION_HEADER } from '@/lib/revision'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const rdsOnly = () => NextResponse.json({ error: 'Offers need the AWS database.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: Request) {
  return withOperationsRoute(request, async (access) => {
    if (!isOperationsRds(access)) return rdsOnly()
    const repository = createHomeOffersRepository(access.db)
    return Response.json({ items: await repository.list(), coupons: await repository.coupons() })
  })
}

/** Creates an offer, or updates one when the body carries its id (and the revision header the editor opened). */
export async function POST(request: Request) {
  return withOperationsRoute(request, async (access) => {
    if (!isOperationsRds(access)) return rdsOnly()
    const body = await request.json().catch(() => null)
    const isUpdate = typeof body === 'object' && body !== null && 'id' in body && (body as { id?: unknown }).id !== undefined
    const item = await createHomeOffersRepository(access.db).save(body, isUpdate ? request.headers.get(REVISION_HEADER) ?? '' : undefined)
    return Response.json({ success: true, item })
  })
}
