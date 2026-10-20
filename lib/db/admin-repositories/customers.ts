import 'server-only'
import type { DbExecutor } from '../query'
import { parseCmsJson } from '../../cms-id-safety'
import { jsonRows, pageNumber, safeCount, uuid } from './operations-shared'
export type CustomerIdentitySummary = {id:string;email:string;name:string;firstSeenAt:string;emailVerified:boolean}
export const CUSTOMER_PAGE_SIZE = 20
export function createCustomersRepository(db:DbExecutor) {
  // Explicit projection excludes provider subjects, sessions and unrelated private profile fields.
  const item=`jsonb_build_object('id',i.id,'email',i.email,
      'name',COALESCE(NULLIF(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Unnamed customer'),
      'firstSeenAt',i.created_at,'emailVerified',i.email_verified)`
  /** HOD-065: one page of customers plus the exact total, in one statement snapshot. */
  async function list(page = 1) {
    page=pageNumber(page)
    const {rows}=await db.query<{total:string;items:string}>(`WITH page AS (
      SELECT ${item} AS item,i.created_at,i.id FROM public.customer_identities i LEFT JOIN public.customer_profiles p ON p.identity_id=i.id
      ORDER BY i.created_at DESC,i.id DESC LIMIT ${CUSTOMER_PAGE_SIZE} OFFSET $1::integer)
      SELECT (SELECT count(*)::text FROM public.customer_identities) AS total,
      COALESCE((SELECT jsonb_agg(page.item ORDER BY page.created_at DESC,page.id DESC) FROM page),'[]'::jsonb)::text AS items`,[(page-1)*CUSTOMER_PAGE_SIZE])
    if(rows.length!==1)throw new Error('Invalid customer list')
    const total=safeCount(rows[0].total)
    return {items:parseCmsJson(rows[0].items) as CustomerIdentitySummary[],page,pageSize:CUSTOMER_PAGE_SIZE,total,totalPages:Math.max(1,Math.ceil(total/CUSTOMER_PAGE_SIZE))}
  }
  async function one(id:string):Promise<CustomerIdentitySummary|null> {
    return (await jsonRows<CustomerIdentitySummary>(db,`SELECT ${item}::text AS item
      FROM public.customer_identities i LEFT JOIN public.customer_profiles p ON p.identity_id=i.id WHERE i.id=$1::uuid`,[uuid(id)]))[0]??null
  }
  async function metrics() {
    const {rows}=await db.query<{identities:string;guest_orders:string;legacy_account_orders:string}>(`SELECT
      (SELECT count(*)::text FROM public.customer_identities) AS identities,
      count(*) FILTER (WHERE user_id IS NULL AND customer_identity_id IS NULL AND guest_token_hash IS NOT NULL)::text AS guest_orders,
      count(*) FILTER (WHERE user_id IS NOT NULL)::text AS legacy_account_orders FROM public.orders`)
    if(rows.length!==1)throw new Error('Invalid customer metrics')
    return {persistedCustomerIdentities:safeCount(rows[0].identities),guestOrders:safeCount(rows[0].guest_orders),legacyAccountOrders:safeCount(rows[0].legacy_account_orders),historicalRegistrations:null}
  }
  async function orders(id:string) {
    return jsonRows<{id:string;order_number:string;created_at:string;total_amount:number|string;status:string}>(db,
      'SELECT jsonb_build_object(\'id\',id,\'order_number\',order_number,\'created_at\',created_at,\'total_amount\',total_amount,\'status\',status)::text AS item FROM public.orders WHERE customer_identity_id=$1::uuid ORDER BY created_at DESC,id DESC',[uuid(id)])
  }
  return {list,one,metrics,orders}
}
