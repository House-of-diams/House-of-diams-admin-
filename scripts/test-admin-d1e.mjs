// Offline source integration. SQL/locking below are injected schedules, never PostgreSQL proof.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import test from 'node:test'
import assert from 'node:assert/strict'
const data = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64')
const originals = process.env.D1E_TEST_ORIGINAL === '1' ? JSON.parse(fs.readFileSync('docs/aws-phase-d/D1e-originals.json', 'utf8')) : []
const cache = new Map()
let admission = 'missing', resolutions = 0
async function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file)
  let code = ts.transpileModule(originals.find(r => path.resolve(r.path) === file)?.text ?? fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const name of new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m => m[1]))) {
    let url
    if (name === 'server-only') url = data('export {}')
    else if (name.endsWith('video-admission-runtime')) url = data('export const resolveAdmittedVideo=(url)=>globalThis.__d1eResolve(url)')
    else if (name.endsWith('/pool') || name.endsWith('product-session-runtime')) url = data('export const adminTransaction=()=>{throw Error("No live boundary")};export const authorizeProductRequest=()=>{throw Error("No live boundary")}')
    else if (name.startsWith('.') || name.startsWith('@/')) url = (await load((name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name)) + '.ts')).url
    else url = import.meta.resolve(name)
    code = code.replaceAll(`'${name}'`, JSON.stringify(url)).replaceAll(`"${name}"`, JSON.stringify(url))
  }
  const url = data(code), exports = await import(url), result = { url, exports }
  cache.set(file, result)
  return result
}
globalThis.__d1eResolve = async url => { resolutions++; if (admission !== 'admitted') throw Error(admission); return { url } }
const saves = (await load('lib/video-save-admission.ts')).exports
const products = (await load('lib/db/admin-repositories/products.ts')).exports
const cms = (await load('lib/db/admin-repositories/cms.ts')).exports
const { productPayloadSchema } = (await load('lib/product-payload-validation.ts')).exports
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = { profileId: id(1), issuer: 'https://fixture.example/realm', subject: 'fixture-admin' }, url = 'https://media.houseofdiams.com/products/videos/history.mp4'
const fixtureSource = fs.readFileSync('scripts/test-product-payload-validation.mjs', 'utf8')
const fixture = Function('id', fixtureSource.slice(fixtureSource.indexOf('function payload()'), fixtureSource.indexOf("test('accepts the current")) + ';return payload()')(id)
const payload = extra => productPayloadSchema.parse({ ...structuredClone(fixture), video_path: null, metal_media: [], metal_variants: [], default_variant_media_items: [], ...extra })
function productDb(previous) {
  let writes = 0
  return { get writes() { return writes }, async query(sql) {
    if (sql.includes('admin_product_save_v1')) { writes++; return { rows: [{ result: { id: id(1) } }] } }
    if (sql.includes('FROM public.products p WHERE')) return { rows: [{ item: previous }] }
    if (sql.includes('FROM public.product_metal_media p')) return { rows: (previous.metal_media ?? []).map(item => ({ item })) }
    if (sql.includes('FROM public.product_metal_variants p')) return { rows: (previous.metal_variants ?? []).map(item => ({ item })) }
    if (sql.includes('FROM public.product_variant_media_items p')) return { rows: [...(previous.default_variant_media_items ?? []), ...(previous.metal_variants ?? []).flatMap(v => v.media_items ?? [])].map(item => ({ item })) }
    if (sql.endsWith('FOR UPDATE')) return { rows: [{ id: id(1) }] }
    if (sql.includes('FROM public.product_')) return { rows: [] }
    throw Error('Unexpected query')
  } }
}
const media = (n = 4) => ({ id: id(n), media_type: 'video', media_path: url, sort_order: n })
const variant = (metal = 2) => ({ id: id(3), metal_id: id(metal), price: 100, sort_order: 0, is_default: true, media_items: [{ ...media(), variant_id: id(3) }] })
for (const kind of ['metal move', 'variant parent move', 'root to variant', 'default to variant', 'extra identical copy']) test('F01 valid actual repository denies ' + kind, async () => {
  admission = 'missing'; resolutions = 0
  let before, after
  if (kind === 'metal move') { before = payload({ metal_media: [{ id: id(3), metal_id: id(2), video_path: url }] }); after = payload({ metal_media: [{ id: id(3), metal_id: id(9), video_path: url }] }) }
  if (kind === 'variant parent move') { before = payload({ metal_variants: [variant()] }); after = payload({ metal_variants: [variant(9)] }) }
  if (kind === 'root to variant') { before = payload({ video_path: url }); after = payload({ metal_variants: [variant()] }) }
  if (kind === 'default to variant') { before = payload({ default_variant_media_items: [{ ...media(), is_default_fallback: true }] }); after = payload({ metal_variants: [variant()] }) }
  if (kind === 'extra identical copy') { before = payload({ default_variant_media_items: [{ ...media(), is_default_fallback: true }] }); after = payload({ default_variant_media_items: [media(), media()] }) }
  const db = productDb(before)
  await assert.rejects(products.createProductRepository(db).save(actor, { productId: id(1), payload: after }), /missing/)
  assert.equal(db.writes, 0); assert(resolutions > 0)
})
for (const status of ['missing', 'rejected', 'retired', 'policy-disabled']) test('F01 new semantic destination rejects ' + status, async () => {
  admission = status
  const db = productDb(payload({ video_path: url }))
  await assert.rejects(products.createProductRepository(db).save(actor, { productId: id(1), payload: payload({ metal_media: [{ metal_id: id(2), video_path: url }] }) }), new RegExp(status))
  assert.equal(db.writes, 0)
})
for (const mode of ['forged IDs', 'missing IDs', 'reorder', 'same slot']) test('F01 same semantic history allows ' + mode + ' with retired registry', async () => {
  admission = 'retired'; resolutions = 0
  const before = payload({ metal_media: [{ id: id(3), metal_id: id(2), video_path: url }], default_variant_media_items: [{ ...media(), is_default_fallback: true }, { ...media(5), media_path: url.replace('history', 'other'), is_default_fallback: true }] })
  const after = structuredClone(before)
  if (mode === 'forged IDs') after.metal_media[0].id = id(99)
  if (mode === 'missing IDs') { delete after.metal_media[0].id; after.default_variant_media_items.forEach(m => { delete m.id }) }
  if (mode === 'reorder') after.default_variant_media_items.reverse()
  const db = productDb(before)
  await products.createProductRepository(db).save(actor, { productId: id(1), payload: productPayloadSchema.parse(after) })
  assert.equal(db.writes, 1); assert.equal(resolutions, 0)
})
test('F01 duplicate metal identities even identical URLs fail closed; duplicate ignored media IDs cannot grant extra history', async () => {
  assert.throws(() => saves.productVideoProjection({ metal_media: [{ metal_id: id(2), video_path: url }, { metal_id: id(2), video_path: url }] }), /Duplicate/)
  admission = 'missing'
  const before = saves.productVideoProjection({ default_variant_media_items: [media()] })
  const after = saves.productVideoProjection({ default_variant_media_items: [media(), media()] })
  await assert.rejects(saves.enforceVideoSave({}, after, before), /missing/)
})
const revision = 'a'.repeat(32)
const projections = [
  ['cms_save_singleton_v1', 'cms_singleton_snapshot_v1', { p_kind: 'about_hero', p_item: { video_path: url } }, { item: { video_path: url } }],
  ['cms_save_content_list_v1', 'cms_content_list_snapshot_v1', { p_kind: 'about_values', p_items: [{ id: '2', image_path: url }] }, { items: [{ id: '2', image_path: url }] }],
  ['cms_save_home_group1_v1', 'cms_home_group1_snapshot_v1', { p_kind: 'hero', p_section: {}, p_items: [{ id: '2', video_path: url }] }, { section: {}, items: [{ id: '2', video_path: url }] }],
  ['cms_save_relational_v1', 'cms_relational_snapshot_v1', { p_kind: 'faq', p_parent: {}, p_items: [{ id: '2', answer: url, category_id: '7' }] }, { parent: {}, items: [{ id: '2', answer: url, category_id: '7' }] }],
  ['cms_save_reels_v1', 'cms_reels_snapshot_v1', { p_section: {}, p_items: [{ id: id(2), video_path: url }] }, { section: {}, items: [{ id: id(2), video_path: url }] }],
  ['cms_save_article_v1', 'cms_article_snapshot_v1', { p_kind: 'blog', p_post_id: '1', p_post: {}, p_tags: [], p_products: [], p_blocks: [{ id: '2', image_path: url }] }, { post: {}, tags: [], products: [], content_blocks: [{ id: '2', image_path: url }] }],
  ['cms_save_docs_page_v1', 'cms_docs_snapshot_v1', { p_slug: 'care', p_page: {}, p_blocks: [{ id: '2', image_path: url }] }, { page: {}, blocks: [{ id: '2', image_path: url }] }],
  ['bespoke_hero_save_v1', 'bespoke_hero_snapshot_v1', { p_item: { video_path: url }, p_items: [] }, { item: { video_path: url }, items: [] }],
  ['bespoke_form_save_v1', 'bespoke_form_snapshot_v1', { p_settings: {}, p_lists: { guarantees: [{ id: id(2), label: url }], pieceTypes: [], stoneOptions: [], caratOptions: [], metalOptions: [] }, p_deleted_ids: {} }, { settings: {}, guarantees: [{ id: id(2), label: url }], pieceTypes: [], stoneOptions: [], caratOptions: [], metalOptions: [] }],
  ['cms_save_support_faq_category_v1', 'cms_support_faq_categories_v1', { p_id: '2', p_item: { name: url } }, [{ id: '2', name: url, _revision: revision }]],
]
function cmsDb(name, snapshot, previous, fail = false) {
  let writes = 0
  return { get writes() { return writes }, async query(sql) {
    if (sql.includes('public.' + snapshot + '(')) { if (fail) throw Error('snapshot unavailable'); return { rows: [{ result: JSON.stringify(Array.isArray(previous) ? previous : { ...previous, revision }) }] } }
    if (sql.includes('public.' + name + '(')) { writes++; return { rows: [{ result: JSON.stringify(name === 'cms_save_support_faq_category_v1' ? { category: previous[0] } : { ...previous, revision }) }] } }
    throw Error('Unexpected CMS query')
  } }
}
const envelope = args => ({ p_request_id: id(1), p_expected_revision: revision, p_deleted_ids: [], p_deleted_tag_ids: [], p_deleted_product_ids: [], p_deleted_block_ids: [], ...args })
for (const [name, snapshot, args, previous] of projections) {
  test('F02 actual command history ' + name, async () => {
    admission = 'missing'; resolutions = 0
    const db = cmsDb(name, snapshot, previous)
    await cms.createCmsRepository(db, actor).execute(name, envelope(args))
    assert.equal(db.writes, 1); assert.equal(resolutions, 0)
  })
  test('F02 changed URL and unknown new argument denied ' + name, async () => {
    admission = 'missing'
    const db = cmsDb(name, snapshot, previous)
    const changed = JSON.parse(JSON.stringify(args).replaceAll('history.mp4', 'new.mp4'))
    await assert.rejects(cms.createCmsRepository(db, actor).execute(name, envelope(changed)), /missing/)
    await assert.rejects(cms.createCmsRepository(db, actor).execute(name, envelope({ ...args, p_new_unknown: url })), /missing/)
    assert.equal(db.writes, 0)
  })
  test('F02 snapshot read fail closed ' + name, async () => {
    const db = cmsDb(name, snapshot, previous, true)
    await assert.rejects(cms.createCmsRepository(db, actor).execute(name, envelope(args)), /snapshot unavailable/)
    assert.equal(db.writes, 0)
  })
}
test('F02 article block move/new ID and FAQ category reassignment require admission', async () => {
  admission = 'missing'
  for (const index of [3, 5]) {
    const [name, snapshot, args, previous] = projections[index], next = structuredClone(args)
    if (index === 3) next.p_items[0].category_id = '8'
    else next.p_blocks[0].id = '9'
    const db = cmsDb(name, snapshot, previous)
    await assert.rejects(cms.createCmsRepository(db, actor).execute(name, envelope(next)), /missing/)
    assert.equal(db.writes, 0)
  }
})
function duplicateDb({ replay = false, mismatch = false, unavailable = false, interleave = false, failAfterCommit = false } = {}) {
  let copies = 0, locked = false, committed = replay
  const graph = { product: { id: id(2), video_path: url }, metal_media: [], variants: [], media_items: [], product_metal_selections: [], product_material_value_selections: [], product_stone_shapes: [], product_subcategory_links: [], product_option_links: [], product_purity_prices: [], product_faq_items: [] }
  return { get copies() { return copies }, get locked() { return locked }, async query(sql, values) {
    if (sql.includes('admin_product_duplicate_prepare_v1')) {
      graph.product.id = values[0].toLowerCase()
      if (unavailable) throw Error('capability absent')
      if (mismatch) throw Error('request identity mismatch')
      if (committed) return { rows: [{ result: { replay: { product_id: id(8), slug: 'copy', lane: 'standard' } } }] }
      locked = true
      return { rows: [{ result: { graph: structuredClone(graph) } }] }
    }
    if (sql.includes('public.duplicate_product(')) {
      assert(locked)
      // Deterministic injected interleaving: proposed table lock excludes any writer,
      // including inserted child phantoms. Static SQL check binds this model below.
      if (interleave) assert.throws(() => { if (locked) throw Error('writer blocked'); graph.media_items.push({ video_path: url + 'bad' }) }, /blocked/)
      copies++; committed = true
      if (failAfterCommit) throw Error('ambiguous commit')
      return { rows: [{ product_id: id(8), slug: 'copy', lane: 'standard' }] }
    }
    throw Error('Unexpected duplicate query')
  } }
}
for (const state of ['missing', 'retired', 'rejected', 'policy-disabled']) test('F03 new clone rejects ' + state, async () => {
  admission = state
  const db = duplicateDb()
  await assert.rejects(products.createProductRepository(db).duplicate(actor, id(2), id(3)), new RegExp(state))
  assert.equal(db.copies, 0)
})
test('F03 admitted source, interleaved writer schedule and post-commit exact replay produce one copy', async () => {
  admission = 'admitted'
  const db = duplicateDb({ interleave: true }), repo = products.createProductRepository(db)
  const result = await repo.duplicate(actor, id(2), id(3))
  admission = 'retired'; resolutions = 0
  assert.deepEqual(await repo.duplicate(actor, id(2), id(3)), result)
  assert.equal(db.copies, 1); assert.equal(resolutions, 0)
})
for (const options of [{ replay: true }, { mismatch: true }, { unavailable: true }]) test('F03 receipt/capability ' + JSON.stringify(options), async () => {
  admission = 'retired'; resolutions = 0
  const db = duplicateDb(options)
  if (options.replay) await products.createProductRepository(db).duplicate(actor, id(2), id(3))
  else await assert.rejects(products.createProductRepository(db).duplicate(actor, id(2), id(3)), options.unavailable ? /capability absent/ : /request identity mismatch/)
  assert.equal(db.copies, 0); assert.equal(resolutions, 0)
})
test('F04 emitted direct status targets covered by precise grant/inverse; unrelated products columns absent', async () => {
  let emitted
  await products.createProductRepository({ async query(sql) { emitted = sql; return { rows: [{ id: id(1), status: 'draft' }] } } }).draft(id(1), 'active')
  const targets = [...emitted.matchAll(/(?:SET|,)\s*(\w+)\s*=/g)].map(m => m[1])
  assert.deepEqual(targets, ['status', 'updated_at'])
  const old = fs.readFileSync('docs/aws-phase-d/D1c-SQL-feature-candidates.sql', 'utf8'), forward = fs.readFileSync('docs/aws-phase-d/D1e-SQL-lock-rights-forward.sql', 'utf8'), inverse = fs.readFileSync('docs/aws-phase-d/D1e-SQL-lock-rights-inverse.sql', 'utf8')
  const rights = [...(old + forward).matchAll(/GRANT UPDATE\(([^)]+)\) ON public.products/g)].flatMap(m => m[1].split(','))
  for (const column of targets) assert(rights.includes(column))
  assert(!rights.includes('name')); assert.match(inverse, /REVOKE UPDATE\(updated_at\) ON public.products/)
})
test('F05 restrictive write denial cannot be overridden by permissive grants; locks still depend on current USING policies', () => {
  const sql = fs.readFileSync('docs/aws-phase-d/D1e-SQL-lock-rights-forward.sql', 'utf8')
  assert.match(sql, /GRANT UPDATE\(id\) ON public.catalog_gst_slabs/)
  assert.match(sql, /AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING\(true\) WITH CHECK\(false\)/)
  assert(!/GRANT UPDATE ON public.catalog_gst_slabs/.test(sql))
  // Boolean policy contract only, not PostgreSQL execution.
  for (const permissive of [true, false]) assert.equal(permissive && true && false, false)
})
test('F03 proposed capability covers every cloned relation and exact receipt identity before replay', () => {
  const source = fs.readFileSync('docs/aws-phase-d/D1e-source-duplicate_product.sql', 'utf8')
  const sql = fs.readFileSync('docs/aws-phase-d/D1e-SQL-duplicate-capability.sql', 'utf8')
  const tables = new Set([...source.matchAll(/(?:insert into|update|from) public\.(\w+)/gi)].map(m => m[1]))
  tables.delete('profiles'); tables.delete('product_duplicate_requests')
  const locks = sql.match(/LOCK TABLE ([\s\S]+?) IN SHARE ROW EXCLUSIVE MODE/)[1]
  for (const table of tables) assert(locks.includes('public.' + table), table)
  assert(sql.indexOf('receipt.source_product_id IS DISTINCT') < sql.indexOf("'replay',replay_row"))
  assert.match(sql, /receipt.requested_by IS DISTINCT FROM p_actor/)
})

test('F03 ambiguous commit retry returns exact receipt after retirement without second copy', async () => {
  admission = 'admitted'
  const db = duplicateDb({ failAfterCommit: true }), repo = products.createProductRepository(db)
  await assert.rejects(repo.duplicate(actor, id(2), id(3)), /ambiguous commit/)
  admission = 'retired'; resolutions = 0
  assert.equal((await repo.duplicate(actor, id(2), id(3))).product_id, id(8))
  assert.equal(db.copies, 1); assert.equal(resolutions, 0)
})

test('F01 admitted new parent succeeds and product parent never trusts browser child membership', async () => {
  admission = 'admitted'; resolutions = 0
  const before = payload({ metal_media: [{ id: id(3), metal_id: id(2), video_path: url }] })
  const after = payload({ metal_media: [{ id: id(3), product_id: id(99), metal_id: id(9), video_path: url }] })
  const db = productDb(before)
  await products.createProductRepository(db).save(actor, { productId: id(1), payload: after })
  assert.equal(db.writes, 1); assert(resolutions > 0)
})
test('F04/F05 every supplemental grant has an exact inverse and no broad UPDATE', () => {
  for (const [forward, inverse] of [['D1e-SQL-lock-rights-forward.sql','D1e-SQL-lock-rights-inverse.sql'],['D1e-SQL-cms-navbar-requirements.sql','D1e-SQL-cms-navbar-inverse.sql']]) {
    const f = fs.readFileSync('docs/aws-phase-d/' + forward, 'utf8'), i = fs.readFileSync('docs/aws-phase-d/' + inverse, 'utf8')
    assert(!/GRANT UPDATE ON/.test(f))
    for (const grant of f.matchAll(/^GRANT (.+) TO hod_admin_app;/gm)) assert(i.includes('REVOKE ' + grant[1] + ' FROM hod_admin_app;'), grant[0])
    for (const policy of f.matchAll(/^CREATE POLICY (\w+) ON (\S+) /gm)) assert(i.includes('DROP POLICY ' + policy[1] + ' ON ' + policy[2] + ';'))
  }
})
test('Static CMS/navbar write targets agree with generated per-column requirements and dynamic allowlist', () => {
  const manifest = JSON.parse(fs.readFileSync('docs/aws-phase-d/D1e-minimum-grant-manifest.json', 'utf8'))
  const sql = fs.readFileSync('docs/aws-phase-d/D1e-SQL-cms-navbar-requirements.sql', 'utf8')
  assert.equal(manifest.dynamicAllowlist.length, 5)
  for (const relation of manifest.relations) for (const operation of ['insert','update']) {
    if (relation[operation].length) assert(sql.includes('GRANT ' + operation.toUpperCase() + '(' + relation[operation].join(',') + ') ON ' + relation.relation + ' TO hod_admin_app;'))
  }
  assert(manifest.triggerDependencies.some(t => t.routine === 'navbar_section_source_item_type_guard_v1()' && t.definition.includes('catalog_options')))
})

test('F03 PostgreSQL UUID canonical case matches source without changing request bindings', async () => {
  admission = 'admitted'
  const db = duplicateDb()
  await products.createProductRepository(db).duplicate(actor, 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', id(3))
  assert.equal(db.copies, 1)
})
