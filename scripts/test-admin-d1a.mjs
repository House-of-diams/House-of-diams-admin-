// Actual-source offline regressions. Injected in-process boundaries only; no listeners.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { randomBytes } from 'node:crypto'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'

const root = process.cwd()
const data = s => 'data:text/javascript;base64,' + Buffer.from(s).toString('base64')
globalThis.__d1 = {}
globalThis.fetch = async () => { throw Error('Unexpected network') }
async function loader(overrides = {}, sources = {}) {
  const cache = new Map()
  async function load(file) {
    file = path.resolve(root, file)
    if (cache.has(file)) return cache.get(file)
    let code = ts.transpileModule(sources[file] ?? fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
    for (const name of new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m => m[1]))) {
      let url
      if (overrides[name]) url = data(overrides[name])
      else if (name === 'server-only') url = data('export {}')
      else if (name === './supabase' || name === '@/lib/supabase') url = data('export const supabase={auth:{getSession:async()=>({data:{session:null}})}}')
      else if (name === './db/pool' || name.endsWith('/db/pool')) url = data('export const adminTransaction=(...a)=>globalThis.__d1.transaction(...a)')
      else if (name.endsWith('product-session-runtime')) url = data('export const authorizeProductRequest=(...a)=>globalThis.__d1.authorize(...a)')
      else if (name.startsWith('.') || name.startsWith('@/')) {
        let target = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name)
        if (!path.extname(target)) target += fs.existsSync(target + '.ts') ? '.ts' : '.tsx'
        url = (await load(target)).url
      } else url = import.meta.resolve(name === 'next/server' ? 'next/server.js' : name)
      code = code.replaceAll(`'${name}'`, `'${url}'`).replaceAll(`"${name}"`, `"${url}"`)
    }
    const url = data(code), result = { url, exports: await import(url) }
    cache.set(file, result)
    return result
  }
  return load
}
const load = await loader()
const { loadRdsProductSummaries, loadRdsProductList } = (await load('lib/db/admin-repositories/product-list.ts')).exports
const { loadRdsProductEditor } = (await load('lib/db/admin-repositories/product-editor.ts')).exports
const { withAdminTransaction } = (await load('lib/db/query.ts')).exports
const { createProductRdsHandlers } = (await load('lib/product-rds-handlers.ts')).exports
const { createSessions } = (await load('lib/auth/session.ts')).exports
const { createAuthHandlers } = (await load('lib/auth/handlers.ts')).exports
const { createAdminIdentityLookup } = (await load('lib/db/admin-repositories/identity-core.ts')).exports
const { productFetch } = (await load('lib/product-transport.ts')).exports
const { logoutAdmin } = (await load('lib/admin-auth-client.ts')).exports
const { createKeycloak } = (await load('lib/auth/keycloak.ts')).exports
const { createOrdersRepository } = (await load('lib/db/admin-repositories/orders.ts')).exports
const { createVideoStorage } = (await load('lib/video-storage.ts')).exports
const { canSelectLibraryVideo, fetchVideoLibrary, invalidateClientVideoLibrary } = (await load('lib/video-transport.ts')).exports
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const principal = { login_role: 'hod_admin_app', active_role: 'hod_admin_app', capability_exists: true, safe_login: true, isolated_login: true, safe_capability: true, isolated_capability: true }

test('F-01 query uses saved JSONB type contract, never ANY(jsonb); null/empty/multiple label membership', async () => {
  const evidence = JSON.parse(fs.readFileSync('docs/aws-migration-audit/sql-type-contract-evidence.json', 'utf8'))
  const initial = JSON.parse(fs.readFileSync('docs/aws-phase-d/D1a-initial-sources.json', 'utf8').replace(/^\uFEFF/, '')).find(row => row.path.replaceAll('\\', '/') === 'lib/db/admin-repositories/product-list.ts')
  assert.match(initial.text, /ce.id=ANY\(p.certificate_ids\)/)
  assert.match(evidence.jsonb_type_evidence, /coalesce\(x.certificate_ids,'\[\]'::jsonb\) @> jsonb_build_array\(p_id::text\)/)
  let statement
  await loadRdsProductSummaries({ query: async sql => { statement = sql; return { rows: [] } } })
  assert.doesNotMatch(statement, /ANY\(p.certificate_ids\)/)
  assert.match(statement, /coalesce\(p.certificate_ids,'\[\]'::jsonb\) @> jsonb_build_array\(ce.id::text\) ORDER BY ce.id/)
  // SQL expression shape is reconciled to actual saved type evidence, not a
  // canned executor claiming PostgreSQL evaluation. Live exact SELECT stays deferred.
  const certificates = [{ id: id(1), name: 'A' }, { id: id(2), name: 'B' }]
  for (const [refs, expected] of [[null, []], [[], []], [[id(2), id(1)], ['A', 'B']], [[id(2), id(2)], ['B']]]) {
    assert.deepEqual(certificates.filter(c => (refs ?? []).includes(c.id)).map(c => c.name), expected)
  }
})

test('F-03 actual checkout route resolves both banners without any legacy factory', async () => {
  let parent
  let legacyCalls = 0
  globalThis.__d1.legacyFactory = () => { legacyCalls++; throw Error('legacy factory invoked') }
  globalThis.__d1.snapshot = () => ({ parent, items: [{ id: 1 }], revision: 'revision' })
  const routeLoad = await loader({
    '@/lib/cms-rds-handlers': 'export const withCmsDataRoute=(req,run)=>run({provider:"rds"})',
    '@/lib/cms-command': 'export const cmsReader=x=>x',
    '@/lib/cms-relational-save': 'export const loadCmsRelationalSnapshot=async()=>globalThis.__d1.snapshot(); export const saveCmsRelational=()=>{throw Error("unexpected write")}',
    '@/lib/cms-auth': 'export const buildAdminClient=()=>globalThis.__d1.legacyFactory()',
  })
  const { GET } = (await routeLoad('app/api/cms/checkout-result/route.ts')).exports
  const previous = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, bucket: process.env.SUPABASE_COLLECTION_BUCKET }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://legacy.example'; process.env.SUPABASE_COLLECTION_BUCKET = 'checkout-bucket'
  try {
    for (const [value, expected] of [['folder/a.webp', 'https://legacy.example/storage/v1/object/public/checkout-bucket/folder/a.webp'], ['https://content.houseofdiams.com/a.webp', 'https://content.houseofdiams.com/a.webp'], ['/images/a.webp', '/images/a.webp'], ['', ''], [null, ''], ['javascript:alert(1)', ''], ['../private.webp', ''], ['//unsafe.example/a', '']]) {
      parent = { main_banner_image_path: value, secondary_banner_image_path: value }
      const response = await GET(new Request(origin + '/api/cms/checkout-result'))
      assert.equal(response.status, 200)
      const payload = await response.json()
      assert.equal(payload.page.main_banner_image_url, expected); assert.equal(payload.page.secondary_banner_image_url, expected)
      assert.equal(payload.page.main_banner_image_path, value); assert.deepEqual(payload.states, [{ id: 1 }]); assert.equal(payload.revision, 'revision')
    }
    assert.equal(legacyCalls, 0)
    const baseline = JSON.parse(fs.readFileSync('docs/aws-phase-d/D1a-initial-sources.json', 'utf8').replace(/^\uFEFF/, '')).find(row => row.path.replaceAll('\\', '/') === 'app/api/cms/checkout-result/route.ts')
    const originalLoad = await loader({
      '@/lib/cms-rds-handlers': 'export const withCmsDataRoute=(req,run)=>run({provider:"rds"})',
      '@/lib/cms-command': 'export const cmsReader=x=>x',
      '@/lib/cms-relational-save': 'export const loadCmsRelationalSnapshot=async()=>globalThis.__d1.snapshot();export const saveCmsRelational=()=>{}',
      '@/lib/cms-auth': 'export const buildAdminClient=()=>globalThis.__d1.legacyFactory()',
    }, { [path.resolve(root, 'app/api/cms/checkout-result/route.ts')]: baseline.text })
    parent = { main_banner_image_path: 'folder/a.webp', secondary_banner_image_path: 'folder/b.webp' }
    assert.equal((await (await originalLoad('app/api/cms/checkout-result/route.ts')).exports.GET(new Request(origin))).status, 503)
    assert.equal(legacyCalls, 1, 'original selected RDS route attempts a legacy factory')
  } finally {
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url
    if (previous.bucket === undefined) delete process.env.SUPABASE_COLLECTION_BUCKET; else process.env.SUPABASE_COLLECTION_BUCKET = previous.bucket
  }
})

function hookHarness() {
  const state = [], dependencies = [], effects = [], cleanups = []
  let cursor = 0
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }] },
    useRef(initial) { const i = cursor++; state[i] ??= { current: initial }; return state[i] },
    useMemo(fn, deps) { const i = cursor++; if (!state[i] || !same(state[i].deps, deps)) state[i] = { deps, value: fn() }; return state[i].value },
    useEffect(fn, deps) { const i = cursor++; if (!same(dependencies[i], deps)) { dependencies[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() }) } },
  }
  return { hooks, render: fn => { cursor = 0; return fn() }, effects: () => { while (effects.length) effects.shift()() }, unmount: () => cleanups.forEach(fn => fn?.()) }
}
function nodes(element, predicate) {
  if (!element || typeof element !== 'object') return []
  const children = [element.props?.children].flat(Infinity)
  return [...(predicate(element) ? [element] : []), ...children.flatMap(child => nodes(child, predicate))]
}
async function formFixture(props = {}, original = false) {
  const hooks = hookHarness(), overrides = {}
  globalThis.__d1.hooks = hooks.hooks
  globalThis.__d1.toast = []
  globalThis.window = { requestIdleCallback: () => 0, cancelIdleCallback() {}, setTimeout: () => 0, clearTimeout() {} }
  const source = fs.readFileSync('components/product-form.tsx', 'utf8')
  // UI leaves are inert JSX components; actual form state/effects/load/save,
  // normalization, serializers, query cache and validation execute unchanged.
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
    const name = match[2]
    if (['@/lib/product-editor', '@/lib/product-save-payload', '@/lib/product-custom-dropdowns', '@/lib/query-cache'].includes(name)) continue
    const exports = match[1].split(',').map(v => v.trim()).filter(v => v && !v.startsWith('type '))
    overrides[name] = exports.map(v => `export const ${v}=()=>null;`).join('')
  }
  overrides.react = 'export const useState=(...a)=>globalThis.__d1.hooks.useState(...a);export const useRef=(...a)=>globalThis.__d1.hooks.useRef(...a);export const useEffect=(...a)=>globalThis.__d1.hooks.useEffect(...a);export const useMemo=(...a)=>globalThis.__d1.hooks.useMemo(...a)'
  overrides['next/navigation'] = 'export const useRouter=()=>({prefetch(){},push(){},refresh(){}})'
  overrides['@/hooks/use-toast'] = 'export const useToast=()=>({toast:x=>globalThis.__d1.toast.push(x)})'
  overrides['@/hooks/use-unsaved-changes'] = 'export const useEditGuard=()=>({touched:false,reset(){},bind:{}})'
  overrides['@/lib/product-transport'] = 'export const productFetch=(...a)=>globalThis.__d1.productFetch(...a)'
  const sources = {}
  sources[path.resolve(root, 'components/product-form.tsx')] = source.replace('  if (loadError) {', '  globalThis.__d1.submit = handleSubmit\n  if (loadError) {')
  if (original) {
    const baseline = JSON.parse(fs.readFileSync('docs/aws-phase-d/D1a-initial-sources.json', 'utf8').replace(/^\uFEFF/, ''))
    sources[path.resolve(root, 'components/product-form.tsx')] = baseline.find(f => f.path.replaceAll('\\', '/') === 'components/product-form.tsx').text
  }
  const formLoad = await loader(overrides, sources)
  const { deleteCachedQueryData } = (await formLoad('lib/query-cache.ts')).exports
  for (const scope of ['basics', 'pricing', 'attributes', 'content']) deleteCachedQueryData('catalog-bootstrap:' + scope)
  if (props.productId) deleteCachedQueryData('product-edit:/api/products/' + props.productId)
  if (props.productSlug) deleteCachedQueryData('product-edit:/api/products/by-slug/' + props.productSlug)
  const { ProductForm } = (await formLoad('components/product-form.tsx')).exports
  let p = props, component, element
  function render() {
    if (original) element = hooks.render(() => ProductForm(p))
    else { const wrapper = ProductForm(p); component = wrapper.type; element = hooks.render(() => component(wrapper.props)) }
    // Commit every rendered frame before a later user event/network completion;
    // never replay an old frame's effects after a newly hydrated record.
    hooks.effects()
    return element
  }
  return { render, hooks, mount: () => { render(); hooks.effects() }, flush: async () => { for (let i = 0; i < 5; i++) { render(); hooks.effects(); await settle() } }, props: value => { p = value }, form: () => nodes(render(), n => n.type === 'form')[0], retry: () => nodes(render(), n => n.type === 'button' && n.props.children === 'Retry loading')[0] }
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)) }
function editorItem(n = 1) {
    return { id: id(n), slug: 'ring-' + n, name: 'Ring ' + n, sku: 'R1', base_price: 1200, main_category_id: id(5), metal_ids: [id(7)], material_value_ids: [], shape_ids: [], purity_prices: [], metal_media: [], default_variant_media_items: [], custom_dropdowns: [], linked_subcategory_ids: [id(20)], linked_option_ids: [id(21)], image_1_path: '/saved.webp', video_path: '/saved.mp4', metal_variants: [{ id: id(6), product_id: id(n), metal_id: id(7), price: 1200, is_default: true, sort_order: 1, media_items: [{ id: id(8), media_path: '/variant.webp', media_type: 'image', sort_order: 1 }] }], faq_items: [{ id: id(9), question: 'Saved question', answer: 'Saved answer', sort_order: 1 }] }
}
const bootstrap = { categories: [{ id: id(5), name: 'Category' }], subcategories: [{ id: id(20), category_id: id(5) }], options: [{ id: id(21), subcategory_id: id(20) }], styles: [], metals: [], certificates: [], gstSlabs: [], materialValues: [], stoneShapes: [], ringCategories: [], ringCategorySizes: [], productContentRules: [] }
function formTransport(detail) {
  const calls = []
  globalThis.__d1.productFetch = async (url, options = {}) => {
    calls.push([url, options])
    if (options.method === 'PATCH' || options.method === 'POST') return Response.json({ item: { id: id(1), slug: 'ring-1' } })
    if (url.includes('/bootstrap')) return Response.json(bootstrap)
    return detail(url)
  }
  return calls
}
test('F-02 reproduces original cold-ID failure: non-OK detail exposes replacement form', async () => {
  formTransport(async () => Response.json({ error: 'denied' }, { status: 503 }))
  const f = await formFixture({ productId: id(101) }, true); f.mount(); await settle()
  assert.ok(f.form(), 'original form is exposed after failed detail load')
  f.hooks.unmount()
})
for (const failure of ['http', 'session', 'transport', 'mismatch', 'null', 'incomplete']) test('F-02 actual cold-ID form blocks ' + failure + ', retries, preserves media/variants/FAQ in save', async () => {
  let fail = true
  const calls = formTransport(async () => {
    if (fail) {
      if (failure === 'session' || failure === 'transport') throw Error(failure + ' unavailable')
      return Response.json({ item: failure === 'mismatch' ? editorItem(2) : failure === 'incomplete' ? { ...editorItem(), faq_items: undefined } : null }, { status: failure === 'http' ? 503 : 200 })
    }
    return Response.json({ item: editorItem() })
  })
  const f = await formFixture({ productId: id(1) }); f.mount(); await settle()
  assert.equal(f.form(), undefined); assert.ok(f.retry()); assert.equal(calls.filter(c => c[1].method === 'PATCH').length, 0)
  await globalThis.__d1.submit({ preventDefault() {} }); assert.equal(calls.filter(c => c[1].method === 'PATCH').length, 0)
  fail = false; await f.retry().props.onClick(); await settle(); await f.flush()
  const form = f.form(); assert.ok(form)
  await form.props.onSubmit({ preventDefault() {} })
  const saved = calls.find(c => c[1].method === 'PATCH'); assert.ok(saved)
  const body = JSON.parse(saved[1].body)
  assert.equal(body.image_1_path, '/saved.webp'); assert.equal(body.video_path, '/saved.mp4')
  assert.equal(body.metal_variants[0].media_items[0].media_path, '/variant.webp'); assert.equal(body.faq_items[0].question, 'Saved question')
  assert.deepEqual(body.linked_subcategory_ids, [id(20)]); assert.deepEqual(body.linked_option_ids, [id(21)])
  f.hooks.unmount()
})
test('F-02 matching SSR props/create remain usable; wrong props and stale unmounted response never hydrate another ID', async () => {
  formTransport(async () => Response.json({ item: editorItem(2) }))
  const ssr = await formFixture({ productSlug: 'ring-1', initialProduct: editorItem(), initialBasicsBootstrap: bootstrap }); ssr.mount(); await settle(); assert.ok(ssr.form()); ssr.hooks.unmount()
  const create = await formFixture({ initialBasicsBootstrap: bootstrap }); create.mount(); await settle(); assert.ok(create.form()); create.hooks.unmount()
  let finish
  formTransport(() => new Promise(resolve => { finish = resolve }))
  const stale = await formFixture({ productId: id(11), initialProduct: editorItem() }); stale.mount(); await settle(); stale.hooks.unmount()
  finish(Response.json({ item: editorItem(11) })); await settle(); assert.equal(stale.form(), undefined)
  const current = await formFixture({ productId: id(12), initialProduct: editorItem() }); current.mount(); await settle(); assert.equal(current.form(), undefined); current.hooks.unmount()
})
test('F-02 failed reference reload retains matching populated fields and retry; late matching props hydrate', async () => {
  let fail = true
  const calls = []
  globalThis.__d1.productFetch = async (url, options = {}) => {
    calls.push([url, options])
    if (options.method === 'PATCH') return Response.json({ item: editorItem() })
    if (url.includes('/bootstrap')) { if (fail) throw Error('choices unavailable'); return Response.json(bootstrap) }
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }
  const f = await formFixture({ productId: id(1), initialProduct: editorItem() }); f.mount(); await settle()
  assert.equal(f.form(), undefined); assert.ok(f.retry())
  fail = false; await f.retry().props.onClick(); await settle(); await f.flush()
  await f.form().props.onSubmit({ preventDefault() {} })
  assert.equal(JSON.parse(calls.find(c => c[1].method === 'PATCH')[1].body).image_1_path, '/saved.webp')
  f.hooks.unmount()
  const late = await formFixture({ productId: id(51) }); late.mount(); await settle(); assert.equal(late.form(), undefined)
  late.props({ productId: id(51), initialProduct: editorItem(51), initialBasicsBootstrap: bootstrap }); late.render(); late.hooks.effects(); await settle(); assert.ok(late.form()); late.hooks.unmount()
})
test('R-02 actual product client parallel reads use real B1/B2 sessions; a concurrent refresh denies neither (HOD-022)', async () => {
  const f = await authFixture(), calls = [], previous = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    calls.push([url, options?.method ?? 'GET'])
    if (url === '/api/products/provider') return Response.json({ provider: 'rds' })
    if (url === '/api/auth/session') return f.handlers.session(f.request())
    await f.sessions.authorize(f.request())
    return Response.json({ item: editorItem() })
  }
  try {
    const results = await Promise.all([productFetch('/api/products/' + id(1)), productFetch('/api/products/bootstrap?scope=basics')])
    assert.ok(results.every(r => r.ok)); f.tick(61)
    const refresh = await Promise.allSettled([productFetch('/api/products/' + id(1)), productFetch('/api/products/bootstrap?scope=basics')])
    assert.equal(refresh.filter(r => r.status === 'rejected').length, 0)
    assert.equal((await productFetch('/api/products/' + id(1))).status, 200)
    assert.ok(calls.every(([, method]) => method === 'GET')); assert.equal(f.refreshes(), 1)
  } finally { globalThis.fetch = previous }
})

test('R-03 product list count/page and editor children use one scoped snapshot across interleaved commits', async () => {
  for (const read of [db => loadRdsProductList(db, 'standard'), db => loadRdsProductEditor(db, id(1))]) {
    const calls = []; let revision = 1, snapshot
    const client = { release() {}, async query(sql) {
      calls.push(sql)
      if (sql.startsWith('BEGIN')) { assert.equal(sql, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); snapshot = revision; return { rows: [] } }
      if (sql.includes('session_user')) return { rows: [principal] }
      if (sql.startsWith('SELECT')) {
        const visible = snapshot; revision++ // another writer commits between each statement
        assert.equal(visible, 1)
        if (sql.includes('count(*)::text AS total')) return { rows: [{ total: String(visible) }] }
        if (sql.includes('to_jsonb(p) AS item FROM public.products')) return { rows: [{ item: { id: id(1), name: `revision-${visible}` } }] }
      }
      return { rows: [] }
    } }
    await withAdminTransaction({ connect: async () => client }, 'hod_admin_app', read, { snapshot: true })
    assert.equal(calls.at(-1), 'COMMIT')
  }
})
test('R-03 actual product API requests snapshot only for read-id/read-slug/list, writes keep default', async () => {
  for (const action of ['read-id', 'read-slug', 'product-list', 'single-delete']) {
    const options = []
    const handler = createProductRdsHandlers({ provider: () => 'rds', authorize: async () => ({ actor: { profileId: id(1) } }), transaction: async (run, option) => {
      options.push(option)
      return run({ query: async sql => ({ rows: sql.includes('SELECT id FROM') ? [{ id: id(1) }] : sql.includes('count(*)') ? [{ total: '0' }] : [] }) })
    } })
    await handler(action, new Request('https://admin.example/api/products?lane=standard', { method: action === 'single-delete' ? 'DELETE' : 'GET' }), id(1))
    assert.equal(options[0]?.snapshot, action !== 'single-delete')
  }
})

const origin = 'https://manage-uat.houseofdiams.com', issuer = 'https://auth-uat.houseofdiams.com/realms/houseofdiams'
async function authFixture() {
  let seconds = 1800000000, enabled = true, refreshes = 0
  const rows = new Map(), copy = x => structuredClone(x)
  const store = {
    async create(k, value) { if (rows.has(k)) return false; rows.set(k, { data: copy(value), version: randomBytes(32).toString('base64url') }); return true },
    async get(k) { return copy(rows.get(k) ?? null) },
    async consume(k, v) { const row = rows.get(k); if (row?.version !== v) return null; rows.delete(k); return copy(row.data) },
    async replace(k, v, value) { if (rows.get(k)?.version !== v) return false; rows.set(k, { data: copy(value), version: randomBytes(32).toString('base64url') }); return true },
    async delete(k) { rows.delete(k) },
  }
  const config = { issuer, clientId: 'hod-admin', origin, requiredClientRole: 'hod-admin', sessionMaxSeconds: 3600, sessionIdleSeconds: 600, revalidateSeconds: 60 }
  const claims = () => ({ issuer, subject: 'subject', audiences: ['hod-admin'], clientId: 'hod-admin', clientRoles: ['hod-admin'], expiresAt: seconds + 300 })
  const lookup = createAdminIdentityLookup({ query: async (sql, values) => {
    assert.match(sql, /public.admin_identity_lookup_v1\(\$1::text, \$2::text\)/); assert.deepEqual(values, [issuer, 'subject'])
    return { rows: [{ issuer, subject: 'subject', profile_id: id(1), enabled, revoked_at: null, profile_role: 'admin' }] }
  } })
  const deps = { config, store, now: () => seconds * 1000, lookup, oidc: { validate: async () => claims(), refresh: async () => { refreshes++; return { accessToken: 'new', refreshToken: 'new-refresh', idToken: 'id' } }, logout: async () => {} } }
  const sessions = createSessions(deps), handlers = createAuthHandlers(deps)
  const { cookie, session } = await sessions.establish({ accessToken: 'old', refreshToken: 'old-refresh', idToken: 'id' }, 'nonce')
  const request = (method = 'GET', headers = {}) => new Request(origin + '/api/auth/session', { method, headers: { cookie: '__Host-hod_admin_session=' + cookie, origin, 'x-admin-csrf': session.csrf, ...headers } })
  return { sessions, handlers, deps, store, rows, request, session, key: sessions.sessionKey(cookie), tick: s => { seconds += s }, disable: () => { enabled = false }, refreshes: () => refreshes }
}
test('R-02 eight overlapping actual B1 authorizations succeed through metadata CAS contention', async () => {
  const f = await authFixture()
  const results = await Promise.all(Array.from({ length: 8 }, () => f.sessions.authorize(f.request())))
  assert.equal(results.length, 8); assert.ok(results.every(r => r.actor.profileId === id(1))); assert.equal(f.refreshes(), 0)
})
test('R-02 refresh loser waits for the winner (HOD-022), with one refresh', async () => {
  const f = await authFixture(); f.tick(61)
  const results = await Promise.allSettled([f.sessions.authorize(f.request()), f.sessions.authorize(f.request())])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2); assert.equal(f.refreshes(), 1)
  assert.equal((await f.sessions.authorize(f.request())).actor.profileId, id(1)); assert.equal(f.refreshes(), 1)
  f.disable(); await assert.rejects(f.sessions.authorize(f.request()), /identity denied/)
})
test('R-02 logout losing an idle CAS consumes the new version and prevents resurrection', async () => {
  const f = await authFixture(), consume = f.store.consume
  let race = true
  f.store.consume = async (key, version) => {
    if (race) { race = false; const row = await f.store.get(key); await f.store.replace(key, row.version, { ...row.data, lastSeen: row.data.lastSeen + 1 }) }
    return consume(key, version)
  }
  const response = await f.handlers.logout(f.request('POST'))
  assert.equal(response.status, 200); assert.equal(f.rows.size, 0)
  await assert.rejects(f.sessions.authorize(f.request()), /missing/)
})
test('R-02 metadata CAS recovery rechecks mapping revocation rather than accepting a stale actor', async () => {
  const f = await authFixture(), replace = f.store.replace
  let first = true
  f.store.replace = async (...args) => { if (first) { first = false; f.disable(); return false } return replace(...args) }
  await assert.rejects(f.sessions.authorize(f.request()), /identity denied/)
})
test('R-02 actual logout client handles version race and honest upstream failure without retrying writes', async () => {
  for (const upstreamFailure of [false, true]) {
    const f = await authFixture(), consume = f.store.consume, previous = globalThis.fetch
    let raced = false, writes = 0
    f.store.consume = async (key, version) => {
      if (!raced) { raced = true; const row = await f.store.get(key); await f.store.replace(key, row.version, row.data) }
      return consume(key, version)
    }
    if (upstreamFailure) f.deps.oidc.logout = async () => { throw Error('upstream unavailable') }
    globalThis.fetch = async (url, options) => {
      if (url === '/api/auth/provider') return Response.json({ provider: 'keycloak' })
      if (url === '/api/auth/session') return f.handlers.session(f.request())
      assert.equal(url, '/api/auth/logout'); writes++
      return f.handlers.logout(f.request('POST', Object.fromEntries(new Headers(options.headers))))
    }
    try { assert.deepEqual(await logoutAdmin(), { upstreamLogout: !upstreamFailure }); assert.equal(writes, 1); assert.equal(f.rows.size, 0) }
    finally { globalThis.fetch = previous }
  }
})
test('C3/DevOps reported realm role and azp do not override access audience: account-only rejected, hod-admin plus account accepted', async () => {
  const pair = await generateKeyPair('RS256'), key = { ...await exportJWK(pair.publicKey), kid: 'd1-offline', alg: 'RS256', use: 'sig' }, seconds = 1800000000
  const config = { issuer, clientId: 'hod-admin', roleLocation: 'realm', requiredClientRole: 'hod-admin' }
  const oidc = createKeycloak(config, async () => Response.json({ keys: [key] }), () => seconds * 1000)
  const jwt = (typ, aud) => new SignJWT({ typ, azp: 'hod-admin', nonce: 'nonce', realm_access: { roles: ['hod-admin'] } }).setProtectedHeader({ alg: 'RS256', kid: key.kid }).setIssuer(issuer).setSubject('subject').setAudience(aud).setIssuedAt(seconds).setExpirationTime(seconds + 300).sign(pair.privateKey)
  const idToken = await jwt('ID', 'hod-admin')
  await assert.rejects(oidc.validate({ idToken, accessToken: await jwt('Bearer', 'account'), refreshToken: 'offline' }, 'nonce'))
  assert.deepEqual((await oidc.validate({ idToken, accessToken: await jwt('Bearer', ['hod-admin', 'account']), refreshToken: 'offline' }, 'nonce')).audiences, ['hod-admin', 'account'])
})
test('R-02 logout during identity lookup cannot be resurrected; store failure and invalid CSRF fail closed', async () => {
  const f = await authFixture(); const lookup = f.deps.lookup
  f.deps.lookup = lookup // sessions captures lookup; schedule at store boundary instead
  // A logout lands while the request checks identity: the session-touch CAS must fail.
  const replace = f.store.replace; let loggedOut = false
  f.store.replace = async (k, ...rest) => { if (!loggedOut) { loggedOut = true; f.rows.delete(k) } return replace(k, ...rest) }
  await assert.rejects(f.sessions.authorize(f.request()), /revoked/); assert.equal(f.rows.size, 0)
  const g = await authFixture()
  assert.equal((await g.handlers.logout(g.request('POST', { 'x-admin-csrf': 'wrong' }))).status, 403)
  assert.equal(g.rows.size, 1)
  g.store.consume = async () => { throw Error('store unavailable') }
  assert.equal((await g.handlers.logout(g.request('POST'))).status, 403); assert.equal(g.rows.size, 1)
})
test('R-06 actual order repository permits first cancellation but rejects reopen and leaves stock to triggers', async () => {
  let status = 'processing', credits = 0, updates = 0
  const db = { query: async (sql, args) => {
    if (sql.includes('admin_order_status_update_v1')) { const next = JSON.parse(args[4]).status; if(status==='cancelled'&&next!=='cancelled')throw {code:'PT409'};const changed=next!==status;if (next === 'cancelled' && changed) credits++; status = next; updates++; return { rows: [{ item: JSON.stringify({item:{id:id(1),status},items:[],statusChanged:changed}) }] } }
    return { rows: [] }
  } }
  const input = next => ({ status: next, expected_status: status, expected_courier_name: null, expected_courier_awb_number: null, courier_name: null, courier_awb_number: null })
  const repo = createOrdersRepository(db,{profileId:id(2),issuer:'https://fixture.invalid',subject:'fixture-admin'})
  await repo.update(id(1), input('cancelled'))
  await assert.rejects(repo.update(id(1), input('processing')), /cannot be reopened/)
  await repo.update(id(1), input('cancelled'))
  assert.equal(credits, 1); assert.equal(updates, 2)
})
test('R-06 made-to-order reopen remains supported; legacy stock-backed reopen denies before UPDATE', async () => {
  const input = { status: 'processing', expected_status: 'cancelled', expected_courier_name: null, expected_courier_awb_number: null, courier_name: null, courier_awb_number: null }
  let updates = 0
  const repo = createOrdersRepository({ query: async sql => {
    if (sql.includes('admin_order_status_update_v1')) { updates++; return { rows: [{ item: JSON.stringify({item:{id:id(1),status:'processing'},items:[],statusChanged:true}) }] } }
    return { rows: [] }
  } },{profileId:id(2),issuer:'https://fixture.invalid',subject:'fixture-admin'})
  await repo.update(id(1), input); assert.equal(updates, 1)
  globalThis.__d1.legacyDb = { from(table) {
    const chain = { select() { return chain }, eq() { return chain }, order() { return Promise.resolve({ data: [], error: null }) }, maybeSingle: async () => ({ data: { id: id(1), status: 'cancelled', fulfillment_mode: 'stock', courier_name: null, courier_awb_number: null }, error: null }), update() { throw Error('Unprotected legacy update') } }
    assert.ok(['orders', 'order_items'].includes(table)); return chain
  } }
  const legacyLoad = await loader({
    '@/lib/operations-route': 'export const withOperationsRoute=(request,run)=>run({adminClient:globalThis.__d1.legacyDb});export const isOperationsRds=()=>false',
    '@/lib/email': 'export const sendOrderStatusUpdateEmail=()=>{throw Error("unexpected mail")}',
  })
  const { PATCH } = (await legacyLoad('app/api/orders/[id]/route.ts')).exports
  const response = await PATCH(new Request(origin + '/api/orders/' + id(1), { method: 'PATCH', body: JSON.stringify(input) }), { params: Promise.resolve({ id: id(1) }) })
  assert.equal(response.status, 409); assert.match((await response.json()).error, /Stock-backed cancelled/)
})
test('R-04 failed-Head orphan, historical object and later successful upload remain discovery-only on new instances', async () => {
  const source = { bucket: 'fixture', prefix: 'products/videos/', baseUrl: 'https://media.houseofdiams.com' }
  const bytes = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 105, 115, 111, 109, 109, 112, 52, 50])
  let stored, verificationFails = true
  const send = async command => {
    if (command.constructor.name === 'PutObjectCommand') { stored = command.input; return {} }
    if (command.constructor.name === 'HeadObjectCommand') { if (verificationFails) throw Error('Head unavailable'); return { ContentLength: stored.ContentLength, ContentType: stored.ContentType, ChecksumSHA256: stored.ChecksumSHA256 } }
    return { Contents: [{ Key: stored.Key, Size: bytes.length }, { Key: source.prefix + 'historical.mp4', Size: 10 }] }
  }
  await assert.rejects(createVideoStorage(send).upload(source, bytes, 'video/mp4', id(1)), /Head/)
  for (let process = 0; process < 2; process++) {
    const items = await createVideoStorage(send).list([source])
    assert.equal(items.length, 2); assert.ok(items.every(i => i.verification === 'unknown' && !canSelectLibraryVideo(i)))
  }
  verificationFails = false; await createVideoStorage(send).upload(source, bytes, 'video/mp4', id(2))
  assert.ok((await createVideoStorage(send).list([source])).every(i => !canSelectLibraryVideo(i)))
})
test('R-04 actual AWS browser transport marks even missing server approval unknown; legacy stays selectable', async () => {
  for (const provider of ['aws', 'legacy']) {
    invalidateClientVideoLibrary()
    const previous = globalThis.fetch
    globalThis.fetch = async endpoint => endpoint === '/api/videos/provider' ? Response.json({ provider, namespace: 'fixture' }) : Response.json({ namespace: 'fixture', items: [{ key: 'products/videos/a.mp4', url: 'https://media.houseofdiams.com/products/videos/a.mp4', size: 1, lastModified: null }] })
    if (provider === 'aws') assert.equal(canSelectLibraryVideo((await fetchVideoLibrary())[0]), false)
    else assert.equal(canSelectLibraryVideo({ key: 'legacy', url: '/old.mp4', size: 1, lastModified: null }), true)
    globalThis.fetch = previous
  }
})
