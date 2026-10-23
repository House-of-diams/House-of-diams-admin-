import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'

const itemColumns = 'id, title, tag, category_id, media_type, media_path, thumbnail_path, gem_style, gem_color, dark_theme, short_description, display_order, status, created_at, updated_at'

export async function GET(request: Request) {
  return withCmsDataRoute(request, async access => {
    return runBespokeData(request, access, undefined)

  })
}

export async function POST(request: Request) {
  return withCmsDataRoute(request, async access => {
    return runBespokeData(request, access, undefined)

  })
}

export const runtime = 'nodejs'
