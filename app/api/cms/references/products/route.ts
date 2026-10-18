import { withCmsDataRoute } from '@/lib/cms-rds-handlers'
import { cmsReader } from '@/lib/cms-command'
import { readCmsReference } from '@/lib/cms-reference-data'
export const runtime = 'nodejs'
export async function GET(request:Request) {
  return withCmsDataRoute(request,async access=>{
    const {data,error}=await readCmsReference(cmsReader(access),'products')
    return error?Response.json({error:'Unable to load linked products.'},{status:503}):Response.json({items:data},{headers:{'Cache-Control':'no-store'}})
  })
}
