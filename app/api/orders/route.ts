import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
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
  if(isOperationsRds(access)) return Response.json(await createOrdersRepository(access.db).list(Number(new URL(request.url).searchParams.get('page') ?? '1')))

  const { searchParams } = new URL(request.url)
  const parsedPage = z.coerce.number().int().min(1).max(100_000).safeParse(searchParams.get('page') ?? '1')
  if (!parsedPage.success) return NextResponse.json({ error: 'Invalid page number.' }, { status: 400 })
  const page = parsedPage.data
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const [ordersResult, countResult] = await Promise.all([
    access.adminClient.from('orders').select('id, order_number, customer_first_name, customer_last_name, customer_email, total_amount, payment_status, status, created_at').order('created_at', { ascending: false }).range(from, to),
    access.adminClient.from('orders').select('id', { count: 'exact', head: true }),
  ])
  if (ordersResult.error || countResult.error) return NextResponse.json({ error: 'Unable to load orders.' }, { status: 500 })

  const orders = (ordersResult.data ?? []) as OrderListRow[]
  const ids = orders.map((order) => order.id)
  const itemsResult = ids.length ? await access.adminClient.from('order_items').select('order_id').in('order_id', ids) : { data: [], error: null }
  if (itemsResult.error) return NextResponse.json({ error: 'Unable to load order items.' }, { status: 500 })

  const itemCountMap = new Map<string, number>()
  for (const row of itemsResult.data ?? []) itemCountMap.set(row.order_id, (itemCountMap.get(row.order_id) ?? 0) + 1)
  const items = orders.map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    customer: [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ') || order.customer_email,
    customerEmail: order.customer_email,
    total: Number(order.total_amount || 0),
    paymentStatus: order.payment_status || 'pending',
    status: order.status,
    createdAt: order.created_at,
    items: itemCountMap.get(order.id) ?? 0,
  }))

  const total = countResult.count ?? 0
  return NextResponse.json({ items, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }, { headers: { 'Cache-Control': 'no-store' } })
  })
}
