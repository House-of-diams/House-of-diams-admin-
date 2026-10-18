import 'server-only'
import { readProductDataProvider } from './product-provider'
import { authorizeProductPage } from './product-server-request'
import { createSupabaseAdminClient } from './admin-supabase'
import { loadProductEditorItem } from './product-editor-data'
import { adminTransaction } from './db/pool'
import { findRdsProductId, loadRdsProductEditor } from './db/admin-repositories/product-editor'

export async function loadProductEditorPage(lookup: string): Promise<Awaited<ReturnType<typeof loadProductEditorItem>>> {
  if (readProductDataProvider(process.env) === 'supabase') return loadProductEditorItem(createSupabaseAdminClient(), lookup)
  await authorizeProductPage()
  return adminTransaction(async db => {
    const id = await findRdsProductId(db, lookup)
    if (!id) return { status: 'not_found' as const }
    const item = await loadRdsProductEditor(db, id)
    return item ? { status: 'found' as const, item } : { status: 'not_found' as const }
  }, { snapshot: true })
}
