import { homeGroup1Error } from './cms-home-group1-save'
import { contentListError } from './cms-content-list-save'
import { categoryError } from './cms-faq-category-error'
import 'server-only'
import { singletonError } from './cms-singleton-save'
import { errorResponse as relationalError } from './cms-relational-save'
import { articleError } from './cms-article-save'
import { docsError } from './cms-docs-save'
import { errorResponse as heroError } from './bespoke-hero-save'
import { saveErrorResponse as formError } from './bespoke-form-save'
import { reelsSaveError } from './cms-reels-save'
import { portfolioMutationError } from './bespoke-portfolio-validation'
import type { AdminActor } from './auth/admin-identity-core'
import type { DbExecutor } from './db/query'
import type { CmsAccess } from './cms-command'
import { assertAdmin } from './cms-auth'
import { adminTransaction } from './db/pool'
import { mapAdminDbError } from './db/errors'
import { authorizeProductRequest } from './product-session-runtime'
import { ProductSessionError } from './product-session-error'
import { createCmsRepository } from './db/admin-repositories/cms'
import { readCmsDataProvider } from './cms-provider'

type Dependencies = {
  provider: () => 'supabase' | 'rds'
  authorize: (request: Request, mutation: boolean) => Promise<{ actor: AdminActor }>
  transaction: <T>(run: (db: DbExecutor) => Promise<T>) => Promise<T>
  legacy: typeof assertAdmin
}
export function cmsErrorResponse(error: unknown, request?: Request) {
  const mapped = mapAdminDbError(error)
  const code = mapped.sqlState
  if (code && request && !['GET','HEAD'].includes(request.method) && mapped.kind !== 'permission' && mapped.kind !== 'unavailable' && !(error instanceof ProductSessionError)) {
    const path = new URL(request.url).pathname
    const failure = {code:code==='40P01'?'40001':code}
    let result: Response | undefined
    if (/\/bespoke\/portfolio-/.test(path)) {
      const safe=portfolioMutationError(failure,path.includes('categories')?'category':'item',request.method==='DELETE'?'delete':'save')
      result=Response.json({error:safe.message},{status:safe.status})
    } else if (path==='/api/bespoke/hero') result=heroError(failure)
    else if (path==='/api/bespoke/form-config') result=formError(failure)
    else if (path==='/api/cms/support/faq/categories') result=categoryError(failure)
    else if (/\/cms\/(?:blog|education)\/posts/.test(path)) result=articleError(failure,request.method==='DELETE'?'delete':'save')
    else if (path.startsWith('/api/cms/docs/')) result=docsError(failure,'save')
    else if (path==='/api/cms/home/reels') { const safe=reelsSaveError(failure);result=Response.json({error:safe.message},{status:safe.status}) }
    else if (/\/(?:promotion|summary|checkout-result|service-banner|support\/(?:faq|announcement-bar))$/.test(path)) result=relationalError(failure)
    else if (/\/cms\/home\/(?:hero|collection|certifications|discover-shapes|bestsellers|shop-by-category)$/.test(path)) result=homeGroup1Error(failure)
    else if (/\/cms\/(?:about\/(?:values|timeline|founders)|contact\/info|bespoke\/(?:process|manufacturing))$/.test(path)) result=contentListError(failure)
    else if (/\/(?:hero|wide-banner|bespoke-showcase|collection-page|hiphop-showcase)$/.test(path)) result=singletonError(failure)
    if (result) { result.headers.set('Cache-Control','no-store');return result }
  }
  const status = error instanceof ProductSessionError ? error.status
    : mapped.kind === 'permission' ? 403 : mapped.kind === 'unavailable' ? 503
    : ['40001','40P01','PT409'].includes(code ?? '') ? 409 : code === 'P0002' ? 404
    : ['22023','22P02','23502','23503','23505','23514'].includes(code ?? '') ? 400 : 503
  return Response.json({ error: status === 401 ? 'Unauthorized.' : status === 403 ? 'Administrator access is required.'
    : status === 409 ? 'This content changed or the request was reused. Reload before continuing.'
    : status === 404 ? 'Content not found.' : status === 400 ? 'The content contains invalid or conflicting data.'
    : 'Content service unavailable. No fallback was attempted.' }, { status, headers: { 'Cache-Control': 'no-store' } })
}
export function createCmsDataRoute(deps: Dependencies) {
  return async (request: Request, run: (access: CmsAccess) => Promise<Response>): Promise<Response> => {
    try {
      if (deps.provider() === 'supabase') {
        const access = await deps.legacy(request)
        if ('error' in access) return access.error ?? cmsErrorResponse(new Error('Authorization unavailable'))
        return run(access)
      }
      const { actor } = await deps.authorize(request, !['GET','HEAD'].includes(request.method))
      const result = await deps.transaction(async db => {
        // A caught read failure must still roll back; never commit an aborted/partial operation.
        let failure: unknown
        const checked: DbExecutor = { query: async (sql, values) => {
          try { return await db.query(sql, values) } catch (error) { failure = error; throw error }
        } }
        const response = await run({ provider: 'rds', actor, cms: createCmsRepository(checked, actor), db: checked })
        if (failure) throw failure
        return response
      })
      result.headers.set('Cache-Control','no-store')
      return result
    } catch (error) { return cmsErrorResponse(error, request) }
  }
}
export const withCmsDataRoute = createCmsDataRoute({ provider: () => readCmsDataProvider(process.env), authorize: authorizeProductRequest, transaction: adminTransaction, legacy: assertAdmin })
