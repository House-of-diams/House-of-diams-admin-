import { NextResponse } from 'next/server'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createHomeOffersRepository } from '@/lib/db/admin-repositories/home-offers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withOperationsRoute(request, async (access) => {
    if (!isOperationsRds(access)) return NextResponse.json({ error: 'Offers need the AWS database.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    await createHomeOffersRepository(access.db).remove(id)
    return Response.json({ success: true })
  })
}
