import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withCmsDataRoute(request, async access => {
    return runBespokeData(request, access, (await context.params).id)

  })
}

export const runtime = 'nodejs'
