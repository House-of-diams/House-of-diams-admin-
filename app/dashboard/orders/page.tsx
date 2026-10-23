import { operationsPage } from '@/lib/operations-page-data'
import { createOrdersRepository } from '@/lib/db/admin-repositories/orders'
import { OrdersClient, type OrdersResponse } from './orders-client'

const PAGE_SIZE = 20
type OrderDatabaseRow = {
  id: string
  order_number: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string
  total_amount: number | string | null
  payment_status: string | null
  status: string
  created_at: string
}

function normalizeOrderStatus(value: string): OrdersResponse['items'][number]['status'] {
  switch (value) {
    case 'processing':
    case 'shipped':
    case 'delivered':
    case 'cancelled':
      return value
    default:
      return 'pending'
  }
}

export default async function OrdersPage() {
  const initialData = await getOrdersPage(1)
  return <OrdersClient initialData={initialData} />
}

async function getOrdersPage(page:number):Promise<OrdersResponse> {return operationsPage(db=>createOrdersRepository(db).list(page))}
