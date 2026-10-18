import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdmin } from '@/lib/cms-auth'
import { adminMutationError, inventoryUpdateSchema } from '@/lib/order-inventory-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runProductRdsRoute('inventory-stock', request, (await params).id)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { id: rawId } = await params
  const id = z.string().uuid().safeParse(rawId)
  if (!id.success) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 })
  const input = inventoryUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid stock update.' }, { status: 400 })

  const { data, error } = await access.adminClient.rpc('admin_inventory_set_stock_v1', {
    p_actor_id: access.user.id,
    p_product_id: id.data,
    p_expected_stock: input.data.expected_stock,
    p_new_stock: input.data.stock_quantity,
    p_notes: input.data.notes || null,
  })
  if (error) {
    const safe = adminMutationError(error, 'inventory')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  return NextResponse.json({ ok: true, item: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export const runtime = 'nodejs'
