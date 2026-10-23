import 'server-only'
import { ZodError } from 'zod'
import type { AdminActor } from './auth/admin-identity-core'
import type { DbExecutor } from './db/query'
import { adminTransaction } from './db/pool'
import { mapAdminDbError } from './db/errors'
import { authorizeProductRequest } from './product-session-runtime'
import { ProductSessionError } from './product-session-error'
import { readOperationsProvider } from './operations-provider'
import { OperationsError } from './db/admin-repositories/operations-shared'
import { couponDatabaseError } from './coupon-save'
import { settingsDatabaseError } from './settings-validation'
import { adminMutationError } from './order-inventory-validation'
export type OperationsRdsAccess = {provider:'rds';actor:AdminActor;db:DbExecutor;afterCommit:(effect:()=>Promise<Response|void>)=>void}
export type OperationsAccess = OperationsRdsAccess
export function operationsError(error: unknown,request?:Request) {
  const mapped = mapAdminDbError(error)
  if(request && !['GET','HEAD'].includes(request.method) && mapped.sqlState && !['permission','unavailable'].includes(mapped.kind)){
    const path=new URL(request.url).pathname
    const failure={code:mapped.sqlState==='40P01'?'40001':mapped.sqlState}
    const safe=path.startsWith('/api/coupons') && !['40001','PT409'].includes(failure.code) ? couponDatabaseError(failure,request.method==='DELETE'?'delete':'save')
      : path==='/api/settings' && !['40001','PT409'].includes(failure.code) ? settingsDatabaseError(failure)
      : /^\/api\/orders\//.test(path) && failure.code!=='PT409' ? adminMutationError(failure,'order') : undefined
    if(safe)return Response.json({error:safe.message},{status:safe.status,headers:{'Cache-Control':'no-store'}})
  }
  const path = request ? new URL(request.url).pathname : null
  const status = error instanceof OperationsError ? error.status : error instanceof ProductSessionError ? error.status : error instanceof ZodError ? 400
    : mapped.kind==='permission' ? 403 : mapped.sqlState==='P0002' ? 404 : mapped.kind==='conflict' || mapped.sqlState==='23503' ? 409
    : mapped.kind==='invalid' || ['22023','23502'].includes(mapped.sqlState ?? '') ? 400 : 503
  const message = error instanceof OperationsError ? error.message : status===401 ? 'Unauthorized.' : status===403 ? 'Administrator access is required.' : status===400 ? 'Invalid operation details.' : status===409 ? 'The record changed or is still referenced. Reload before continuing.' : status===404 ? 'Record not found.' : 'Operations service unavailable. No fallback was attempted.'
  // Server log only: lets the operator see why a request failed without exposing database text to the browser.
  if(status>=500)console.error('[admin-operations]',JSON.stringify({method:request?.method??null,path,status,kind:mapped.kind,sqlState:mapped.sqlState??null,source:error instanceof ProductSessionError?'session':error instanceof OperationsError?'operations':error instanceof ZodError?'validation':'database'}))
  return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}})
}
type Dependencies = {provider:()=> 'rds';authorize:typeof authorizeProductRequest;transaction:<T>(run:(db:DbExecutor)=>Promise<T>)=>Promise<T>}
export function createOperationsRoute(deps:Dependencies) {
  return async (request:Request,run:(access:OperationsAccess)=>Promise<Response>) => {
    try {
      deps.provider()
      const {actor}=await deps.authorize(request,!['GET','HEAD'].includes(request.method))
      const effects:Array<()=>Promise<Response|void>>=[]
      let response=await deps.transaction(async db=>{
        let failure:unknown
        const checked:DbExecutor={query:async(sql,values)=>{try{return await db.query(sql,values)}catch(e){failure=e;throw e}}}
        const result=await run({provider:'rds',actor,db:checked,afterCommit:effect=>effects.push(effect)})
        if(failure)throw failure
        if(result.status>=400 && effects.length)throw new Error('Effect on failed operation')
        return result
      })
      // Commit failure never sends mail. Effect implementations map their own delivery failures.
      for(const effect of effects){const result=await effect();if(result)response=result}
      response.headers.set('Cache-Control','no-store')
      return response
    }catch(error){return operationsError(error,request)}
  }
}
export const withOperationsRoute=createOperationsRoute({provider:()=>readOperationsProvider(process.env),authorize:authorizeProductRequest,transaction:adminTransaction})
export const isOperationsRds=(access:OperationsAccess):access is OperationsRdsAccess=>'provider' in access && access.provider==='rds'
