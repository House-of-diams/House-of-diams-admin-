import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    if ('provider' in access) return runBespokeData(request, access, (await context.params).id)

  const { id: rawId } = await context.params
  const id = z.string().uuid().safeParse(rawId)
  if (!id.success) return NextResponse.json({ error: 'Invalid submission ID.' }, { status: 400 })

  const { data, error } = await access.adminClient.from('bespoke_submissions').select('id, full_name, email, phone, country, piece_type, stone_preference, approx_carat, preferred_metal, message, status, created_at').eq('id', id.data).maybeSingle()
  if (error) return NextResponse.json({ error: 'Unable to load this Bespoke submission.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Submission not found.' }, { status: 404 })
  return NextResponse.json({ item: data }, { headers: { 'Cache-Control': 'no-store' } })

  })
}

export const runtime = 'nodejs'
