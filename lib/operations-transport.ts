'use client'
// HOD-066: provider and CSRF reused for 60 s within this page; any 401/403 drops them.
let context:{provider: 'rds';csrf:string;at:number}|null=null
const CONTEXT_MS=60_000
export function forgetOperationsRequestContext(){context=null}
async function requestContext(){
  if(context && Date.now()-context.at<CONTEXT_MS)return context
  context=null
  const contract=await fetch('/api/operations/provider',{credentials:'same-origin',cache:'no-store'})
  const payload=await contract.json()
  if(!contract.ok || payload?.provider !== 'rds')throw new Error('Operations service unavailable.')
  let csrf=''
  if(payload.provider==='rds'){
    const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'})
    const session=await response.json()
    if(!response.ok || session?.authenticated!==true || typeof session.csrfToken!=='string' || !session.csrfToken)throw new Error('Please sign in again.')
    csrf=session.csrfToken
  }
  context={provider:payload.provider,csrf,at:Date.now()}
  return context
}
export async function operationsHeaders(mutation=true):Promise<Headers> {
  const current=await requestContext()
  const headers=new Headers({'content-type':'application/json'})
  if (mutation) headers.set('x-admin-csrf', current.csrf)
  return headers
}
export async function operationsFetch(url:string,options:RequestInit={}) {
  if(!/^\/api\/(?:orders(?:\/[0-9a-f-]{36})?|coupons(?:\/[1-9][0-9]*)?|notifications\/(?:read|read-all)|settings(?:\/password)?|cms\/contact\/submissions)(?:\?[^#]*)?$/i.test(url))throw new Error('Invalid operations path.')
  try{
    const headers=await operationsHeaders(!['GET','HEAD'].includes((options.method??'GET').toUpperCase()))
    new Headers(options.headers).forEach((v,k)=>{if(!['authorization','x-admin-csrf'].includes(k.toLowerCase()))headers.set(k,v)})
    const response=await fetch(url,{...options,headers,credentials:'same-origin',cache:'no-store'})
    if(response.status===401||response.status===403)context=null
    return response
  }catch{return Response.json({error:'Operations request unavailable. Please sign in again or retry after the service is restored.'},{status:503})}
}
