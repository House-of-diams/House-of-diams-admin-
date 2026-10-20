import { providerRouteGate } from '@/lib/provider-route-gate'
import { readOperationsProvider } from '@/lib/operations-provider'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET() {
  const denied = await providerRouteGate()
  if (denied) return denied
  try{return Response.json({provider:readOperationsProvider(process.env)},{headers:{'Cache-Control':'no-store'}})}
  catch{return Response.json({error:'Operations configuration unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
