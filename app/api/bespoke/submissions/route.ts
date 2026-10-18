import { NextResponse } from 'next/server'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'
import { bespokeSubmissionQuerySchema } from '@/lib/admin-read-validation'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, undefined)

  const { searchParams } = new URL(request.url)
  const filters = bespokeSubmissionQuerySchema.safeParse({ from: searchParams.get('from') ?? undefined, to: searchParams.get('to') ?? undefined, q: searchParams.get('q') ?? undefined })
  if (!filters.success) return NextResponse.json({ error: filters.error.issues[0]?.message ?? 'Invalid submission filters.' }, { status: 400 })

  let builder = access.adminClient.from('bespoke_submissions').select('id, full_name, email, phone, country, piece_type, stone_preference, approx_carat, preferred_metal, message, status, created_at').order('created_at', { ascending: false }).limit(1_000)
  if (filters.data.from) builder = builder.gte('created_at', `${filters.data.from}T00:00:00.000Z`)
  if (filters.data.to) builder = builder.lte('created_at', `${filters.data.to}T23:59:59.999Z`)
  const { data, error } = await builder
  if (error) return NextResponse.json({ error: 'Unable to load Bespoke submissions.' }, { status: 500 })

  const query = filters.data.q?.toLowerCase() ?? ''
  const items = (data ?? []).filter((item) => !query || [item.full_name, item.email, item.phone, item.country, item.piece_type, item.stone_preference, item.approx_carat, item.preferred_metal, item.message, item.status].filter(Boolean).join(' ').toLowerCase().includes(query))
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'
