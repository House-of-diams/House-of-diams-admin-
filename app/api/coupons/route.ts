import { withOperationsRoute } from '@/lib/operations-route'
import { createCouponsRepository } from '@/lib/db/admin-repositories/coupons'
import { REVISION_HEADER } from '@/lib/revision'
export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request: Request) {
  return withOperationsRoute(request,async access=>{
const params=new URL(request.url).searchParams;return Response.json(await createCouponsRepository(access.db).list(params.get('page')??1,params.get('q')??''))

  })
}

export async function POST(request: Request) {
  return withOperationsRoute(request,async access=>{
    return Response.json(await createCouponsRepository(access.db).save(await request.json().catch(()=>null),request.headers.get(REVISION_HEADER)??''))

  })
}
