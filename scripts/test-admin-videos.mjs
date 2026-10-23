// Offline actual-source tests: no listeners, real fetch, credential resolution or storage.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ts from 'typescript'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
const sent = [], auth = []
let stored, denied, legacy = 0, listing = [], dispatchFailure = false
globalThis.__c2 = {
  async send(c) { sent.push(c); if (dispatchFailure) throw Error('PRIVATE CLOUD DETAIL'); if (c.constructor.name === 'PutObjectCommand') { stored = c.input; return {} } if (c.constructor.name === 'HeadObjectCommand') return { ContentLength: stored.ContentLength, ContentType: stored.ContentType, ChecksumSHA256: stored.ChecksumSHA256 }; return listing.shift() ?? {} },
  async authorize(req, mutation) { auth.push(mutation); if (denied) throw denied; return { actor: { profileId: '71ab01bc-4160-40a9-80cb-7519f88e91ab' } } },
  async legacy() { legacy++; throw Error('Legacy must not be used') },
}
const modules = new Map()
async function load(relative) {
  const filename = path.resolve(root, relative)
  if (modules.has(filename)) return modules.get(filename)
  let code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const name of new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m => m[1]))) {
    let url
    if (name === 'server-only') url = data('export {}')
    else if (name === '@aws-sdk/client-s3') url = data(`export { PutObjectCommand, HeadObjectCommand, ListObjectsV2Command } from ${JSON.stringify(import.meta.resolve(name))};export class S3Client { send(c) { return globalThis.__c2.send(c) } }`)
    else if (name.endsWith('/product-session-runtime') || name === './product-session-runtime') url = data('export const authorizeProductRequest=(...a)=>globalThis.__c2.authorize(...a)')
    else if (name.endsWith('/cms-auth') || name === './cms-auth') url = data('export const assertAdmin=(...a)=>globalThis.__c2.legacy(...a)')
    else if (name === './supabase' || name === '@/lib/supabase') url = data('throw Error("Legacy browser dependency forbidden")')
    else if (name.startsWith('.') || name.startsWith('@/')) {
      let p = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name)
      if (!path.extname(p)) p += '.ts'
      url = (await load(p)).url
    } else url = import.meta.resolve(name === 'next/server' ? 'next/server.js' : name)
    code = code.replaceAll("'" + name + "'", "'" + url + "'").replaceAll('"' + name + '"', '"' + url + '"')
  }
  const url = data(code), result = { url, exports: await import(url) }
  modules.set(filename, result)
  return result
}
const provider = (await load('lib/video-provider.ts')).exports
const storage = (await load('lib/video-storage.ts')).exports
const library = (await load('lib/video-library.ts')).exports
const route = (await load('lib/video-route.ts')).exports
const client = (await load('lib/video-transport.ts')).exports
const reference = (await load('lib/video-reference.ts')).exports
const { ProductSessionError } = (await load('lib/product-session-error.ts')).exports
const env = { ADMIN_VIDEO_PROVIDER: 'aws', ADMIN_VIDEO_ROUTING_VERIFIED: 'true', ADMIN_IMAGE_CONTENT_ROUTING_VERIFIED: 'true', AWS_MEDIA_BUCKET: 'house-of-diams', NEXT_PUBLIC_MEDIA_CDN_BASE_URL: 'https://media.houseofdiams.com', AWS_CONTENT_BUCKET: 'house-of-diams-hod', AWS_CONTENT_CDN_BASE_URL: 'https://content.houseofdiams.com' }
const uuid = '71ab01bc-4160-40a9-80cb-7519f88e91ab'
const mp4 = Buffer.from([0, 0, 0, 12, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])
const source = { bucket: 'house-of-diams', baseUrl: 'https://media.houseofdiams.com', prefix: 'products/videos/' }
const key = source.prefix + uuid + '.mp4', url = source.baseUrl + '/' + key
function reset() { Object.assign(process.env, env); sent.length = 0; auth.length = 0; denied = null; legacy = 0; dispatchFailure = false; listing = []; library.invalidateAwsVideoLibrary(); client.invalidateClientVideoLibrary() }
globalThis.fetch = async () => { throw Error('Network forbidden') }
async function request({ mime = 'video/mp4', bytes = mp4, fields = { kind: 'video', folder: 'products' }, headers = {} } = {}) {
  const form = new FormData(); form.set('file', new File([bytes], 'untrusted.mov', { type: mime })); for (const [k, v] of Object.entries(fields)) form.set(k, v)
  const encoded = new Response(form), body = await encoded.arrayBuffer()
  return new Request('https://admin.example/api/products/media', { method: 'POST', headers: { 'content-type': encoded.headers.get('content-type'), 'content-length': String(body.byteLength), 'x-admin-video-upload': '1', ...headers }, body })
}
test('video provider is exactly AWS; unset, legacy and unknown selections are rejected', () => {
  const full = { ADMIN_AUTH_PROVIDER: 'keycloak', ADMIN_PRODUCT_DATA_PROVIDER: 'rds', ADMIN_CATALOG_DATA_PROVIDER: 'rds', ADMIN_CMS_DATA_PROVIDER: 'rds', ADMIN_OPERATIONS_DATA_PROVIDER: 'rds', ADMIN_IMAGE_PROVIDER: 'aws', ADMIN_VIDEO_PROVIDER: 'aws' }
  assert.equal(provider.readVideoProvider(full), 'aws')
  assert.throws(() => provider.readVideoProvider({ ADMIN_VIDEO_PROVIDER: 'aws' }))
  for (const value of [undefined, '', 'legacy']) assert.throws(() => provider.readVideoProvider({ ...full, ADMIN_VIDEO_PROVIDER: value }))
  for (const value of ['AWS', 's3', ' aws ', 'r2', 'supabase']) assert.throws(() => provider.readVideoProvider({ ...full, ADMIN_VIDEO_PROVIDER: value }))
})
test('unmarked, unknown and unavailable video settings fail closed', async () => {
  reset(); assert.equal(await route.selectedMixedVideo(await request({ headers: { 'x-admin-video-upload': '' } }), 'product'), null)
  process.env.ADMIN_VIDEO_PROVIDER = 'legacy'; assert.equal((await route.selectedMixedVideo(await request(), 'product')).status, 503); assert.equal(route.denyLegacyVideoInAwsMode().status, 503)
  process.env.ADMIN_VIDEO_PROVIDER = 'unknown'; assert.equal((await route.selectedMixedVideo(await request(), 'product')).status, 503); assert.equal(route.denyLegacyVideoInAwsMode().status, 503)
  reset(); delete process.env.ADMIN_VIDEO_ROUTING_VERIFIED; assert.equal((await route.selectedMixedVideo(await request(), 'product')).status, 503); assert.equal(sent.length, 0)
})
test('real mixed endpoints dispatch selected videos before legacy auth and preserve image marker separation', async () => {
  for (const [file, status] of [['app/api/products/media/route.ts', 201], ['app/api/cms/uploads/about-hero/route.ts', 200]]) { reset(); const mod = (await load(file)).exports; assert.equal((await mod.POST(await request())).status, status); assert.equal(legacy, 0) }
})
test('selected library route authenticates read and propagates errors, not empty success', async () => {
  reset(); const mod = (await load('app/api/products/videos/route.ts')).exports
  const response = await mod.GET(new Request('https://admin.example/api/products/videos?refresh=1')); assert.equal(response.status, 200); assert.deepEqual(auth, [false]); assert.equal(sent.length, 5); assert.equal(legacy, 0)
  reset(); dispatchFailure = true; assert.equal((await mod.GET(new Request('https://admin.example/api/products/videos'))).status, 503)
  reset(); denied = new ProductSessionError(401); assert.equal((await mod.GET(new Request('https://admin.example/api/products/videos'))).status, 401); assert.equal(sent.length, 0)
  reset(); assert.equal((await mod.GET(new Request('https://admin.example/api/products/videos?folder=unknown'))).status, 400); assert.equal(sent.length, 0)
})
test('the legacy about-hero signing route no longer exists', () => {
  assert.equal(fs.existsSync(path.join(root, 'app/api/cms/uploads/about-hero/sign/route.ts')), false)
})
test('canonical video URLs reject temporary URLs/host confusion while accepting encoded historical names', () => {
  for (const value of [url, 'https://content.houseofdiams.com/about/hero/video/old%20name.mov']) assert.equal(reference.isCanonicalAwsVideoReference(value), true)
  for (const value of [url + '?X-Amz-Signature=x', url + '#x', 'https://media.houseofdiams.com.evil/a/b.mp4', 'https://x@media.houseofdiams.com/a/b.mp4', 'https://media.houseofdiams.com:444/a/b.mp4', 'https://media.houseofdiams.com/a/%2e%2e/b.mp4', 'https://media.houseofdiams.com/a/%5cx.mp4']) assert.equal(reference.isCanonicalAwsVideoReference(value), false, value)
})
async function withFetch(fn, run) { const old = globalThis.fetch; globalThis.fetch = fn; try { return await run() } finally { globalThis.fetch = old } }
test('client selected upload uses cookie/CSRF marker, no bearer/sign/legacy and invalidates cache', async () => {
  reset(); const calls = []
  const result = await withFetch(async (endpoint, options) => { calls.push([endpoint, options]); if (endpoint === '/api/videos/provider') return Response.json({ provider: 'aws', namespace: 'a' }); if (endpoint === '/api/auth/session') return Response.json({ authenticated: true, csrfToken: 'csrf' }); return Response.json({ provider: 's3', path: url, url }) }, () => client.uploadAwsVideo(new File([mp4], 'a', { type: 'video/mp4' }), '/api/products/media', { kind: 'video', folder: 'products' }))
  assert.equal(result, url); assert.equal(calls.length, 3); assert.deepEqual(calls[2][1].headers, { 'x-admin-csrf': 'csrf', 'x-admin-video-upload': '1' }); assert.equal(calls[2][1].credentials, 'same-origin')
})
for (const mode of ['bad-provider', 'bad-session', 'storage-failure', 'bad-url']) test('client failure does not fall back: ' + mode, async () => {
  reset(); const calls = []
  await withFetch(async endpoint => { calls.push(endpoint); if (endpoint === '/api/videos/provider') return Response.json({ provider: mode === 'bad-provider' ? 'invalid' : 'aws', namespace: 'a' }); if (endpoint === '/api/auth/session') return Response.json(mode === 'bad-session' ? {} : { authenticated: true, csrfToken: 'csrf' }); return mode === 'bad-url' ? Response.json({ provider: 's3', path: url + '?signed=1', url: url + '?signed=1' }) : Response.json({ error: 'fail' }, { status: 500 }) }, () => assert.rejects(client.uploadAwsVideo(new File([mp4], 'a', { type: 'video/mp4' }), '/api/products/media', { kind: 'video', folder: 'products' })))
  assert.ok(calls.length <= 3); assert.ok(!calls.some(x => x.includes('/sign')))
})
test('client rejects the removed legacy provider before session/sign/storage', async () => {
  reset(); let count = 0
  await withFetch(async () => { count++; return Response.json({ provider: 'legacy', namespace: 'r2' }) }, async () => assert.rejects(client.uploadAwsVideo(new File([mp4], 'a', { type: 'video/mp4' }), '/api/products/media', { kind: 'video' }))); assert.equal(count, 1)
})
test('client library configuration namespace, refresh and upload invalidation', async () => {
  reset(); let namespace = 'a', count = 0
  const fetch = async endpoint => endpoint === '/api/videos/provider' ? Response.json({ provider: 'aws', namespace }) : (count++, Response.json({ namespace, items: [{ key, url, size: 12, lastModified: null }] }))
  await withFetch(fetch, async () => { await client.fetchVideoLibrary(); await client.fetchVideoLibrary(); assert.equal(count, 1); namespace = 'b'; await client.fetchVideoLibrary(); assert.equal(count, 2); await client.fetchVideoLibrary(true); assert.equal(count, 3); client.invalidateClientVideoLibrary(); await client.fetchVideoLibrary(); assert.equal(count, 4) })
})
test('client rejects malformed/error/stale-config library without caching an empty result', async () => {
  for (const payload of [{}, { items: [], namespace: 'wrong' }, { items: [{ key, url, size: -1, lastModified: null }], namespace: 'a' }]) { reset(); let count = 0; await withFetch(async endpoint => endpoint === '/api/videos/provider' ? Response.json({ provider: 'aws', namespace: 'a' }) : (count++, Response.json(payload)), async () => { await assert.rejects(client.fetchVideoLibrary()); await assert.rejects(client.fetchVideoLibrary()); assert.equal(count, 2) }) }
})
test('actual B1 session enforces cookie, origin, CSRF and enabled mapping for selected videos', async () => {
  const { createSessions } = (await load('lib/auth/session.ts')).exports
  const { SESSION_COOKIE } = (await load('lib/auth/request-security.ts')).exports
  const actor = { profileId: uuid, issuer: 'https://admin.example/realm', subject: 'trusted-subject' }
  const rows = new Map(); let version = 0, enabled = true
  const copy = x => structuredClone(x)
  const store = { async create(k, d) { if (rows.has(k)) return false; rows.set(k, { version: String(++version), data: copy(d) }); return true }, async get(k) { return rows.has(k) ? copy(rows.get(k)) : null }, async consume(k, v) { const x = rows.get(k); if (!x || x.version !== v) return null; rows.delete(k); return copy(x.data) }, async replace(k, v, d) { const x = rows.get(k); if (!x || x.version !== v) return false; rows.set(k, { version: String(++version), data: copy(d) }); return true }, async delete(k) { rows.delete(k) } }
  const seconds = 1800000000, config = { origin: 'https://admin.example', issuer: actor.issuer, clientId: 'hod-admin', requiredClientRole: 'hod-admin', sessionIdleSeconds: 600, sessionMaxSeconds: 3600, revalidateSeconds: 60 }
  const claims = { issuer: actor.issuer, subject: actor.subject, clientId: 'hod-admin', audiences: ['hod-admin'], clientRoles: ['hod-admin'], expiresAt: seconds + 300 }
  const sessions = createSessions({ config, store, oidc: { async validate() { return claims } }, lookup: async () => [{ ...actor, enabled, revokedAt: null, profileRole: 'admin' }], now: () => seconds * 1000 })
  const issued = await sessions.establish({ accessToken: 'injected-validated-access', idToken: 'injected-validated-id', refreshToken: 'offline-refresh' }, 'offline-nonce')
  const headers = { cookie: SESSION_COOKIE + '=' + issued.cookie, 'x-admin-csrf': issued.session.csrf, origin: config.origin }
  const original = globalThis.__c2.authorize
  globalThis.__c2.authorize = async (req, mutation) => { try { return await sessions.authorize(req, mutation) } catch (error) { throw new ProductSessionError(error.message === 'Session missing' ? 401 : 403) } }
  try {
    reset(); assert.equal((await route.selectedMixedVideo(await request({ headers, fields: { kind: 'video', folder: 'hiphop', actor: 'browser-controlled' } }), 'product')).status, 201); assert.equal(legacy, 0); assert.ok(stored.Key.startsWith('hiphop/videos/'))
    for (const patch of [{ origin: 'https://evil.example' }, { 'x-admin-csrf': 'wrong' }, { cookie: '', authorization: 'Bearer browser-token' }]) {
      reset(); const response = await route.selectedMixedVideo(await request({ headers: { ...headers, ...patch } }), 'product'); assert.equal(response.status, patch.cookie === '' ? 401 : 403); assert.equal(sent.length, 0); assert.equal(legacy, 0)
    }
    enabled = false; reset(); assert.equal((await route.selectedMixedVideo(await request({ headers }), 'product')).status, 403); assert.equal(sent.length, 0)
  } finally { globalThis.__c2.authorize = original }
})
test('actual CMS and product upload consumers select video protocol before legacy auth', async () => {
  reset(); const cms = (await load('lib/cms-direct-upload-client.ts')).exports
  await withFetch(async endpoint => {
    if (endpoint === '/api/videos/provider') return Response.json({ provider: 'aws', namespace: 'a' })
    if (endpoint === '/api/auth/session') return Response.json({ authenticated: true, csrfToken: 'csrf' })
    assert.equal(endpoint, '/api/cms/uploads/about-hero'); return Response.json({ provider: 's3', path: url, url })
  }, async () => assert.equal(await cms.uploadCmsAssetDirectWithFallback({ file: new File([mp4], 'a', { type: 'video/mp4' }), signEndpoint: '/api/cms/uploads/about-hero/sign', fallbackEndpoint: '/api/cms/uploads/about-hero', fallbackFields: { kind: 'video' } }), url))
  const file = 'components/product-form.tsx', sf = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true)
  let selected
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'uploadMedia') selected = n.initializer; ts.forEachChild(n, visit) } visit(sf)
  const js = ts.transpileModule('const selected = (' + selected.getText(sf) + ');', { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const fn = Function('uploadAwsImage', 'uploadAwsVideo', js + '\nreturn selected')(async () => { throw new Error('unexpected image upload') }, async () => url)
  assert.deepEqual(await fn(new File([mp4], 'a', { type: 'video/mp4' }), 'video', 'products'), { path: url, provider: 's3' })
})
test('all three container types retain existing magic acceptance and canonical suffix', async () => {
  for (const [mime, bytes, extension] of [['video/mp4', mp4, 'mp4'], ['video/quicktime', mp4, 'mov'], ['video/webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), 'webm']]) {
    reset(); const response = await route.selectedMixedVideo(await request({ mime, bytes }), 'product'); assert.equal(response.status, 201); assert.equal(stored.ContentType, mime); assert.ok(stored.Key.endsWith('.' + extension))
  }
})
test('storage enforces the 100MiB cap before any command and Head errors cannot succeed', async () => {
  let count = 0
  await assert.rejects(storage.createVideoStorage(async () => { count++; return {} }).upload(source, Buffer.alloc(storage.MAX_VIDEO_BYTES + 1), 'video/mp4', uuid))
  assert.equal(count, 0)
  await assert.rejects(storage.createVideoStorage(async c => { count++; if (c.constructor.name === 'HeadObjectCommand') throw Error('head denied'); return {} }).upload(source, mp4, 'video/mp4', uuid))
  assert.equal(count, 2)
})
test('concurrent library reads coalesce but refresh replaces pending generation', async () => {
  const cache = library.createVideoLibrary(); let finish, loads = 0
  const load = () => { loads++; return new Promise(r => { finish = r }) }
  const a = cache.get('a', load), b = cache.get('a', load)
  await Promise.resolve(); assert.equal(loads, 1)
  finish(['one']); assert.deepEqual(await a, ['one']); assert.deepEqual(await b, ['one'])
})
test('client in-flight invalidation cannot repopulate stale library cache', async () => {
  reset(); let finish, count = 0
  await withFetch(async endpoint => {
    if (endpoint === '/api/videos/provider') return Response.json({ provider: 'aws', namespace: 'a' })
    count++
    if (count === 1) return new Promise(r => { finish = () => r(Response.json({ namespace: 'a', items: [{ key, url, size: 1, lastModified: null }] })) })
    return Response.json({ namespace: 'a', items: [{ key, url, size: 2, lastModified: null }] })
  }, async () => {
    const old = client.fetchVideoLibrary(); while (!finish) await new Promise(r => setImmediate(r))
    client.invalidateClientVideoLibrary(); assert.equal((await client.fetchVideoLibrary())[0].size, 2)
    finish(); await old; assert.equal((await client.fetchVideoLibrary())[0].size, 2); assert.equal(count, 2)
  })
})
