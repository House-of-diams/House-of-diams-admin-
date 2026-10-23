import 'server-only'
import { readProductDataProvider } from './product-provider'
import { authorizeProductPage } from './product-server-request'
import { adminTransaction } from './db/pool'
import { findRdsProductId, loadRdsProductEditor } from './db/admin-repositories/product-editor'
import { revisionOf } from './revision'

export async function loadProductEditorPage(lookup: string): Promise<{ status: 'not_found' } | { status: 'found'; item: Awaited<ReturnType<typeof loadRdsProductEditor>> & { revision: string } }> {
  readProductDataProvider(process.env)
  await authorizeProductPage()
  return adminTransaction(async db => {
    const id = await findRdsProductId(db, lookup)
    if (!id) return { status: 'not_found' as const }
    const item = await loadRdsProductEditor(db, id)
    return item ? { status: 'found' as const, item: { ...item, revision: revisionOf(item) } } : { status: 'not_found' as const }
  }, { snapshot: true })
}
