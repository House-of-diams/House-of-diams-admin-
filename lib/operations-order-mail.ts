import 'server-only'
import type { sendOrderStatusUpdateEmail } from './email'
import type { OrderRecord, OrderLine } from './db/admin-repositories/orders'
/** Called only after the enclosing B2 transaction has committed. Mail is injectable offline. */
export async function deliverOrderUpdate(update:{item:OrderRecord;items:OrderLine[]},send:typeof sendOrderStatusUpdateEmail) {
  const {item:data,items}=update
  try {
    await send({customerEmail:data.customer_email || '',customerName:[data.customer_first_name,data.customer_last_name].filter(Boolean).join(' ') || 'Client',orderNumber:data.order_number,orderDate:data.created_at,totalAmount:Number(data.total_amount || 0),status:data.status,courierName:data.courier_name || null,courierAwbNumber:data.courier_awb_number || null,shippedAt:data.shipped_at || null,items:items.map(item=>({product_name:item.product_name,quantity:Number(item.quantity || 0),line_total:Number(item.line_total || 0)}))})
    return Response.json({item:data,emailStatus:'sent'})
  }catch{
    return Response.json({item:data,emailStatus:'failed',emailError:'The order status changed, but the customer email could not be sent.'})
  }
}
