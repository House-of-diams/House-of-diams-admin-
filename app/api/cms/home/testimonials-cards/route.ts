import { readCmsDataProvider } from '@/lib/cms-provider'
import { cmsErrorResponse } from '@/lib/cms-rds-handlers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const sectionKey = 'home_testimonials'

function buildAuthClient(accessToken: string) {
  if (!supabaseUrl || !supabaseAnonKey) return null
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

function buildAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null
  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

async function assertAdmin(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 }) }
  }

  const accessToken = authHeader.slice('Bearer '.length)
  const authClient = buildAuthClient(accessToken)
  const adminClient = buildAdminClient()

  if (!authClient || !adminClient) {
    return { error: NextResponse.json({ error: 'Missing Supabase env vars.' }, { status: 500 }) }
  }

  const { data: userData, error: userError } = await authClient.auth.getUser()
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  }

  const { data: profile, error: profileError } = await adminClient.from('profiles').select('role').eq('id', userData.user.id).single()
  if (profileError || profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden.' }, { status: 403 }) }
  }

  return { adminClient }
}

export async function GET(request: Request) {
  try { if (readCmsDataProvider(process.env) === 'rds') return NextResponse.json({ error: 'This editor has been removed.' }, { status: 410 }) } catch (error) { return cmsErrorResponse(error) }
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { adminClient } = access
  const { data: section, error: sectionError } = await adminClient
    .from('testimonials_section')
    .select('id, section_key, eyebrow, heading')
    .eq('section_key', sectionKey)
    .maybeSingle()

  if (sectionError) return NextResponse.json({ error: 'Unable to load Testimonials Cards.' }, { status: 503 })

  const { data: items, error: itemsError } = await adminClient
    .from('testimonials_items')
    .select('id, sort_order, quote, author, origin, rating')
    .eq('section_id', section?.id ?? null)
    .order('sort_order', { ascending: true })

  if (itemsError) return NextResponse.json({ error: 'Unable to load Testimonials Cards entries.' }, { status: 503 })

  return NextResponse.json({
    section: section ?? { section_key: sectionKey, eyebrow: 'Client Stories', heading: 'What Our Clients Say' },
    items: items ?? [],
  })
}

export async function POST(request: Request) {
  try { if (readCmsDataProvider(process.env) === 'rds') return NextResponse.json({ error: 'This editor has been removed.' }, { status: 410 }) } catch (error) { return cmsErrorResponse(error) }
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const body = await request.json().catch(() => null)
  if (!body || !body.section || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  const { adminClient } = access
  const { data: section, error: sectionError } = await adminClient
    .from('testimonials_section')
    .upsert(
      {
        section_key: sectionKey,
        eyebrow: body.section.eyebrow,
        heading: body.section.heading,
      },
      { onConflict: 'section_key' }
    )
    .select('id')
    .single()

  if (sectionError || !section) {
    return NextResponse.json({ error: 'Unable to save Testimonials Cards.' }, { status: 500 })
  }

  const { error: deleteError } = await adminClient.from('testimonials_items').delete().eq('section_id', section.id)
  if (deleteError) return NextResponse.json({ error: 'Unable to replace Testimonials Cards entries.' }, { status: 500 })

  const rows = body.items
    .filter((item: { quote?: unknown; author?: unknown; origin?: unknown; rating?: unknown }) => typeof item.quote === 'string' && typeof item.author === 'string' && typeof item.origin === 'string')
    .map((item: { sort_order?: unknown; quote: string; author: string; origin: string; rating?: unknown }, index: number) => ({
      section_id: section.id,
      sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index + 1,
      quote: item.quote,
      author: item.author,
      origin: item.origin,
      rating: Number.isFinite(Number(item.rating)) ? Math.max(1, Math.min(5, Number(item.rating))) : 5,
    }))

  if (rows.length > 0) {
    const { error: insertError } = await adminClient.from('testimonials_items').insert(rows)
    if (insertError) return NextResponse.json({ error: 'Unable to finish saving Testimonials Cards.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const runtime = 'nodejs'
