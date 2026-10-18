import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'
import {
  portfolioCategoryUpdateSchema,
  portfolioExpectedTimestampSchema,
  portfolioIdSchema,
  portfolioMutationError,
} from '@/lib/bespoke-portfolio-validation'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, (await params).id)


  const id = portfolioIdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid portfolio category ID.' }, { status: 400 })
  const parsed = portfolioCategoryUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid portfolio category.' }, { status: 400 })

  const { expected_updated_at, ...changes } = parsed.data
  const { data, error } = await access.adminClient
    .from('bespoke_portfolio_categories')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('updated_at', expected_updated_at)
    .select('id, name, slug, image_path, display_order, status, created_at, updated_at')
    .maybeSingle()

  if (error) {
    const safe = portfolioMutationError(error, 'category', 'save')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!data) {
    const { data: current, error: lookupError } = await access.adminClient.from('bespoke_portfolio_categories').select('id').eq('id', id.data).maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Unable to save the portfolio category. No changes were applied.' }, { status: 500 })
    return NextResponse.json({ error: current ? 'This category was changed by another administrator. Reload it before saving.' : 'Portfolio category not found.' }, { status: current ? 409 : 404 })
  }
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, (await params).id)


  const id = portfolioIdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid portfolio category ID.' }, { status: 400 })
  const expected = portfolioExpectedTimestampSchema.safeParse(new URL(request.url).searchParams.get('expected_updated_at'))
  if (!expected.success) return NextResponse.json({ error: 'A valid category revision is required.' }, { status: 400 })

  const { data, error } = await access.adminClient.from('bespoke_portfolio_categories').delete().eq('id', id.data).eq('updated_at', expected.data).select('id').maybeSingle()
  if (error) {
    const safe = portfolioMutationError(error, 'category', 'delete')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!data) {
    const { data: current, error: lookupError } = await access.adminClient.from('bespoke_portfolio_categories').select('id').eq('id', id.data).maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Unable to delete the portfolio category.' }, { status: 500 })
    return NextResponse.json({ error: current ? 'This category was changed by another administrator. Reload it before deleting.' : 'Portfolio category not found.' }, { status: current ? 409 : 404 })
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'
