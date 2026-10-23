import { withOperationsRoute } from '@/lib/operations-route'
import { createSettingsRepository, settingsRevision } from '@/lib/db/admin-repositories/settings'
import { REVISION_HEADER } from '@/lib/revision'
export const runtime='nodejs'
export const dynamic='force-dynamic'

const settingsKey = 'global_site_settings'

export async function GET(request: Request) {
  return withOperationsRoute(request,async access=>{
const item=await createSettingsRepository(access.db).read();return Response.json({item,revision:settingsRevision(item)})

  })
}

export async function POST(request: Request) {
  return withOperationsRoute(request,async access=>{
    return Response.json(await createSettingsRepository(access.db).save(await request.json().catch(()=>null),request.headers.get(REVISION_HEADER)??''))

  })
}
