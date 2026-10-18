import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'
import { portfolioCategoryCreateSchema, portfolioMutationError } from '@/lib/bespoke-portfolio-validation'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, undefined)


  const { data, error } = await access.adminClient
    .from('bespoke_portfolio_categories')
    .select('id, name, slug, image_path, display_order, status, created_at, updated_at')
    .order('display_order', { ascending: true })

  if (error) return NextResponse.json({ error: 'Unable to load portfolio categories.' }, { status: 500 })
  return NextResponse.json({ items: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, undefined)


  const parsed = portfolioCategoryCreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid portfolio category.' }, { status: 400 })
  }

  const { data, error } = await access.adminClient
    .from('bespoke_portfolio_categories')
    .insert(parsed.data)
    .select('id, name, slug, image_path, display_order, status, created_at, updated_at')
    .single()

  if (error) {
    const safe = portfolioMutationError(error, 'category', 'save')
    return NextResponse.json({ error: safe.message }, { status: safe.status })
  }
  return NextResponse.json({ item: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'
