import 'server-only'
import type { DbExecutor } from '../query'
import { parseCmsJson } from '../../cms-id-safety'
import { safeCount } from './operations-shared'
type Recent={id:string;order_number:string|null;customer_first_name:string|null;customer_last_name:string|null;customer_email:string|null;total_amount:number|string|null;status:string|null;created_at:string}
type Snapshot={products:number;orders:number;identities:number;guestOrders:number;revenue:Array<{total_amount:number|string|null;status:string|null}>;recent:Recent[];items:Array<{product_name:string;quantity:number|string;line_total:number|string}>}
export async function dashboardSources(db:DbExecutor) {
  // All summary inputs use one PostgreSQL statement snapshot, including empty tables.
  const {rows}=await db.query<{item:string}>(`SELECT jsonb_build_object(
    'products',(SELECT count(*) FROM public.products),'orders',(SELECT count(*) FROM public.orders),
    'identities',(SELECT count(*) FROM public.customer_identities),
    'guestOrders',(SELECT count(*) FROM public.orders WHERE user_id IS NULL AND customer_identity_id IS NULL AND guest_token_hash IS NOT NULL),
    'revenue',COALESCE((SELECT jsonb_agg(jsonb_build_object('total_amount',total_amount,'status',status)) FROM public.orders),'[]'::jsonb),
    'recent',COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT id,order_number,customer_first_name,customer_last_name,customer_email,total_amount,status,created_at FROM public.orders ORDER BY created_at DESC,id DESC LIMIT 5) t),'[]'::jsonb),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('product_name',product_name,'quantity',quantity,'line_total',line_total)) FROM public.order_items),'[]'::jsonb))::text AS item`)
  if(rows.length!==1 || typeof rows[0].item!=='string')throw new Error('Invalid dashboard snapshot')
  const data=parseCmsJson(rows[0].item) as Snapshot
  return {productsCount:{count:safeCount(data.products)},ordersCount:{count:safeCount(data.orders)},revenueResult:{data:data.revenue},recentOrdersResult:{data:data.recent},orderItemsResult:{data:data.items},customerCount:safeCount(data.identities),customerLabel:'Customer identities',customerNote:`Persisted identities; ${safeCount(data.guestOrders)} guest orders; historical registrations unavailable`}
}
