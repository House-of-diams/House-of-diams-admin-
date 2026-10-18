import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createOrdersRepository } from '@/lib/db/admin-repositories/orders'
import { deliverOrderUpdate } from '@/lib/operations-order-mail'
export const runtime='nodejs'
export const dynamic='force-dynamic'
import { sendOrderStatusUpdateEmail } from '@/lib/email'
import { sanitizeLoveLetterHtml } from '@/lib/love-letter-html'
import { adminMutationError, orderStatusUpdateSchema } from '@/lib/order-inventory-validation'

type RouteContext = { params: Promise<{ id: string }> }

async function parseOrderId(context: RouteContext) {
  const { id } = await context.params
  return z.string().uuid().safeParse(id)
}

export async function GET(request: Request, context: RouteContext) {
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)) {
    const id=await parseOrderId(context)
    if(!id.success)return Response.json({error:'Invalid order ID.'},{status:400})
    const repo=createOrdersRepository(access.db,access.actor)
    return Response.json(await repo.detail(id.data))
  }
  const id = await parseOrderId(context)
  if (!id.success) return NextResponse.json({ error: 'Invalid order ID.' }, { status: 400 })

  const [orderResult, itemsResult, loveLetterResult] = await Promise.all([
    access.adminClient.from('orders').select('*').eq('id', id.data).maybeSingle(),
    access.adminClient.from('order_items').select('*').eq('order_id', id.data).order('created_at', { ascending: true }),
    access.adminClient.from('order_love_letters').select('*').eq('order_id', id.data).maybeSingle(),
  ])
  if (orderResult.error || itemsResult.error || loveLetterResult.error) return NextResponse.json({ error: 'Unable to load order details.' }, { status: 500 })
  if (!orderResult.data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  const loveLetter = loveLetterResult.data
    ? { ...loveLetterResult.data, final_letter_html: sanitizeLoveLetterHtml(loveLetterResult.data.final_letter_html) }
    : null
  return NextResponse.json({ order: orderResult.data, items: itemsResult.data ?? [], loveLetter }, { headers: { 'Cache-Control': 'no-store' } })
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)) {
    const id=await parseOrderId(context)
    if(!id.success)return Response.json({error:'Invalid order ID.'},{status:400})
    const repo=createOrdersRepository(access.db,access.actor)
    const update=await repo.update(id.data,await request.json().catch(()=>null))
    if(update.statusChanged){access.afterCommit(()=>deliverOrderUpdate(update,sendOrderStatusUpdateEmail));return Response.json({item:update.item,emailStatus:'pending'})}
    return Response.json({item:update.item,emailStatus:'unchanged'})
  }
  const id = await parseOrderId(context)
  if (!id.success) return NextResponse.json({ error: 'Invalid order ID.' }, { status: 400 })
  const input = orderStatusUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid order update.' }, { status: 400 })

  const [existingOrderResult, itemsResult] = await Promise.all([
    access.adminClient.from('orders').select('id, order_number, customer_email, customer_first_name, customer_last_name, total_amount, created_at, status, courier_name, courier_awb_number, shipped_at, fulfillment_mode').eq('id', id.data).maybeSingle(),
    access.adminClient.from('order_items').select('product_name, quantity, line_total').eq('order_id', id.data).order('created_at', { ascending: true }),
  ])
  if (existingOrderResult.error || itemsResult.error) return NextResponse.json({ error: 'Unable to load the order before updating it.' }, { status: 500 })
  if (!existingOrderResult.data) return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
  if (existingOrderResult.data.status !== input.data.expected_status
      || (existingOrderResult.data.courier_name || null) !== (input.data.expected_courier_name || null)
      || (existingOrderResult.data.courier_awb_number || null) !== (input.data.expected_courier_awb_number || null)) {
    return NextResponse.json({ error: 'This order changed after you opened it. Reload before saving.' }, { status: 409 })
  }

  if (existingOrderResult.data.status === 'cancelled' && input.data.status !== 'cancelled' && existingOrderResult.data.fulfillment_mode !== 'made_to_order') {
    return NextResponse.json({ error: 'Stock-backed cancelled orders cannot be reopened here. A reviewed stock reservation is required.' }, { status: 409 })
  }

  const courierName = input.data.courier_name || null
  const courierAwbNumber = input.data.courier_awb_number || null
  let updateQuery = access.adminClient.from('orders').update({
    status: input.data.status,
    courier_name: courierName,
    courier_awb_number: courierAwbNumber,
    shipped_at: input.data.status === 'shipped' ? existingOrderResult.data.shipped_at ?? new Date().toISOString() : existingOrderResult.data.shipped_at ?? null,
  }).eq('id', id.data).eq('status', input.data.expected_status)
  updateQuery = input.data.expected_courier_name ? updateQuery.eq('courier_name', input.data.expected_courier_name) : updateQuery.is('courier_name', null)
  updateQuery = input.data.expected_courier_awb_number ? updateQuery.eq('courier_awb_number', input.data.expected_courier_awb_number) : updateQuery.is('courier_awb_number', null)
  const { data, error } = await updateQuery.select('id, status, order_number, customer_email, customer_first_name, customer_last_name, total_amount, created_at, courier_name, courier_awb_number, shipped_at').maybeSingle()
  if (error) {
    const safe = adminMutationError(error, 'order')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!data) return NextResponse.json({ error: 'This order changed after you opened it. Reload before saving.' }, { status: 409 })

  if (existingOrderResult.data.status !== input.data.status) {
    try {
      await sendOrderStatusUpdateEmail({
        customerEmail: data.customer_email || '',
        customerName: [data.customer_first_name, data.customer_last_name].filter(Boolean).join(' ') || 'Client',
        orderNumber: data.order_number,
        orderDate: data.created_at,
        totalAmount: Number(data.total_amount || 0),
        status: input.data.status,
        courierName: data.courier_name || null,
        courierAwbNumber: data.courier_awb_number || null,
        shippedAt: data.shipped_at || null,
        items: (itemsResult.data ?? []).map((item) => ({ product_name: item.product_name, quantity: Number(item.quantity || 0), line_total: Number(item.line_total || 0) })),
      })
      return NextResponse.json({ item: data, emailStatus: 'sent' }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (emailError) {
      console.error('Order status email failed:', emailError)
      return NextResponse.json({ item: data, emailStatus: 'failed', emailError: 'The order status changed, but the customer email could not be sent.' }, { headers: { 'Cache-Control': 'no-store' } })
    }
  }
  return NextResponse.json({ item: data, emailStatus: 'unchanged' }, { headers: { 'Cache-Control': 'no-store' } })
  })
}
