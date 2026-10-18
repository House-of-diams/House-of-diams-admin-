import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'
import { portfolioItemCreateSchema, portfolioMutationError } from '@/lib/bespoke-portfolio-validation'

const itemColumns = 'id, title, tag, category_id, media_type, media_path, thumbnail_path, gem_style, gem_color, dark_theme, short_description, display_order, status, created_at, updated_at'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, undefined)


  const { data, error } = await access.adminClient.from('bespoke_portfolio_items').select(itemColumns).order('display_order', { ascending: true })
  if (error) return NextResponse.json({ error: 'Unable to load portfolio items.' }, { status: 500 })
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, undefined)


  const parsed = portfolioItemCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid portfolio item.' }, { status: 400 })

  const { data: category, error: categoryError } = await access.adminClient.from('bespoke_portfolio_categories').select('id').eq('id', parsed.data.category_id).maybeSingle()
  if (categoryError) return NextResponse.json({ error: 'Unable to validate the selected portfolio category.' }, { status: 500 })
  if (!category) return NextResponse.json({ error: 'The selected portfolio category was not found.' }, { status: 404 })

  const { data, error } = await access.adminClient.from('bespoke_portfolio_items').insert(parsed.data).select(itemColumns).single()
  if (error) {
    const safe = portfolioMutationError(error, 'item', 'save')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  return NextResponse.json({ item: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'
