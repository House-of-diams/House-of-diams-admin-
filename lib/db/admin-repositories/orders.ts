import 'server-only'
import type { z } from 'zod'
import type { DbExecutor } from '../query'
import type { AdminActor } from '../../auth/admin-identity-core'
import { orderStatusUpdateSchema } from '../../order-inventory-validation'
import { sanitizeLoveLetterHtml } from '../../love-letter-html'
import { jsonRows, OperationsError, pageNumber, safeCount, uuid } from './operations-shared'
import { mapAdminDbError } from '../errors'
export type OrderRecord = {
  id: string; order_number: string; customer_first_name: string | null; customer_last_name: string | null;
  customer_email: string; total_amount: number | string | null; payment_status: string | null;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'; created_at: string;
  courier_name: string | null; courier_awb_number: string | null; shipped_at: string | null;
  fulfillment_mode?: string | null;
}
export type OrderLine = { product_name: string; quantity: number | string; line_total: number | string; [key: string]: unknown }
export function createOrdersRepository(db: DbExecutor, actor?: AdminActor) {
  async function list(page = 1) {
    page = pageNumber(page)
    // One statement snapshot includes exact total even beyond the last page.
    const { rows } = await db.query<{ total: string; items: string }>(`WITH page AS (
      SELECT o.id,o.order_number,o.customer_first_name,o.customer_last_name,o.customer_email,o.total_amount,
      o.payment_status,o.status,o.created_at,(SELECT count(*) FROM public.order_items i WHERE i.order_id=o.id) AS items
      FROM public.orders o ORDER BY o.created_at DESC,o.id DESC LIMIT 20 OFFSET $1::integer)
      SELECT (SELECT count(*)::text FROM public.orders) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC,page.id DESC) FROM page),'[]'::jsonb)::text AS items`, [(page - 1) * 20])
    if (rows.length !== 1) throw new Error('Invalid order list')
    const { parseCmsJson } = await import('../../cms-id-safety')
    const records = parseCmsJson(rows[0].items) as Array<OrderRecord & { items: number }>
    const total = safeCount(rows[0].total)
    return { items: records.map(o => ({ id:o.id,orderNumber:o.order_number || 'Order',customer:[o.customer_first_name,o.customer_last_name].filter(Boolean).join(' ') || o.customer_email,customerEmail:o.customer_email,total:Number(o.total_amount || 0),paymentStatus:o.payment_status || 'pending',status:o.status,createdAt:o.created_at,items:safeCount(o.items) })), page,pageSize:20,total,totalPages:Math.max(1,Math.ceil(total/20)) }
  }
  async function detail(id: string) {
    uuid(id)
    const order = (await jsonRows<OrderRecord>(db,'SELECT to_jsonb(o)::text AS item FROM public.orders o WHERE id=$1::uuid',[id]))[0]
    if (!order) throw new OperationsError(404,'Order not found.')
    const items = await jsonRows<OrderLine>(db,'SELECT to_jsonb(i)::text AS item FROM public.order_items i WHERE order_id=$1::uuid ORDER BY created_at,id',[id])
    const letters = await jsonRows<{final_letter_html:string;[key:string]:unknown}>(db,'SELECT to_jsonb(l)::text AS item FROM public.order_love_letters l WHERE order_id=$1::uuid',[id])
    if (letters.length > 1) throw new Error('Invalid love letter result')
    return { order, items, loveLetter:letters[0] ? {...letters[0],final_letter_html:sanitizeLoveLetterHtml(letters[0].final_letter_html)} : null }
  }
  async function update(id: string, raw: z.infer<typeof orderStatusUpdateSchema>, now = new Date().toISOString()) {
    uuid(id)
    const input = orderStatusUpdateSchema.parse(raw)
    if (!actor?.profileId || !actor.issuer || !actor.subject) throw new OperationsError(403,'Administrator access is required.')
    uuid(actor.profileId)
    // This capability locks/rechecks the order and runs the existing trigger chain.
    // The runtime account receives no direct order/stock/history write privilege.
    try {
      const rows = await jsonRows<{item:OrderRecord;items:OrderLine[];statusChanged:boolean}>(db,
        'SELECT public.admin_order_status_update_v1($1::uuid,$2::text,$3::text,$4::uuid,$5::jsonb,$6::timestamptz)::text AS item',
        [actor.profileId,actor.issuer,actor.subject,id,JSON.stringify(input),now])
      const result=rows[0]
      if(rows.length!==1 || !result?.item || result.item.id?.toLowerCase()!==id.toLowerCase() || result.item.status!==input.status
        || !Array.isArray(result.items) || typeof result.statusChanged!=='boolean') throw new Error('Invalid order update result')
      return result
    } catch(error) {
      const state=mapAdminDbError(error).sqlState
      if(state==='P0002')throw new OperationsError(404,'Order not found.')
      if(state==='40001')throw new OperationsError(409,'This order changed after you opened it. Reload before saving.')
      if(state==='PT409')throw new OperationsError(409,'Stock-backed cancelled orders cannot be reopened here. A reviewed stock reservation is required.')
      if(state==='PT422')throw new OperationsError(409,'Only paid orders can be processed, shipped or delivered.')
      if(state==='PT423')throw new OperationsError(409,'This status change is not allowed. Orders move pending → processing → shipped → delivered.')
      throw error
    }
  }
  return {list,detail,update}
}
