import 'server-only'
import type { AdminActor } from '../../auth/admin-identity-core'
import type { DbExecutor } from '../query'
import { notificationReadSchema } from '../../admin-read-validation'
import { presentNotifications } from '../../operations-presenters'
import { createEnquiriesRepository } from './enquiries'
import { uuid } from './operations-shared'
export function createNotificationsRepository(db:DbExecutor,actor:AdminActor) {
  const actorId=uuid(actor.profileId)
  async function read() {
    const enquiries=createEnquiriesRepository(db)
    const sources=await enquiries.sources(true)
    const ordersResult=await enquiries.notificationOrders()
    const {rows}=await db.query<{notification_key:string}>('SELECT notification_key FROM public.admin_notification_reads WHERE admin_user_id=$1::uuid',[actorId])
    return presentNotifications({...sources,ordersResult,readKeys:new Set(rows.map(row=>row.notification_key))})
  }
  async function mark(raw:unknown,now=new Date().toISOString()) {
    const {notificationKey}=notificationReadSchema.parse(raw)
    await db.query(`INSERT INTO public.admin_notification_reads(admin_user_id,notification_key,read_at)
      VALUES($1::uuid,$2::text,$3::timestamptz) ON CONFLICT(admin_user_id,notification_key) DO NOTHING`,[actorId,notificationKey,now])
    return {ok:true}
  }
  async function markAll(now=new Date().toISOString()) {
    const data=await read();const unread=data.items.filter(i=>!i.read)
    if(unread.length)await db.query(`INSERT INTO public.admin_notification_reads(admin_user_id,notification_key,read_at)
      SELECT $1::uuid,k,$3::timestamptz FROM unnest($2::text[]) k ON CONFLICT(admin_user_id,notification_key) DO NOTHING`,[actorId,unread.map(i=>i.notificationKey),now])
    return {ok:true,count:unread.length}
  }
  return {read,mark,markAll}
}
