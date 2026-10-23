import { withOperationsRoute } from '@/lib/operations-route'
import { createEnquiriesRepository } from '@/lib/db/admin-repositories/enquiries'
export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function GET(request: Request) {
  return withOperationsRoute(request,async access=>{
const p=new URL(request.url).searchParams;return Response.json(await createEnquiriesRepository(access.db).contactPage(Number(p.get('page')??'1'),Number(p.get('pageSize')??'25')))

  })
}
