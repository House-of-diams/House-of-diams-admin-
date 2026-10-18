import { readCmsDataProvider } from '@/lib/cms-provider'
import { cmsErrorResponse } from '@/lib/cms-rds-handlers'
import { NextResponse } from 'next/server'
import { buildAdminClient, buildAuthClient } from '@/lib/cms-auth'

const sectionKey = 'hiphop_hero'
const legacySectionKey = 'home_hiphop_showcase'

type HipHopSection = {
  eyebrow: string
  headline: string
  subtitle: string
  slider_enabled: boolean
  items: Array<{
    sort_order: number
    image_path: string
    mobile_image_path?: string
    button_text: string
    button_link: string
  }>
}

function isMissingTableError(message?: string | null) {
  return Boolean(message?.includes("Could not find the table"))
}

function buildFallbackPayload() {
  return {
    section: {
      eyebrow: 'Hip Hop',
      headline: 'Hip Hop Jewellery',
      subtitle: 'Fully iced chains, grillz, pendants and statement rings - handcrafted with lab-grown diamonds in 14K and 18K gold.',
      slider_enabled: false,
    },
    items: [],
  }
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

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

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
  const { data: section, error } = await adminClient
    .from('hiphop_hero_content')
    .select('*')
    .eq('section_key', sectionKey)
    .maybeSingle()

  if (error && !isMissingTableError(error.message)) return NextResponse.json({ error: 'Unable to load Hip Hop content.' }, { status: 503 })

  if (isMissingTableError(error?.message)) {
    const { data: legacySection, error: legacyError } = await adminClient
      .from('hiphop_showcase_section')
      .select('eyebrow, heading_line_1, heading_line_2, heading_emphasis, cta_label, cta_link, image_path')
      .eq('section_key', legacySectionKey)
      .maybeSingle()

    if (legacyError && !isMissingTableError(legacyError.message)) {
      return NextResponse.json({ error: 'Unable to load the Hip Hop fallback content.' }, { status: 503 })
    }

    if (!legacySection) {
      return NextResponse.json(buildFallbackPayload())
    }

    const legacyHeadline = [
      legacySection.heading_line_1,
      legacySection.heading_line_2,
      legacySection.heading_emphasis,
    ]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(' ')

    return NextResponse.json({
      section: {
        eyebrow: legacySection.eyebrow ?? 'Hip Hop',
        headline: legacyHeadline || 'Hip Hop Jewellery',
        subtitle: 'Fully iced chains, grillz, pendants and statement rings - handcrafted with lab-grown diamonds in 14K and 18K gold.',
        slider_enabled: Boolean(legacySection.image_path),
      },
      items: legacySection.image_path
        ? [
            {
              sort_order: 1,
              image_path: legacySection.image_path,
              mobile_image_path: legacySection.image_path,
              button_text: legacySection.cta_label ?? 'Explore',
              button_link: legacySection.cta_link ?? '/hiphop',
            },
          ]
        : [],
    })
  }

  if (!section) {
    return NextResponse.json(buildFallbackPayload())
  }

  const { data: items, error: itemsError } = await adminClient
    .from('hiphop_hero_slider_items')
    .select('id, sort_order, image_path, mobile_image_path, button_text, button_link')
    .eq('hero_id', section.id)
    .order('sort_order', { ascending: true })

  if (itemsError) return NextResponse.json({ error: 'Unable to load Hip Hop slides.' }, { status: 503 })

  return NextResponse.json({
    section: {
      eyebrow: section.eyebrow ?? 'Hip Hop',
      headline: section.headline ?? 'Hip Hop Jewellery',
      subtitle: section.subtitle ?? '',
      slider_enabled: section.slider_enabled ?? false,
    },
    items: items ?? [],
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  try { if (readCmsDataProvider(process.env) === 'rds') return NextResponse.json({ error: 'This editor has been removed.' }, { status: 410 }) } catch (error) { return cmsErrorResponse(error) }
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const body = (await request.json().catch(() => null)) as HipHopSection | null
  if (
    !body ||
    typeof body.eyebrow !== 'string' ||
    typeof body.headline !== 'string' ||
    typeof body.subtitle !== 'string' ||
    typeof body.slider_enabled !== 'boolean' ||
    !Array.isArray(body.items)
  ) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 })
  }

  const { adminClient } = access
  const { data: section, error } = await adminClient.from('hiphop_hero_content').upsert(
    {
      section_key: sectionKey,
      eyebrow: body.eyebrow,
      headline: body.headline,
      subtitle: body.subtitle,
      slider_enabled: body.slider_enabled,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'section_key' }
  ).select('id').single()

  if (isMissingTableError(error?.message)) {
    const primarySlide =
      body.items
        .filter((item) => typeof item.image_path === 'string' && item.image_path.trim().length > 0)
        .sort((left, right) => {
          const leftOrder = Number.isFinite(Number(left.sort_order)) ? Number(left.sort_order) : 9999
          const rightOrder = Number.isFinite(Number(right.sort_order)) ? Number(right.sort_order) : 9999
          return leftOrder - rightOrder
        })[0] ?? null

    const headlineParts = body.headline
      .split(/\r?\n+/)
      .map((part) => part.trim())
      .filter(Boolean)

    const { error: legacySaveError } = await adminClient.from('hiphop_showcase_section').upsert(
      {
        section_key: legacySectionKey,
        eyebrow: body.eyebrow,
        heading_line_1: headlineParts[0] ?? body.headline,
        heading_line_2: headlineParts[1] ?? '',
        heading_emphasis: headlineParts.slice(2).join(' '),
        cta_label: primarySlide?.button_text ?? 'Explore',
        cta_link: primarySlide?.button_link ?? '/hiphop',
        image_path: primarySlide?.image_path ?? '',
        image_alt: 'House of Diams Hip Hop Collection',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'section_key' }
    )

    if (legacySaveError) {
      return NextResponse.json({ error: 'Unable to save the Hip Hop fallback content.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mode: 'legacy' })
  }

  if (error || !section) return NextResponse.json({ error: 'Unable to save the Hip Hop hero.' }, { status: 500 })

  const { error: deleteError } = await adminClient.from('hiphop_hero_slider_items').delete().eq('hero_id', section.id)
  if (deleteError) return NextResponse.json({ error: 'Unable to replace the Hip Hop slides.' }, { status: 500 })

  const items = body.items
    .filter((item: any) => typeof item.image_path === 'string' && typeof item.button_text === 'string' && typeof item.button_link === 'string')
    .map((item: any, index: number) => ({
      hero_id: section.id,
      sort_order: Number.isFinite(Number(item.sort_order)) ? Number(item.sort_order) : index + 1,
      image_path: item.image_path,
      mobile_image_path: typeof item.mobile_image_path === 'string' ? item.mobile_image_path : '',
      button_text: item.button_text,
      button_link: item.button_link,
    }))

  if (items.length > 0) {
    const { error: insertError } = await adminClient.from('hiphop_hero_slider_items').insert(items)
    if (insertError) return NextResponse.json({ error: 'Unable to finish saving the Hip Hop slides.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const runtime = 'nodejs'
