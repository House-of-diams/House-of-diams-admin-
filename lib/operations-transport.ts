'use client'
export async function operationsHeaders(mutation=true):Promise<Headers> {
  const contract=await fetch('/api/operations/provider',{credentials:'same-origin',cache:'no-store'})
  const payload=await contract.json()
  if(!contract.ok || !['supabase','rds'].includes(payload?.provider))throw new Error('Operations service unavailable.')
  const headers=new Headers({'content-type':'application/json'})
  if(payload.provider==='rds'){
    const response=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'})
    const session=await response.json()
    if(!response.ok || session?.authenticated!==true || typeof session.csrfToken!=='string' || !session.csrfToken)throw new Error('Please sign in again.')
    if(mutation)headers.set('x-admin-csrf',session.csrfToken)
  }else{
    const {supabase}=await import('./supabase')
    const {data}=await supabase.auth.getSession()
    if(!data.session?.access_token)throw new Error('Please sign in again.')
    headers.set('authorization',`Bearer ${data.session.access_token}`)
  }
  return headers
}
export async function operationsFetch(url:string,options:RequestInit={}) {
  if(!/^\/api\/(?:orders(?:\/[0-9a-f-]{36})?|coupons(?:\/[1-9][0-9]*)?|notifications\/(?:read|read-all)|settings(?:\/password)?|cms\/contact\/submissions)(?:\?[^#]*)?$/i.test(url))throw new Error('Invalid operations path.')
  try{
    const headers=await operationsHeaders(!['GET','HEAD'].includes((options.method??'GET').toUpperCase()))
    new Headers(options.headers).forEach((v,k)=>{if(!['authorization','x-admin-csrf'].includes(k.toLowerCase()))headers.set(k,v)})
    return await fetch(url,{...options,headers,credentials:'same-origin',cache:'no-store'})
  }catch{return Response.json({error:'Operations request unavailable. Please sign in again or retry after the service is restored.'},{status:503})}
}
