import { readOperationsProvider } from '@/lib/operations-provider'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export function GET() {
  try{return Response.json({provider:readOperationsProvider(process.env)},{headers:{'Cache-Control':'no-store'}})}
  catch{return Response.json({error:'Operations configuration unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
