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
export type EnquiryTabKey='all'|'bespoke'|'contact'|'product'|'newsletter'|'promotion'
export const ENQUIRY_PAGE_SIZE=20
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
  /**
   * HOD-065: one page of the merged inbox. Sources are listed as (source,id,created_at)
   * only, filtered by tab and paged in SQL; full rows are then read for that page alone.
   */
  async function pagedSources(tab:EnquiryTabKey,page=1):Promise<{sources:EnquirySources;counts:Record<EnquiryTabKey,number>;page:number;pageSize:number;total:number}> {
    page=pageNumber(page)
    const newsletterEnabled=await optionalRelation(db,'newsletter_submissions')
    const promotionEnabled=await optionalRelation(db,'promotion_popup_responses')
    const parts=["SELECT 'bespoke'::text AS source,id::text AS id,created_at FROM public.bespoke_submissions",
      "SELECT CASE WHEN lower(coalesce(topic,'')) LIKE 'product enquiry:%' THEN 'product' ELSE 'contact' END,id::text,created_at FROM public.contact_submissions"]
    if(newsletterEnabled)parts.push("SELECT 'newsletter',id::text,created_at FROM public.newsletter_submissions")
    if(promotionEnabled)parts.push("SELECT 'promotion',id::text,created_at FROM public.promotion_popup_responses")
    const inbox=parts.join(' UNION ALL ')
    const counted=await db.query<{source:string;n:string}>(`SELECT source,count(*)::text AS n FROM (${inbox}) s GROUP BY source`)
    const counts:Record<EnquiryTabKey,number>={all:0,bespoke:0,contact:0,product:0,newsletter:0,promotion:0}
    for(const row of counted.rows){if(row.source in counts && row.source!=='all'){counts[row.source as EnquiryTabKey]=safeCount(row.n);counts.all+=safeCount(row.n)}}
    const listed=await db.query<{source:string;id:string}>(`SELECT source,id FROM (${inbox}) s WHERE ($1::text='all' OR source=$1::text)
      ORDER BY created_at DESC,id DESC LIMIT ${ENQUIRY_PAGE_SIZE} OFFSET $2::integer`,[tab,(page-1)*ENQUIRY_PAGE_SIZE])
    const ids=(source:string)=>listed.rows.filter(row=>row.source===source).map(row=>row.id)
    const bespokeIds=ids('bespoke'),contactIds=[...ids('contact'),...ids('product')],newsletterIds=ids('newsletter'),promotionIds=ids('promotion')
    const read=<T>(sql:string,values:string[])=>values.length?jsonRows<T>(db,sql,[values]):Promise.resolve([] as T[])
    const promotion=await read<Promotion>('SELECT to_jsonb(t)::text AS item FROM (SELECT id,promotion_id,email,answers,coupon_revealed,revealed_at,created_at FROM public.promotion_popup_responses WHERE id=ANY($1::bigint[])) t',promotionIds)
    const sources:EnquirySources={
      bespokeResult:result(await read<Bespoke>(`SELECT to_jsonb(t)::text AS item FROM (SELECT ${bespokeColumns} FROM public.bespoke_submissions WHERE id=ANY($1::uuid[])) t`,bespokeIds)),
      contactResult:result(await read<Contact>(`SELECT to_jsonb(t)::text AS item FROM (SELECT ${contactColumns} FROM public.contact_submissions WHERE id=ANY($1::bigint[])) t`,contactIds)),
      newsletterResult:result(await read<Newsletter>('SELECT to_jsonb(t)::text AS item FROM (SELECT id,email,source,status,created_at FROM public.newsletter_submissions WHERE id=ANY($1::uuid[])) t',newsletterIds),newsletterEnabled),
      promotionResult:result(promotion,promotionEnabled),
      promotionQuestionsResult:result(promotion.length?await jsonRows<Question>(db,`SELECT jsonb_build_object('promotion_id',promotion_id,'field_key',field_key,'question',question)::text AS item FROM public.promotion_popup_questions WHERE promotion_id=ANY($1::bigint[])`,[[...new Set(promotion.map(p=>String(p.promotion_id)))]]):[]),
    }
    return {sources,counts,page,pageSize:ENQUIRY_PAGE_SIZE,total:counts[tab]}
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
  return {sources,pagedSources,contactPage,notificationOrders}
}
