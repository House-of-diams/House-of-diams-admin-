import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdmin } from '@/lib/cms-auth'
import { duplicateProductSchema, productOperationError } from '@/lib/product-operations-validation'

type DuplicateProductResult = {
  product_id: string
  slug: string
  lane: 'standard' | 'hiphop' | 'collection'
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runProductRdsRoute('duplicate', request, (await params).id)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const id = z.string().uuid().safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid source product ID.' }, { status: 400 })
  const input = duplicateProductSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid product duplication request.' }, { status: 400 })

  const { data: source, error: sourceError } = await access.adminClient.from('products').select('id, product_lane').eq('id', id.data).maybeSingle()
  if (sourceError) return NextResponse.json({ error: 'Unable to validate the source product.' }, { status: 500 })
  if (!source) return NextResponse.json({ error: 'Source product not found.' }, { status: 404 })
  if (!['standard', 'hiphop', 'collection'].includes(source.product_lane ?? 'standard')) return NextResponse.json({ error: 'The source product is not eligible for duplication.' }, { status: 409 })

  const { data, error } = await access.adminClient.rpc('duplicate_product', {
    p_source_product_id: id.data,
    p_request_id: input.data.requestId,
    p_admin_id: access.user.id,
  })

  if (error) {
    const safe = productOperationError(error, 'duplicate')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }

  const item = (Array.isArray(data) ? data[0] : data) as DuplicateProductResult | null
  if (!item?.product_id || !item.slug) {
    return NextResponse.json({ error: 'The database did not return the duplicated product.' }, { status: 500 })
  }

  return NextResponse.json({ item }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export const runtime = 'nodejs'
