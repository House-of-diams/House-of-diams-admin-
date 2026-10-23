import { withOperationsRoute } from '@/lib/operations-route'
import { createOrdersRepository } from '@/lib/db/admin-repositories/orders'
export const runtime='nodejs'
export const dynamic='force-dynamic'

type OrderListRow = {
  id: string
  order_number: string
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string
  total_amount: number | null
  payment_status: string | null
  status: string
  created_at: string
}

const PAGE_SIZE = 20

export async function GET(request: Request) {
  return withOperationsRoute(request,async access=>{
    return Response.json(await createOrdersRepository(access.db).list(Number(new URL(request.url).searchParams.get('page') ?? '1')))

  })
}
