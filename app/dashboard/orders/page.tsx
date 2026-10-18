import { operationsPage } from '@/lib/operations-page-data'
import { createOrdersRepository } from '@/lib/db/admin-repositories/orders'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
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

async function legacygetOrdersPage(page: number): Promise<OrdersResponse> {
  const adminClient = createSupabaseAdminClient()
  const safePage = Math.max(1, page)
  const from = (safePage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const [ordersResult, countResult] = await Promise.all([
    adminClient
      .from('orders')
      .select('id, order_number, customer_first_name, customer_last_name, customer_email, total_amount, payment_status, status, created_at')
      .order('created_at', { ascending: false })
      .range(from, to),
    adminClient.from('orders').select('id', { count: 'exact', head: true }),
  ])

  if (ordersResult.error) {
    throw new Error('Unable to load orders.')
  }

  const orderRows = (ordersResult.data ?? []) as unknown as OrderDatabaseRow[]
  const ids = orderRows.map((order) => order.id)
  const itemsResult = ids.length
    ? await adminClient.from('order_items').select('order_id').in('order_id', ids)
    : { data: [], error: null }

  if (itemsResult.error) {
    throw new Error('Unable to load order items.')
  }

  const itemCountMap = new Map<string, number>()
  for (const row of itemsResult.data ?? []) {
    itemCountMap.set(row.order_id, (itemCountMap.get(row.order_id) ?? 0) + 1)
  }

  return {
    items: orderRows.map((order) => ({
      id: order.id,
      orderNumber: order.order_number || 'Order',
      customer: [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ') || order.customer_email,
      customerEmail: order.customer_email,
      total: Number(order.total_amount || 0),
      paymentStatus: order.payment_status || 'pending',
      status: normalizeOrderStatus(order.status),
      createdAt: order.created_at,
      items: itemCountMap.get(order.id) ?? 0,
    })),
    page: safePage,
    pageSize: PAGE_SIZE,
    total: countResult.count ?? 0,
    totalPages: Math.max(1, Math.ceil((countResult.count ?? 0) / PAGE_SIZE)),
  }
}

export default async function OrdersPage() {
  const initialData = await getOrdersPage(1)
  return <OrdersClient initialData={initialData} />
}

async function getOrdersPage(page:number):Promise<OrdersResponse> {return operationsPage(db=>createOrdersRepository(db).list(page),()=>legacygetOrdersPage(page))}
