import 'server-only'
import type { DbExecutor } from '../query'
import { jsonRows, safeCount, uuid } from './operations-shared'
export type CustomerIdentitySummary = {id:string;email:string;name:string;firstSeenAt:string;emailVerified:boolean}
export function createCustomersRepository(db:DbExecutor) {
  async function list():Promise<CustomerIdentitySummary[]> {
    // Explicit projection excludes provider subjects, sessions and unrelated private profile fields.
    return jsonRows(db,`SELECT jsonb_build_object('id',i.id,'email',i.email,
      'name',COALESCE(NULLIF(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Unnamed customer'),
      'firstSeenAt',i.created_at,'emailVerified',i.email_verified)::text AS item
      FROM public.customer_identities i LEFT JOIN public.customer_profiles p ON p.identity_id=i.id
      ORDER BY i.created_at DESC,i.id DESC`)
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
  return {list,metrics,orders}
}
