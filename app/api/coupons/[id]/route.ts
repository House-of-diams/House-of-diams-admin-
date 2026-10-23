import { withOperationsRoute } from '@/lib/operations-route'
import { createCouponsRepository } from '@/lib/db/admin-repositories/coupons'
export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOperationsRoute(request,async access=>{
    return Response.json(await createCouponsRepository(access.db).remove((await params).id))

  })
}
