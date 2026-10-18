import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import { activateDraftsSchema, productOperationError } from '@/lib/product-operations-validation'

export async function POST(request: Request) {
  const rds = await runProductRdsRoute('activate', request)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const input = activateDraftsSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid draft activation request.' }, { status: 400 })

  const { data, error } = await access.adminClient.rpc('admin_product_activate_drafts_v1', {
    p_actor_id: access.user.id,
    p_request_id: input.data.requestId,
    p_lane: input.data.lane,
    p_ids: input.data.ids,
  })
  if (error) {
    const safe = productOperationError(error, 'activate')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

export const runtime = 'nodejs'
