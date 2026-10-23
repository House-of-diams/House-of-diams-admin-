import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { runBespokeData } from '@/lib/bespoke-rds-data'

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
