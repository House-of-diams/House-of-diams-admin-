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
    return runBespokeData(request, access, (await params).id)

  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    return runBespokeData(request, access, (await params).id)

  })
}

export const runtime = 'nodejs'
