import { z } from 'zod'
import { withOperationsRoute } from '@/lib/operations-route'
import { createOrdersRepository } from '@/lib/db/admin-repositories/orders'
import { deliverOrderUpdate } from '@/lib/operations-order-mail'
export const runtime='nodejs'
export const dynamic='force-dynamic'
import { sendOrderStatusUpdateEmail } from '@/lib/email'

type RouteContext = { params: Promise<{ id: string }> }

async function parseOrderId(context: RouteContext) {
  const { id } = await context.params
  return z.string().uuid().safeParse(id)
}

export async function GET(request: Request, context: RouteContext) {
  return withOperationsRoute(request,async access=>{
    const id=await parseOrderId(context)
    if(!id.success)return Response.json({error:'Invalid order ID.'},{status:400})
    const repo=createOrdersRepository(access.db,access.actor)
    return Response.json(await repo.detail(id.data))
  

  })
}

export async function PATCH(request: Request, context: RouteContext) {
  return withOperationsRoute(request,async access=>{
    const id=await parseOrderId(context)
    if(!id.success)return Response.json({error:'Invalid order ID.'},{status:400})
    const repo=createOrdersRepository(access.db,access.actor)
    const update=await repo.update(id.data,await request.json().catch(()=>null))
    if(update.statusChanged){access.afterCommit(()=>deliverOrderUpdate(update,sendOrderStatusUpdateEmail));return Response.json({item:update.item,emailStatus:'pending'})}
    return Response.json({item:update.item,emailStatus:'unchanged'})
  

  })
}
