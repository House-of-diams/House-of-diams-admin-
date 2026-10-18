import 'server-only'
import type { DbExecutor } from '../query'
import { jsonRows, optionalRelation, pageNumber, safeCount } from './operations-shared'
type Bespoke={id:string;full_name:string;email:string;phone:string|null;piece_type:string|null;country:string|null;message:string|null;status:string|null;created_at:string}
type Contact={id:string;full_name:string;email:string;phone:string|null;topic:string|null;message:string|null;status:string|null;created_at:string}
type Newsletter={id:string;email:string;source:string|null;status:string|null;created_at:string}
type Promotion={id:string;promotion_id:number|string;email:string;answers:unknown;coupon_revealed:boolean;revealed_at:string|null;created_at:string}
type Question={promotion_id:number|string;field_key:string;question:string}
type Order={id:string;order_number:string;customer_first_name:string|null;customer_last_name:string|null;customer_email:string;total_amount:number|string;status:string;created_at:string}
type Result<T>={data:T[];error:null;enabled:boolean}
const result=<T>(data:T[],enabled=true):Result<T>=>({data,error:null,enabled})
export type EnquirySources={bespokeResult:Result<Bespoke>;contactResult:Result<Contact>;newsletterResult:Result<Newsletter>;promotionResult:Result<Promotion>;promotionQuestionsResult:Result<Question>}
export type NotificationSources={ordersResult:Result<Order>;bespokeResult:Result<Bespoke>;contactResult:Result<Contact>;newsletterResult:Result<Newsletter>;readKeys:Set<string>}
const bespokeColumns='id,full_name,email,phone,piece_type,country,message,status,created_at'
const contactColumns='id,full_name,email,phone,topic,message,status,created_at'
export function createEnquiriesRepository(db:DbExecutor) {
  async function sources(notifications=false):Promise<EnquirySources> {
    const tail=notifications ? " WHERE status='new' ORDER BY created_at DESC,id DESC LIMIT 25" : ' ORDER BY created_at DESC,id DESC'
    const bespokeResult=result(await jsonRows<Bespoke>(db,`SELECT to_jsonb(t)::text AS item FROM (SELECT ${bespokeColumns} FROM public.bespoke_submissions${tail}) t`))
    const contactResult=result(await jsonRows<Contact>(db,`SELECT to_jsonb(t)::text AS item FROM (SELECT ${contactColumns} FROM public.contact_submissions${tail}) t`))
    const newsletterEnabled=await optionalRelation(db,'newsletter_submissions')
    const newsletterResult=result(newsletterEnabled ? await jsonRows<Newsletter>(db,`SELECT to_jsonb(t)::text AS item FROM (SELECT id,email,source,status,created_at FROM public.newsletter_submissions${tail}) t`) : [],newsletterEnabled)
    const promotionEnabled=!notifications && await optionalRelation(db,'promotion_popup_responses')
    const promotionResult=result(promotionEnabled ? await jsonRows<Promotion>(db,'SELECT to_jsonb(t)::text AS item FROM (SELECT id,promotion_id,email,answers,coupon_revealed,revealed_at,created_at FROM public.promotion_popup_responses ORDER BY created_at DESC,id DESC) t') : [],promotionEnabled)
    const promotionQuestionsResult=result(promotionEnabled ? await jsonRows<Question>(db,'SELECT jsonb_build_object(\'promotion_id\',promotion_id,\'field_key\',field_key,\'question\',question)::text AS item FROM public.promotion_popup_questions') : [])
    return {bespokeResult,contactResult,newsletterResult,promotionResult,promotionQuestionsResult}
  }
  async function contactPage(page=1,pageSize=25) {
    page=pageNumber(page);pageSize=pageNumber(pageSize,100)
    const {rows}=await db.query<{total:string;items:string}>(`WITH page AS (SELECT ${contactColumns} FROM public.contact_submissions ORDER BY created_at DESC,id DESC LIMIT $1::integer OFFSET $2::integer)
      SELECT (SELECT count(*)::text FROM public.contact_submissions) AS total,COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.created_at DESC,page.id DESC) FROM page),'[]'::jsonb)::text AS items`,[pageSize,(page-1)*pageSize])
    if(rows.length!==1)throw new Error('Invalid contact page')
    const {parseCmsJson}=await import('../../cms-id-safety')
    return {items:parseCmsJson(rows[0].items),page,pageSize,total:safeCount(rows[0].total)}
  }
  async function notificationOrders() {return result(await jsonRows<Order>(db,"SELECT to_jsonb(t)::text AS item FROM (SELECT id,order_number,customer_first_name,customer_last_name,customer_email,total_amount,status,created_at FROM public.orders WHERE payment_status='paid' ORDER BY created_at DESC,id DESC LIMIT 25) t"))}
  return {sources,contactPage,notificationOrders}
}
