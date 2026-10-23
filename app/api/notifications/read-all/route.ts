import { withOperationsRoute } from '@/lib/operations-route'
import { createNotificationsRepository } from '@/lib/db/admin-repositories/notifications'
export const runtime='nodejs'
export const dynamic='force-dynamic'

export async function POST(request: Request) {
  return withOperationsRoute(request,async access=>{
    return Response.json(await createNotificationsRepository(access.db,access.actor).markAll())

  })
}
