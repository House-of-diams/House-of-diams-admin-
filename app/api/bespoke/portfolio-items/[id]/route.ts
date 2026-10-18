import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'
import {
  portfolioExpectedTimestampSchema,
  portfolioIdSchema,
  portfolioItemUpdateSchema,
  portfolioMutationError,
} from '@/lib/bespoke-portfolio-validation'

const itemColumns = 'id, title, tag, category_id, media_type, media_path, thumbnail_path, gem_style, gem_color, dark_theme, short_description, display_order, status, created_at, updated_at'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, (await params).id)


  const id = portfolioIdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid portfolio item ID.' }, { status: 400 })
  const parsed = portfolioItemUpdateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid portfolio item.' }, { status: 400 })

  const { expected_updated_at, ...changes } = parsed.data
  const { data: category, error: categoryError } = await access.adminClient.from('bespoke_portfolio_categories').select('id').eq('id', changes.category_id).maybeSingle()
  if (categoryError) return NextResponse.json({ error: 'Unable to validate the selected portfolio category.' }, { status: 500 })
  if (!category) return NextResponse.json({ error: 'The selected portfolio category was not found.' }, { status: 404 })

  const { data, error } = await access.adminClient
    .from('bespoke_portfolio_items')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('updated_at', expected_updated_at)
    .select(itemColumns)
    .maybeSingle()

  if (error) {
    const safe = portfolioMutationError(error, 'item', 'save')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!data) {
    const { data: current, error: lookupError } = await access.adminClient.from('bespoke_portfolio_items').select('id').eq('id', id.data).maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Unable to save the portfolio item. No changes were applied.' }, { status: 500 })
    return NextResponse.json({ error: current ? 'This item was changed by another administrator. Reload it before saving.' : 'Portfolio item not found.' }, { status: current ? 409 : 404 })
  }
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, (await params).id)


  const id = portfolioIdSchema.safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid portfolio item ID.' }, { status: 400 })
  const expected = portfolioExpectedTimestampSchema.safeParse(new URL(request.url).searchParams.get('expected_updated_at'))
  if (!expected.success) return NextResponse.json({ error: 'A valid item revision is required.' }, { status: 400 })

  const { data, error } = await access.adminClient.from('bespoke_portfolio_items').delete().eq('id', id.data).eq('updated_at', expected.data).select('id').maybeSingle()
  if (error) {
    const safe = portfolioMutationError(error, 'item', 'delete')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  if (!data) {
    const { data: current, error: lookupError } = await access.adminClient.from('bespoke_portfolio_items').select('id').eq('id', id.data).maybeSingle()
    if (lookupError) return NextResponse.json({ error: 'Unable to delete the portfolio item.' }, { status: 500 })
    return NextResponse.json({ error: current ? 'This item was changed by another administrator. Reload it before deleting.' : 'Portfolio item not found.' }, { status: current ? 409 : 404 })
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'
