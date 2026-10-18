import 'server-only'
import { z } from 'zod'
import type { AdminActor } from './auth/admin-identity-core'
import type { DbExecutor } from './db/query'
import { adminTransaction } from './db/pool'
import { mapAdminDbError } from './db/errors'
import { authorizeProductRequest } from './product-session-runtime'
import { ProductSessionError } from './product-session-error'
import { readCatalogDataProvider } from './catalog-provider'
import { createCatalogRepository } from './db/admin-repositories/catalog'
import { createNavbarRepository } from './db/admin-repositories/navbar'
import { loadRdsProductBootstrap } from './db/admin-repositories/product-bootstrap'
import { catalogHierarchyErrorResponse, deleteCatalogHierarchy, loadCatalogHierarchyList, saveCatalogHierarchy } from './catalog-hierarchy-save'
import { catalogMasterErrorResponse, deleteCatalogMaster, listCatalogMasters, saveCatalogMaster } from './catalog-master-save'
import { catalogMetalErrorResponse, deleteCatalogMetal, listCatalogMetals, saveCatalogMetal } from './catalog-metal-save'
import { catalogRingErrorResponse, getCatalogRing, loadCatalogRingSnapshot, saveCatalogRing } from './catalog-ring-save'
import { loadRdsNavbarBuilderData } from './navbar-data'
import { navbarSaveErrorResponse, saveNavbarItem } from './navbar-save'

type Dependencies = {
  provider: () => 'supabase' | 'rds'
  authorize: (request: Request, mutation: boolean) => Promise<{ actor: AdminActor }>
  transaction: <T>(run: (db: DbExecutor) => Promise<T>) => Promise<T>
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
const hierarchy = { categories: 'category', subcategories: 'subcategory', options: 'option' } as const
const masters = { 'gst-slabs': 'gst_slab', certificates: 'certificate', 'material-values': 'material_value', 'ring-sizes': 'ring_size', 'stone-shapes': 'stone_shape', styles: 'style', 'product-content-rules': 'content_rule' } as const

/** Legacy return is permitted only before authorization or DB work starts. */
export function createCatalogRdsHandlers(deps: Dependencies) {
  return async (request: Request, rawId?: string): Promise<Response | null> => {
    try { if (deps.provider() === 'supabase') return null } catch { return response({ error: 'Catalog service unavailable.' }, 503) }
    const parts = new URL(request.url).pathname.split('/').filter(Boolean)
    const navbar = parts[1] === 'navbar'
    const resource = parts[2] ?? ''
    // Preserve obsolete full-save endpoint even under RDS selection.
    if (navbar && !resource && request.method === 'PUT') return response({ error: 'This navbar editor session is outdated. Reload the page before saving.' }, 410)
    let actor: AdminActor
    const mutation = !['GET', 'HEAD'].includes(request.method)
    try { ({ actor } = await deps.authorize(request, mutation)) }
    catch (error) {
      const status = error instanceof ProductSessionError ? error.status : 503
      return response({ error: status === 401 ? 'Unauthorized.' : status === 403 ? 'Forbidden.' : 'Administrator session unavailable.' }, status)
    }
    try {
      const body = mutation ? await request.json().catch(() => null) : null
      const completed = await deps.transaction(async db => {
        const catalog = createCatalogRepository(db, actor)
        const access = { provider: 'rds' as const, actor, catalog, navbar: createNavbarRepository(db, actor) }
        if (navbar) {
          if (request.method === 'GET' && !resource) return response(await loadRdsNavbarBuilderData(db))
          if (request.method === 'PUT' && rawId) return saveNavbarItem(access, rawId, body)
          return response({ error: 'Method not allowed.' }, 405)
        }
        if (resource === 'bootstrap') {
          const scope = z.enum(['basics', 'pricing', 'attributes', 'content', 'all']).safeParse(new URL(request.url).searchParams.get('scope') ?? 'all')
          if (!scope.success) return response({ error: 'Invalid catalog bootstrap scope.' }, 400)
          return response(await loadRdsProductBootstrap(db, scope.data))
        }
        if (Object.hasOwn(hierarchy, resource)) {
          const kind = hierarchy[resource as keyof typeof hierarchy]
          if (request.method === 'GET') return response({ items: await loadCatalogHierarchyList(catalog, kind) })
          if (request.method === 'DELETE' && rawId) return deleteCatalogHierarchy(access, kind, rawId, body)
          return saveCatalogHierarchy(access, kind, rawId ?? null, body)
        }
        if (Object.hasOwn(masters, resource)) {
          const kind = masters[resource as keyof typeof masters]
          if (request.method === 'GET') return listCatalogMasters(access, kind)
          if (request.method === 'DELETE' && rawId) return deleteCatalogMaster(access, kind, rawId, body)
          return saveCatalogMaster(access, kind, rawId ?? null, body)
        }
        if (resource === 'metals') {
          if (request.method === 'GET') return listCatalogMetals(access)
          if (request.method === 'DELETE' && rawId) return deleteCatalogMetal(access, rawId, body)
          return saveCatalogMetal(access, rawId ?? null, body)
        }
        if (['ring-catalog', 'ring-categories', 'ring-category-sizes'].includes(resource)) {
          if (request.method !== 'GET') return saveCatalogRing(access, body)
          if (resource === 'ring-catalog') return getCatalogRing(access)
          const snapshot = await loadCatalogRingSnapshot(catalog)
          return response({ items: resource === 'ring-categories' ? snapshot.categories : snapshot.sizes, revision: snapshot.revision })
        }
        return response({ error: 'Unsupported catalog operation.' }, 400)
      })
      completed.headers.set('Cache-Control', 'no-store')
      return completed
    } catch (error) {
      const mapped = mapAdminDbError(error)
      const code = mapped.sqlState
      if (mutation && mapped.kind !== 'unavailable' && mapped.kind !== 'permission') {
        const error = { code: code === '40P01' || (!navbar && code === 'PT409') ? '40001' : code }
        const action = request.method === 'DELETE' ? 'delete' : 'save'
        const mappedResponse = navbar ? navbarSaveErrorResponse(error)
          : Object.hasOwn(hierarchy, resource) ? catalogHierarchyErrorResponse(error, action)
          : Object.hasOwn(masters, resource) ? catalogMasterErrorResponse(error, action)
          : resource === 'metals' ? catalogMetalErrorResponse(error, action)
          : catalogRingErrorResponse(error)
        mappedResponse.headers.set('Cache-Control', 'no-store')
        return mappedResponse
      }
      const status = mapped.kind === 'permission' ? 403
        : mapped.kind === 'unavailable' ? 503
        : ['40001', 'PT409', 'P0001', '40P01'].includes(code ?? '') ? 409
        : code === 'P0002' ? 404
        : ['22023', '22P02', '23502', '23503', '23505', '23514'].includes(code ?? '') ? 400
        : mutation ? 500 : 503
      const message = status === 403 ? 'Administrator access is required.'
        : status === 409 ? 'This record changed or conflicts with another saved record. Reload before continuing.'
        : status === 404 ? 'This record no longer exists.'
        : status === 400 ? 'The catalog or navbar contains invalid or conflicting data.'
        : status === 503 ? 'Catalog database unavailable. No fallback was attempted.'
        : 'Unable to save this record. No partial changes were committed.'
      return response({ error: message }, status)
    }
  }
}
export const runCatalogRdsRoute = createCatalogRdsHandlers({ provider: () => readCatalogDataProvider(process.env), authorize: authorizeProductRequest, transaction: adminTransaction })
