import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AdminActor } from './auth/admin-identity-core'
import { authorizeProductRequest } from './product-session-runtime'
import { ProductSessionError } from './product-session-error'
import { adminTransaction } from './db/pool'
import { mapAdminDbError } from './db/errors'
import type { AdminTransactionOptions, DbExecutor } from './db/query'
import { createProductRepository } from './db/admin-repositories/products'
import { createInventoryRepository } from './db/admin-repositories/inventory'
import { loadRdsProductList, loadRdsProductSummaries } from './db/admin-repositories/product-list'
import { findRdsProductId, loadRdsProductEditor } from './db/admin-repositories/product-editor'
import { saveRdsProduct } from './db/admin-repositories/product-save'
import { loadRdsProductBootstrap } from './db/admin-repositories/product-bootstrap'
import { productPayloadSchema, productPayloadErrorMessage, safeProductSaveError } from './product-payload-validation'
import { readProductDataProvider } from './product-provider'
import { revisionOf, REVISION_HEADER, STALE_EDITOR_MESSAGE } from './revision'
import { activateDraftsSchema, bulkDeleteSchema, bulkPriceByMetalSchema, bulkPriceMetalsSchema, bulkPricePreviewSchema, duplicateProductSchema, productOperationError, productStatusSchema } from './product-operations-validation'
import { adminMutationError, inventoryUpdateSchema } from './order-inventory-validation'

type Action = 'product-all' | 'bootstrap' | 'create' | 'read-id' | 'read-slug' | 'save-id' | 'save-slug' | 'single-delete' | 'product-list' | 'inventory-list' | 'inventory-stock' | 'price' | 'delete' | 'activate' | 'duplicate' | 'status'
type Dependencies = {
  provider: () => 'rds'
  authorize: (request: Request, mutation: boolean) => Promise<{ actor: AdminActor }>
  transaction: <T>(run: (db: DbExecutor) => Promise<T>, options?: AdminTransactionOptions) => Promise<T>
}
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })

export function createProductRdsHandlers(deps: Dependencies) {
  return async (action: Action, request: Request, rawId?: string): Promise<Response> => {
    try { deps.provider() } catch { return response({ error: 'Product service unavailable.' }, 503) }
    let actor: AdminActor
    try { ({ actor } = await deps.authorize(request, !['GET', 'HEAD'].includes(request.method))) }
    catch (error) {
      const status = error instanceof ProductSessionError ? error.status : 503
      return response({ error: status === 401 ? 'Unauthorized.' : status === 403 ? 'Forbidden.' : 'Administrator session unavailable.' }, status)
    }
    try {
      if (action === 'product-all') return response({ items: await deps.transaction(loadRdsProductSummaries) })
      if (action === 'bootstrap') {
        const scope = z.enum(['basics', 'pricing', 'attributes', 'content', 'all']).safeParse(new URL(request.url).searchParams.get('scope') ?? 'all')
        if (!scope.success) return response({ error: 'Invalid product bootstrap scope.' }, 400)
        return response(await deps.transaction(db => loadRdsProductBootstrap(db, scope.data)))
      }
      if (['read-id', 'read-slug', 'save-id', 'save-slug', 'create', 'single-delete'].includes(action)) {
        const saving = action === 'create' || action.startsWith('save-')
        const parsed = saving ? productPayloadSchema.safeParse(await request.json().catch(() => null)) : null
        if (parsed && !parsed.success) return response({ error: productPayloadErrorMessage(parsed.error) }, 400)
        return await deps.transaction(async db => {
          if (action === 'single-delete') {
            const id = z.string().uuid().safeParse(rawId)
            if (!id.success) return response({ error: 'Unable to delete this product.' }, 500)
            // Still successful if the row has already disappeared. The database leaves a
            // 301 from the old product address (admin_product_delete_v2).
            await createProductRepository(db).deleteOne(actor, id.data, randomUUID())
            return response({ ok: true })
          }
          const id = action === 'create' ? null : await findRdsProductId(db, rawId ?? '', action.endsWith('-id'))
          if (action !== 'create' && !id) return response({ error: action === 'read-id' ? 'Unable to load the product.' : 'Product not found.' }, action === 'read-id' ? 500 : 404)
          if (saving && parsed?.success) {
            if (id) {
              // HOD-054: refuse if the product changed since this editor opened it.
              const expected = request.headers.get(REVISION_HEADER)
              await db.query('SELECT id FROM public.products WHERE id=$1::uuid FOR UPDATE', [id])
              const current = await loadRdsProductEditor(db, id)
              if (!expected || !current || revisionOf(current) !== expected) return response({ error: STALE_EDITOR_MESSAGE }, 409)
            }
            const result = await saveRdsProduct(db, actor, parsed.data, id)
            return 'error' in result ? response({ error: result.error }, 400) : response(result.data)
          }
          const item = await loadRdsProductEditor(db, id!)
          return response({ item: item && { ...item, revision: revisionOf(item) } })
        }, { snapshot: action === 'read-id' || action === 'read-slug' })
      }
      if (action === 'product-list') {
        const params = new URL(request.url).searchParams
        const lane = z.enum(['standard', 'hiphop', 'collection']).safeParse(params.get('lane'))
        if (!lane.success) return response({ error: 'Invalid product lane.' }, 400)
        const page = z.coerce.number().int().min(1).max(100_000).safeParse(params.get('page') ?? '1')
        if (!page.success) return response({ error: 'Invalid page number.' }, 400)
        const query = z.string().trim().max(100).refine(value => !/[(),]/.test(value)).safeParse(params.get('q') ?? '')
        if (!query.success) return response({ error: 'Invalid product search.' }, 400)
        return response(await deps.transaction(db => loadRdsProductList(db, lane.data, page.data, query.data), { snapshot: true }))
      }
      if (action === 'inventory-list') {
        const input = z.string().max(200).safeParse(new URL(request.url).searchParams.get('q') ?? '')
        if (!input.success) return response({ error: 'Search query is too long.' }, 400)
        return response({ items: await deps.transaction(db => createInventoryRepository(db).list(input.data)) })
      }
      const body = await request.json().catch(() => null)
      if (action === 'inventory-stock' || action === 'duplicate' || action === 'status') {
        const id = z.string().uuid().safeParse(rawId)
        if (!id.success) return response({ error: action === 'duplicate' ? 'Invalid source product ID.' : 'Invalid product ID.' }, 400)
        if (action === 'inventory-stock') {
          const input = inventoryUpdateSchema.safeParse(body)
          if (!input.success) return response({ error: input.error.issues[0]?.message ?? 'Invalid stock update.' }, 400)
          return response({ ok: true, item: await deps.transaction(db => createInventoryRepository(db).setStock(actor, id.data, input.data)) })
        }
        if (action === 'status') {
          const input = productStatusSchema.safeParse(body)
          if (!input.success) return response({ error: input.error.issues[0]?.message ?? 'Invalid product status request.' }, 400)
          const result = await deps.transaction(db => createProductRepository(db).setStatus(id.data, input.data.status, input.data.expected_status))
          if (result.status === 'updated') return response({ item: result.item })
          return response({ error: result.status === 'conflict' ? 'This product status changed after you loaded it. Refresh the list and try again.' : 'Product not found.' }, result.status === 'conflict' ? 409 : 404)
        }
        const input = duplicateProductSchema.safeParse(body)
        if (!input.success) return response({ error: input.error.issues[0]?.message ?? 'Invalid product duplication request.' }, 400)
        return await deps.transaction(async db => {
          const repo = createProductRepository(db)
          const source = await repo.source(id.data)
          if (!source) return response({ error: 'Source product not found.' }, 404)
          if (!['standard', 'hiphop', 'collection'].includes(source.product_lane ?? 'standard')) return response({ error: 'The source product is not eligible for duplication.' }, 409)
          return response({ item: await repo.duplicate(actor, id.data, input.data.requestId) }, 201)
        }, { repeatableWrite: true })
      }
      if (action === 'price') {
        // HOD-006: metals -> preview -> apply. Prices change on the chosen metal
        // variants, which the storefront shows and charges.
        const kind = body && typeof body === 'object' ? (body as { action?: unknown }).action : undefined
        if (kind === 'metals') {
          if (!bulkPriceMetalsSchema.safeParse(body).success) return response({ error: 'Invalid bulk price request.' }, 400)
          return response({ metals: await deps.transaction(db => createProductRepository(db).bulkPriceMetals(), { snapshot: true }) })
        }
        if (kind === 'preview') {
          const input = bulkPricePreviewSchema.safeParse(body)
          if (!input.success) return response({ error: input.error.issues[0]?.message ?? 'Invalid bulk price preview.' }, 400)
          return response({ variants: await deps.transaction(db => createProductRepository(db).bulkPricePreview(input.data), { snapshot: true }) })
        }
        const input = bulkPriceByMetalSchema.safeParse(body)
        if (!input.success) return response({ error: input.error.issues[0]?.message ?? 'Invalid bulk price request.' }, 400)
        return response(await deps.transaction(db => createProductRepository(db).bulkPriceByMetal(actor, input.data)))
      }
      if (action === 'delete') {
        const input = bulkDeleteSchema.safeParse(body)
        if (!input.success) return response({ error: input.error.issues[0]?.message ?? 'Invalid bulk deletion request.' }, 400)
        return response(await deps.transaction(db => createProductRepository(db).bulkDelete(actor, input.data)))
      }
      const input = activateDraftsSchema.safeParse(body)
      if (!input.success) return response({ error: input.error.issues[0]?.message ?? 'Invalid draft activation request.' }, 400)
      return response(await deps.transaction(db => createProductRepository(db).activateDrafts(actor, input.data)))
    } catch (error) {
      const mapped = mapAdminDbError(error)
      if (action === 'inventory-list') return response({ error: 'Unable to load inventory.' }, 503)
      if (action === 'product-list') return response({ error: 'Unable to load products.' }, 503)
      if (action === 'bootstrap') return response({ error: 'Unable to load the catalog editor data.' }, 503)
      if (action === 'read-id' || action === 'read-slug' || action === 'product-all') return response({ error: 'Unable to load the complete product.' }, 500)
      if (mapped.kind === 'unavailable') return response({ error: 'Product database unavailable. No fallback was attempted.' }, 503)
      if (mapped.kind === 'permission') return response({ error: 'Administrator access is required.' }, 403)
      if (['create', 'save-id', 'save-slug'].includes(action)) {
        const safe = safeProductSaveError({ code: mapped.sqlState })
        return response({ error: safe.message }, safe.status)
      }
      if (action === 'single-delete') return response({ error: mapped.sqlState === '23503' ? 'This product is referenced and cannot be deleted.' : 'Unable to delete this product.' }, mapped.sqlState === '23503' ? 409 : 500)
      const safe = action === 'inventory-stock' ? adminMutationError({ code: mapped.sqlState }, 'inventory')
        : productOperationError({ code: mapped.sqlState }, ['status', 'duplicate', 'price', 'delete', 'activate'].includes(action) ? action as 'status' | 'duplicate' | 'price' | 'delete' | 'activate' : 'status')
      return response({ error: safe.message }, safe.status)
    }
  }
}
export const runProductRdsRoute = createProductRdsHandlers({
  provider: () => readProductDataProvider(process.env), authorize: authorizeProductRequest, transaction: adminTransaction,
})
