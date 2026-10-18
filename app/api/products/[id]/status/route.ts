import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdmin } from '@/lib/cms-auth'
import { productOperationError, productStatusSchema } from '@/lib/product-operations-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runProductRdsRoute('status', request, (await params).id)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const id = z.string().uuid().safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 })
  const input = productStatusSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid product status request.' }, { status: 400 })

  const { data, error } = await access.adminClient
    .from('products')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('status', input.data.expected_status)
    .select('id, status')
    .maybeSingle()

  if (error) {
    const safe = productOperationError(error, 'status')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!data) {
    const { data: current, error: lookupError } = await access.adminClient.from('products').select('id, status').eq('id', id.data).maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Unable to change the product status.' }, { status: 500 })
    return NextResponse.json({ error: current ? 'This product status changed after you loaded it. Refresh the list and try again.' : 'Product not found.' }, { status: current ? 409 : 404 })
  }
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export const runtime = 'nodejs'
