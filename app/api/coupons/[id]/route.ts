import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createCouponsRepository } from '@/lib/db/admin-repositories/coupons'
export const runtime='nodejs'
export const dynamic='force-dynamic'
import { deleteCoupon } from '@/lib/coupon-save'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)) return Response.json(await createCouponsRepository(access.db).remove((await params).id))
  const { id } = await params
  return deleteCoupon(access, id)
  })
}
