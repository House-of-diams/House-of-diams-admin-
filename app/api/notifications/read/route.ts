import { NextResponse } from 'next/server'
import { withOperationsRoute, isOperationsRds } from '@/lib/operations-route'
import { createNotificationsRepository } from '@/lib/db/admin-repositories/notifications'
export const runtime='nodejs'
export const dynamic='force-dynamic'
import { notificationReadSchema, notificationWriteError } from '@/lib/admin-read-validation'

export async function POST(request: Request) {
  return withOperationsRoute(request,async access=>{
  if(isOperationsRds(access)) return Response.json(await createNotificationsRepository(access.db,access.actor).mark(await request.json().catch(()=>null)))
  const input = notificationReadSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid notification.' }, { status: 400 })

  const { error } = await access.adminClient.from('admin_notification_reads').upsert({
    admin_user_id: access.user.id,
    notification_key: input.data.notificationKey,
    read_at: new Date().toISOString(),
  }, { onConflict: 'admin_user_id,notification_key' })
  if (error) {
    const safe = notificationWriteError(error)
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  })
}
