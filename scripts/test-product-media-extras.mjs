// Offline test for lib/product-media-extras-core.ts: injected boundaries only, no database, no network.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const cache = new Map()
async function load(file) {
  file = path.resolve(root, file)
  if (cache.has(file)) return cache.get(file)
  let code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const name of new Set([...code.matchAll(/(?:from\s+)['"]([^'"]+)['"]/g)].map(match => match[1]))) {
    let url
    if (name.startsWith('.')) {
      let target = path.resolve(path.dirname(file), name)
      if (!path.extname(target)) target += '.ts'
      url = (await load(target)).url
    } else url = import.meta.resolve(name)
    code = code.replaceAll(`'${name}'`, `'${url}'`).replaceAll(`"${name}"`, `"${url}"`)
  }
  const url = data(code)
  const result = { url, exports: await import(url) }
  cache.set(file, result)
  return result
}
const { createMediaExtrasHandlers, mediaExtrasSchema } = (await load('lib/product-media-extras-core.ts')).exports
const { revisionOf, REVISION_HEADER } = (await load('lib/revision.ts')).exports
const { ProductSessionError } = (await load('lib/product-session-error.ts')).exports

const PRODUCT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const L1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const M1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const emptyState = { library: [], links: [], hover: null }
const frames = Array.from({ length: 24 }, (_, i) => `products/hover/${PRODUCT}/v1/${String(i).padStart(2, '0')}.webp`)

function harness({ state = emptyState, productExists = true, authorizeError = null, provider = 'rds', saveError = null, enforceError = null } = {}) {
  const calls = []
  let current = state
  const db = {
    async query(sql, params) {
      calls.push(sql.trim().split(/\s+/).slice(0, 4).join(' '))
      if (/FROM public\.products WHERE id/.test(sql)) return { rows: productExists ? [{ id: PRODUCT }] : [] }
      if (/FROM public\.product_media_library/.test(sql)) return { rows: current.library }
      if (/FROM public\.product_variant_library_links/.test(sql)) return { rows: current.links }
      if (/FROM public\.product_hover_views/.test(sql)) return { rows: current.hover ? [current.hover] : [] }
      if (/admin_product_media_extras_save_v1/.test(sql)) {
        if (saveError) throw saveError
        calls.push({ params })
        current = { library: JSON.parse(params[2]), links: JSON.parse(params[3]).filter(row => row.library_id), hover: params[5] ? (params[4] ? JSON.parse(params[4]) : null) : current.hover }
        return { rows: [] }
      }
      throw new Error('unexpected sql ' + sql)
    },
  }
  const handler = createMediaExtrasHandlers({
    provider: () => provider,
    authorize: async (_request, mutation) => { calls.push(`authorize:${mutation}`); if (authorizeError) throw authorizeError; return { actor: { profileId: '11111111-1111-4111-8111-111111111111' } } },
    transaction: async run => run(db),
    enforceVideos: async (_db, next, previous) => { calls.push({ enforce: { next, previous } }); if (enforceError) throw enforceError },
  })
  return { handler, calls }
}
const get = (id = PRODUCT) => new Request(`https://admin.test/api/products/${id}/media-extras`)
const put = (body, revision) => new Request(`https://admin.test/api/products/${PRODUCT}/media-extras`, {
  method: 'PUT', headers: { 'content-type': 'application/json', ...(revision ? { [REVISION_HEADER]: revision } : {}) }, body: JSON.stringify(body),
})
const VIDEO_URL = 'https://media.houseofdiams.com/products/videos/11111111-2222-4333-8444-555555555555.mp4'
const valid = { library: [{ id: L1, label: 'Yellow gold', media_path: VIDEO_URL }], links: [{ metal_id: M1, library_id: L1 }] }

test('GET returns the saved state with a revision, read-only', async () => {
  const { handler, calls } = harness()
  const response = await handler(get(), PRODUCT)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.available, true)
  assert.equal(body.revision, revisionOf(emptyState))
  assert.ok(calls.includes('authorize:false'))
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('unauthenticated, forbidden and unavailable sessions are refused before any database work', async () => {
  for (const [status, expected] of [[401, 'Unauthorized.'], [403, 'Forbidden.'], [503, 'Administrator session unavailable.']]) {
    const { handler, calls } = harness({ authorizeError: new ProductSessionError(status) })
    const response = await handler(put(valid, 'x'), PRODUCT)
    assert.equal(response.status, status)
    assert.equal((await response.json()).error, expected)
    assert.ok(!calls.some(call => /SELECT|public\./.test(String(call))), 'no query ran')
  }
})

test('rejects a bad product id, other methods and the legacy provider', async () => {
  assert.equal((await harness().handler(get('nope'), 'nope')).status, 400)
  assert.equal((await harness().handler(new Request('https://admin.test/x', { method: 'DELETE' }), PRODUCT)).status, 405)
  assert.equal((await harness({ provider: 'supabase' }).handler(get(), PRODUCT)).status, 503)
  assert.equal((await harness({ productExists: false }).handler(get(), PRODUCT)).status, 404)
})

test('PUT needs the revision the editor loaded, and refuses a stale one', async () => {
  const { handler } = harness()
  assert.equal((await handler(put(valid), PRODUCT)).status, 409)
  assert.equal((await handler(put(valid, 'old-revision'), PRODUCT)).status, 409)
})

test('PUT saves through the guarded function and returns the new revision', async () => {
  const { handler, calls } = harness()
  const response = await handler(put({ ...valid, hover: { version: 1, frame_paths: frames } }, revisionOf(emptyState)), PRODUCT)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.library.length, 1)
  assert.equal(body.hover.frame_paths.length, 24)
  assert.ok(calls.includes('authorize:true'))
  assert.notEqual(body.revision, revisionOf(emptyState))
  assert.ok(calls.some(call => typeof call === 'string' && call.startsWith('SELECT id FROM public.products')), 'locks the product row')
})

test('a save that leaves the hover view out does not touch it', async () => {
  const hover = { version: 3, frame_paths: frames }
  const start = { library: [], links: [], hover }
  const { handler } = harness({ state: start })
  const body = await (await handler(put(valid, revisionOf(start)), PRODUCT)).json()
  assert.equal(body.hover.version, 3)
})

test('input is validated: unknown fields, long labels, wrong frame counts and too many videos', async () => {
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, extra: 1 }).success, false)
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, library: [{ ...valid.library[0], label: 'x'.repeat(81) }] }).success, false)
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, library: [{ ...valid.library[0], label: '   ' }] }).success, false)
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, hover: { version: 1, frame_paths: frames.slice(1) } }).success, false)
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, hover: { version: 0, frame_paths: frames } }).success, false)
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, library: Array.from({ length: 13 }, (_, i) => ({ id: crypto.randomUUID(), label: `v${i}`, media_path: 'a.mp4' })) }).success, false)
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, links: [{ metal_id: 'nope', library_id: null }] }).success, false)
  assert.equal(mediaExtrasSchema.safeParse({ ...valid, hover: null }).success, true)
  const { handler } = harness()
  assert.equal((await handler(put({ library: 'x' }, 'r'), PRODUCT)).status, 400)
})

test('database errors are mapped without leaking internals', async () => {
  const run = async error => {
    const { handler } = harness({ saveError: error })
    return handler(put(valid, revisionOf(emptyState)), PRODUCT)
  }
  const invalid = await run(Object.assign(new Error('A library video has an invalid file address.'), { code: '22023' }))
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error, 'A library video has an invalid file address.')
  assert.equal((await run(Object.assign(new Error('This hover view is older than the saved one.'), { code: '40001' }))).status, 409)
  assert.equal((await run(Object.assign(new Error('x'), { code: '42501' }))).status, 403)
  const missing = await run(Object.assign(new Error('relation "public.product_media_library" does not exist'), { code: '42P01' }))
  assert.equal(missing.status, 503)
  const internal = await run(Object.assign(new Error('password=secret host=db.internal'), { code: 'XX000' }))
  assert.equal(internal.status, 500)
  assert.ok(!JSON.stringify(await internal.json()).includes('secret'))
})

test('a new video must be an uploaded video on the media CDN, not a pasted or external address', async () => {
  for (const media_path of ['https://evil.example.com/x.mp4', 'products/videos/y.mp4', 'http://media.houseofdiams.com/products/videos/y.mp4', 'https://media.houseofdiams.com/products/videos/y.mp4?x=1', 'javascript:alert(1)']) {
    const { handler, calls } = harness()
    const response = await handler(put({ ...valid, library: [{ ...valid.library[0], media_path }] }, revisionOf(emptyState)), PRODUCT)
    assert.equal(response.status, 400, media_path)
    assert.match((await response.json()).error, /admin video uploader/)
    assert.ok(!calls.some(call => typeof call === 'object' && call.params), 'nothing was saved')
  }
})

test('the video admission check runs on the library, and refusals are reported without leaking details', async () => {
  const { handler, calls } = harness()
  await handler(put(valid, revisionOf(emptyState)), PRODUCT)
  const enforced = calls.find(call => typeof call === 'object' && call.enforce).enforce
  assert.deepEqual(enforced.next.library, [{ id: L1, media_type: 'video', media_path: VIDEO_URL }])
  assert.deepEqual(enforced.previous.library, [])

  for (const message of ['Video is not admitted.', 'Use an admitted video from the library.', 'Video reference mismatch.', 'Published video identity changed.']) {
    const refused = await harness({ enforceError: new Error(message) }).handler(put(valid, revisionOf(emptyState)), PRODUCT)
    assert.equal(refused.status, 400, message)
  }
  assert.equal((await harness({ enforceError: new Error('Video admission unavailable.') }).handler(put(valid, revisionOf(emptyState)), PRODUCT)).status, 503)
  const broken = await harness({ enforceError: Object.assign(new Error('connect ECONNREFUSED 10.0.0.5'), { code: 'ECONNREFUSED' }) }).handler(put(valid, revisionOf(emptyState)), PRODUCT)
  assert.equal(broken.status, 500)
  assert.ok(!JSON.stringify(await broken.json()).includes('10.0.0.5'))
})

test('a video already in the library keeps working even if it is not on the media CDN', async () => {
  const legacy = { id: L1, label: 'Old', media_path: 'products/videos/legacy.mp4' }
  const start = { library: [legacy], links: [], hover: null }
  const { handler } = harness({ state: start })
  const response = await handler(put({ library: [{ ...legacy, label: 'Renamed' }], links: [] }, revisionOf(start)), PRODUCT)
  assert.equal(response.status, 200)
})

test('GET before the SQL is installed reports the feature as unavailable instead of failing', async () => {
  const handler = createMediaExtrasHandlers({
    provider: () => 'rds',
    authorize: async () => ({ actor: { profileId: 'x' } }),
    enforceVideos: async () => {},
    transaction: async run => run({ query: async sql => { if (/FROM public\.products WHERE id/.test(sql)) return { rows: [{ id: PRODUCT }] }; throw Object.assign(new Error('missing'), { code: '42P01' }) } }),
  })
  const response = await handler(get(), PRODUCT)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).available, false)
})
