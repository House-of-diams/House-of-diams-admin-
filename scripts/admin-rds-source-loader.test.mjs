import assert from 'node:assert/strict'
import test from 'node:test'
import { createSourceLoader } from './admin-rds-source-loader.mjs'
import { connectionFailure } from './admin-rds-connection-diagnostics.mjs'

const load = createSourceLoader(process.cwd())

test('actual product list/editor modules load without a server and use the supplied executor', async () => {
  const { loadRdsProductList } = await import(await load('lib/db/admin-repositories/product-list.ts'))
  const { loadRdsProductEditor } = await import(await load('lib/db/admin-repositories/product-editor.ts'))
  const id = '12345678-1234-4234-9234-123456789abc'
  const statements = []
  const db = { async query(sql, values) {
    statements.push({ sql, values })
    if (sql.startsWith('SELECT count')) return { rows: [{ total: '1' }] }
    if (sql.includes('AS metals')) return { rows: [{ item: { id, categoryPath: '' }, metals: [], linked_subcategories: [], linked_options: [] }] }
    if (sql.includes('FROM public.products p WHERE p.id')) return { rows: [{ item: { id } }] }
    return { rows: [] }
  } }
  const list = await loadRdsProductList(db, undefined, 1, '')
  assert.equal(list.total, 1)
  assert.equal(list.items[0].id, id)
  const editor = await loadRdsProductEditor(db, id)
  assert.equal(editor.id, id)
  assert.deepEqual(editor.metal_variants, [])
  assert.ok(statements.every(s => s.sql.startsWith('SELECT ')))
  assert.ok(statements.some(s => s.sql.includes('product_custom_dropdowns')))
})

test('actual bootstrap loader visits all sections and propagates query errors', async () => {
  const { loadRdsProductBootstrap } = await import(await load('lib/db/admin-repositories/product-bootstrap.ts'))
  const queries = []
  const references = await loadRdsProductBootstrap({ async query(sql) {
    queries.push(sql)
    return { rows: [{ result: sql.includes('catalog_ring_snapshot_v1') ? { categories: [], sizes: [] } : [] }] }
  } }, 'all')
  assert.ok(Object.keys(references).length >= 10)
  assert.ok(Object.values(references).every(Array.isArray))
  assert.ok(queries.some(sql => sql.includes('navbar_items')))
  await assert.rejects(loadRdsProductBootstrap({ async query() { throw new Error('denied') } }, 'all'), /denied/)
})

test('product SQL failures retain only the safe stage and code', () => {
  const result = connectionFailure({ code: '42703', message: 'private-query-text' }, { stage: 'product_editor' })
  assert.equal(result.stage, 'product_editor')
  assert.equal(result.code, '42703')
  assert.ok(!JSON.stringify(result).includes('private-query-text'))
})

test('actual order and contact repositories resolve their lazy JSON parser imports', async () => {
  const { createOrdersRepository } = await import(await load('lib/db/admin-repositories/orders.ts'))
  const { createEnquiriesRepository } = await import(await load('lib/db/admin-repositories/enquiries.ts'))
  const db = {async query(){return {rows:[{total:'0',items:'[]'}]}}}
  assert.equal((await createOrdersRepository(db).list(1)).total,0)
  assert.equal((await createEnquiriesRepository(db).contactPage(1,1)).total,0)
})
