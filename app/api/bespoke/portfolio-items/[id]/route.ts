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
    return runBespokeData(request, access, (await params).id)

  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    return runBespokeData(request, access, (await params).id)

  })
}

export const runtime = 'nodejs'
