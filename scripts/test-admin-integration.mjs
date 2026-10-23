// Actual-source in-process C3 integration tests. No server or external I/O.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { randomBytes } from 'node:crypto'
const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
const modules = new Map()
const root = process.cwd()
let pageAuthorize, legacyCalls = 0
let dbQuery = async () => { throw Error('Unconfigured offline DB') }
globalThis.__c3 = { authorize: (...a) => pageAuthorize(...a), transaction: run => run({ query: (...a) => dbQuery(...a) }) }
async function load(file) {
  file = path.resolve(root, file)
  if (modules.has(file)) return modules.get(file)
  const source = fs.readFileSync(file, 'utf8')
  let code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  for (const name of new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m => m[1]))) {
    let url
    if (name === 'server-only') url = data('export {}')
    else if (name.endsWith('product-server-request')) url = data('export const authorizeProductPage=(...a)=>globalThis.__c3.authorize(...a)')
    else if (name.endsWith('/db/pool') || name === './db/pool') url = data('export const adminTransaction=run=>globalThis.__c3.transaction(run);export const adminQuery=(...a)=>globalThis.__c3.transaction(db=>db.query(...a))')
    else if (name.endsWith('product-session-runtime')) url = data('export const authorizeProductRequest=(...a)=>globalThis.__c3.authorize(...a)')
    else if (name === 'next/navigation') url = data('export const useRouter=()=>({replace(){},push(){}});export const usePathname=()=>"/dashboard";export const redirect=path=>{throw Error("Redirect:"+path)}')
    else if (name === 'next/headers') url = data('export async function cookies(){throw Error("Unexpected legacy cookies")}; export async function headers(){throw Error("Injected page adapter required")}')
    else if (name === './supabase' || name === '@/lib/supabase') url = data('throw Error("Unexpected legacy browser client")')
    else if (name === '@supabase/supabase-js') url = data('export function createClient(){throw Error("Unexpected legacy HTTP client")}')
    else if (name === '@supabase/ssr') url = data('export function createServerClient(){throw Error("Unexpected legacy session client")}')
    else if (name === './keycloak' && file.endsWith('session.ts')) url = data(`import {randomBytes,createHash} from 'node:crypto';export const randomSecret=()=>randomBytes(32).toString('base64url');export const digest=x=>createHash('sha256').update(x).digest('base64url')`)
    else if (name.startsWith('.') || name.startsWith('@/')) {
      let p = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name)
      if (!path.extname(p)) p += fs.existsSync(p + '.ts') ? '.ts' : '.tsx'
      url = (await load(p)).url
    } else url = import.meta.resolve(name === 'next/server' ? 'next/server.js' : name === 'next/navigation' ? 'next/navigation.js' : name === 'next/link' ? 'next/link.js' : name)
    code = code.replaceAll("'" + name + "'", "'" + url + "'").replaceAll('"' + name + '"', '"' + url + '"')
  }
  const url = data(code), result = { url, exports: await import(url), source }
  modules.set(file, result)
  return result
}
globalThis.fetch = async () => { throw Error('Network forbidden') }
const integration = (await load('lib/auth/integration.ts')).exports
const account = (await load('lib/auth/account.ts')).exports
const bridge = (await load('lib/auth/admin-session.ts')).exports
const client = (await load('lib/admin-auth-client.ts')).exports
const { createSessions } = (await load('lib/auth/session.ts')).exports
const { createAuthHandlers } = (await load('lib/auth/handlers.ts')).exports
const { ProductSessionError } = (await load('lib/product-session-error.ts')).exports
const { renderToStaticMarkup } = await import('react-dom/server')
const env = { ADMIN_AUTH_PROVIDER: 'keycloak', ADMIN_PRODUCT_DATA_PROVIDER: 'rds', ADMIN_CATALOG_DATA_PROVIDER: 'rds', ADMIN_CMS_DATA_PROVIDER: 'rds', ADMIN_OPERATIONS_DATA_PROVIDER: 'rds', ADMIN_IMAGE_PROVIDER: 'aws', ADMIN_VIDEO_PROVIDER: 'aws' }
const issuer = 'https://auth-uat.houseofdiams.com/realms/houseofdiams', origin = 'https://manage-uat.houseofdiams.com'
const profileId = '71ab01bc-4160-40a9-80cb-7519f88e91ab'
function select() { for (const k of Object.keys(env)) delete process.env[k]; Object.assign(process.env, env) }
function fixture() {
  let enabled = true, revokedAt = null, role = 'admin', logoutFails = false
  const rows = new Map()
  const secret = () => randomBytes(32).toString('base64url')
  const copy = x => structuredClone(x)
  const store = {
    async create(k, value) { if (rows.has(k)) return false; rows.set(k, { data: copy(value), version: secret() }); return true },
    async get(k) { return copy(rows.get(k) ?? null) },
    async consume(k, v) { const x = rows.get(k); if (!x || x.version !== v) return null; rows.delete(k); return copy(x.data) },
    async replace(k, v, value) { if (rows.get(k)?.version !== v) return false; rows.set(k, { data: copy(value), version: secret() }); return true },
    async delete(k) { rows.delete(k) },
  }
  const config = { issuer, clientId: 'hod-admin', origin, requiredClientRole: 'hod-admin', sessionMaxSeconds: 3600, sessionIdleSeconds: 600, revalidateSeconds: 60 }
  const deps = { config, store, now: () => 1800000000000,
    lookup: async () => [{ issuer, subject: 'external-subject', profileId, enabled, revokedAt, profileRole: role }],
    oidc: { validate: async () => ({ issuer, subject: 'external-subject', audiences: ['hod-admin'], clientId: 'hod-admin', clientRoles: ['hod-admin'], expiresAt: 1800000300, verified: true }), logout: async () => { if (logoutFails) throw Error('offline upstream failure') } },
  }
  const sessions = createSessions(deps)
  return { sessions, handlers: createAuthHandlers(deps), disable: () => { enabled = false }, revoke: () => { revokedAt = '2026-10-15' }, demote: () => { role = 'customer' }, failLogout: () => { logoutFails = true } }
}
async function established() {
  const f = fixture()
  const { cookie, session } = await f.sessions.establish({ accessToken: 'fixture', refreshToken: 'refresh', idToken: 'id' }, 'nonce')
  const request = (method = 'GET', patch = {}) => new Request(origin + '/api/auth/account', { method, headers: { cookie: '__Host-hod_admin_session=' + cookie, origin, 'x-admin-csrf': session.csrf, ...patch } })
  return { ...f, request, cookie, session }
}

test('Keycloak is the only admin sign-in: unset, legacy or unknown selections are rejected', () => {
  for (const v of [undefined, '', 'supabase']) assert.throws(() => integration.readAdminAuthProvider({ ...env, ADMIN_AUTH_PROVIDER: v }), /unavailable/)
  for (const v of [undefined, '']) assert.throws(() => integration.readAdminAuthProvider({ NODE_ENV: 'production', ADMIN_AUTH_PROVIDER: v }), /unavailable/)
  for (const v of ['Keycloak', ' keycloak ', 'rds', 'aws']) assert.throws(() => integration.readAdminAuthProvider({ ...env, ADMIN_AUTH_PROVIDER: v }))
  assert.equal(integration.readAdminAuthProvider(env), 'keycloak')
})
test('all 64 feature combinations: only six explicitly migrated modes permit global Keycloak', () => {
  const names = Object.keys(env).slice(1)
  for (let mask = 0; mask < 64; mask++) {
    const selected = { ...env }
    names.forEach((name, bit) => { if (!(mask & (1 << bit))) delete selected[name] })
    if (mask === 63) assert.equal(integration.readAdminAuthProvider(selected), 'keycloak')
    else assert.throws(() => integration.readAdminAuthProvider(selected))
  }
  for (const name of names) assert.throws(() => integration.readAdminAuthProvider({ ...env, [name]: 'unknown' }))
})
test('each actual feature selector accepts only its AWS provider and rejects everything else', async () => {
  const readers = [
    ['product', 'readProductDataProvider', 'ADMIN_PRODUCT_DATA_PROVIDER', 'rds', 'supabase'],
    ['catalog', 'readCatalogDataProvider', 'ADMIN_CATALOG_DATA_PROVIDER', 'rds', 'supabase'],
    ['cms', 'readCmsDataProvider', 'ADMIN_CMS_DATA_PROVIDER', 'rds', 'supabase'],
    ['operations', 'readOperationsProvider', 'ADMIN_OPERATIONS_DATA_PROVIDER', 'rds', 'supabase'],
    ['image', 'readImageProvider', 'ADMIN_IMAGE_PROVIDER', 'aws', 'legacy'],
    ['video', 'readVideoProvider', 'ADMIN_VIDEO_PROVIDER', 'aws', 'legacy'],
  ]
  for (const [name, fn, flag, selected, legacy] of readers) {
    const read = (await load(`lib/${name}-provider.ts`)).exports[fn]
    assert.equal(read(env), selected)
    assert.throws(() => read({}))
    assert.throws(() => read({ [flag]: selected }))
    assert.throws(() => read({ ...env, ADMIN_AUTH_PROVIDER: 'unknown' }))
    assert.throws(() => read({ ...env, [flag]: legacy }))
    assert.throws(() => read({ ADMIN_AUTH_PROVIDER: 'keycloak' }))
  }
})
test('actual auth provider endpoint is no-store and fails closed on mixed/unknown configuration', async () => {
  select()
  const { GET } = (await load('app/api/auth/provider/route.ts')).exports
  const selected = await GET(); assert.equal(selected.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await selected.json(), { provider: 'keycloak' })
  delete process.env.ADMIN_VIDEO_PROVIDER; assert.equal((await GET()).status, 503)
  process.env.ADMIN_AUTH_PROVIDER = 'unknown'; assert.equal((await GET()).status, 503)
  delete process.env.ADMIN_AUTH_PROVIDER; assert.equal((await GET()).status, 503)
})
test('actual B1 session -> shared SSR bridge returns mapped UUID and no legacy identity', async () => {
  const f = await established()
  const result = await bridge.resolveAdminServerSession({ provider: () => 'keycloak', authorize: () => f.sessions.authorize(f.request()) })
  assert.deepEqual(result, { userId: profileId, email: null, role: 'admin' }); assert.equal(legacyCalls, 0)
})
for (const state of ['disable', 'revoke', 'demote']) test('shared SSR bridge denies mapping ' + state, async () => {
  const f = await established(); f[state]()
  await assert.rejects(bridge.resolveAdminServerSession({ provider: () => 'keycloak', authorize: () => f.sessions.authorize(f.request()) }))
})
test('SSR missing cookie and bearer-only authority deny', async () => {
  const f = await established()
  for (const headers of [{}, { authorization: 'Bearer fixture' }]) await assert.rejects(f.sessions.authorize(new Request(origin, { headers })))
})
test('SSR bridge: an unknown provider selection cannot reach the session adapter', async () => {
  await assert.rejects(bridge.resolveAdminServerSession({ provider: () => integration.readAdminAuthProvider({ ADMIN_AUTH_PROVIDER: 'invalid' }), authorize: () => { throw Error('cookie') } }), /integration/)
})
test('actual admin-server selected path uses injected page adapter without Supabase env', async () => {
  select(); const f = await established(); pageAuthorize = () => f.sessions.authorize(f.request())
  const { getAdminServerSession } = (await load('lib/admin-server.ts')).exports
  assert.equal((await getAdminServerSession()).userId, profileId)
  pageAuthorize = async () => { throw new ProductSessionError(401) }; assert.equal(await getAdminServerSession(), null)
  pageAuthorize = async () => { throw new ProductSessionError(503) }; await assert.rejects(getAdminServerSession(), /unavailable/)
})
test('the legacy Supabase clients and sign-in helpers no longer exist', () => {
  for (const file of ['lib/cms-auth.ts', 'lib/admin-supabase.ts', 'lib/server-supabase.ts', 'lib/supabase.ts', 'app/login/legacy-login.tsx']) assert.equal(fs.existsSync(path.join(root, file)), false, file)
})
test('account inactive by default; exact issuer and reviewed destination only', () => {
  assert.equal(account.accountConsoleUrl({}), null)
  const cfg = { ADMIN_KEYCLOAK_ACCOUNT_VERIFIED: 'true', ADMIN_OIDC_ISSUER: issuer, ADMIN_KEYCLOAK_ACCOUNT_URL: issuer + '/account/' }
  assert.equal(account.accountConsoleUrl(cfg), issuer + '/account/')
  for (const url of [undefined, 'https://evil.test/', issuer + '/account/?redirect_uri=https://evil.test', issuer + '/account/#password', issuer + '/account', issuer.replace('https:', 'http:') + '/account/']) assert.throws(() => account.accountConsoleUrl({ ...cfg, ADMIN_KEYCLOAK_ACCOUNT_URL: url }))
  assert.throws(() => account.accountConsoleUrl({ ...cfg, ADMIN_OIDC_ISSUER: 'https://customer.test' }))
})
test('account handler with real B1 session denies unavailable policy without fake success', async () => {
  const f = await established()
  const handle = account.createAccountHandler({ provider: () => 'keycloak', authorize: (...a) => f.sessions.authorize(...a), env: () => ({}) })
  const response = await handle(f.request('POST')); assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.json()).success, undefined)
})
test('account handler preserves CSRF/origin and mapped state, never a bearer authority', async () => {
  const f = await established()
  const handle = account.createAccountHandler({ provider: () => 'keycloak', authorize: (...a) => f.sessions.authorize(...a), env: () => ({ ADMIN_KEYCLOAK_ACCOUNT_VERIFIED: 'true', ADMIN_OIDC_ISSUER: issuer, ADMIN_KEYCLOAK_ACCOUNT_URL: issuer + '/account/' }) })
  assert.deepEqual(await (await handle(f.request('POST'))).json(), { action: 'account-console', url: issuer + '/account/' })
  for (const patch of [{ origin: 'https://evil.test' }, { 'x-admin-csrf': '' }, { cookie: '', authorization: 'Bearer fixture' }]) assert.notEqual((await handle(f.request('POST', patch))).status, 200)
  assert.equal((await handle(f.request())).status, 405)
  f.disable(); assert.notEqual((await handle(f.request('POST'))).status, 200)
})
test('account handler preserves session error status and safe errors', async () => {
  for (const status of [401, 403, 503]) {
    const handle = account.createAccountHandler({ provider: () => 'keycloak', authorize: async () => { throw new ProductSessionError(status) }, env: () => ({}) })
    assert.equal((await handle(new Request(origin, { method: 'POST' }))).status, status)
  }
  assert.equal((await account.createAccountHandler({ provider: () => 'supabase', authorize: () => { throw Error('must not run') }, env: () => ({}) })(new Request(origin))).status, 409)
})
for (const upstreamFailure of [false, true]) test('client logout uses actual B1 handler; local session gone, upstream result honest: ' + upstreamFailure, async () => {
  const f = await established(); if (upstreamFailure) f.failLogout()
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push([url, options])
    if (url === '/api/auth/provider') return Response.json({ provider: 'keycloak' })
    if (url === '/api/auth/session') return f.handlers.session(f.request())
    if (url === '/api/auth/logout') return f.handlers.logout(f.request('POST', Object.fromEntries(new Headers(options.headers))))
    throw Error('Unexpected call')
  }
  assert.deepEqual(await client.logoutAdmin(), { upstreamLogout: !upstreamFailure })
  await assert.rejects(f.sessions.authorize(f.request()))
  assert.deepEqual(calls.map(x => x[0]), ['/api/auth/session', '/api/auth/logout'])
  assert.ok(calls.every(([, opts]) => opts.credentials === 'same-origin' && opts.cache === 'no-store'))
})
test('client account handoff uses actual handler and CSRF; no password or OIDC token sent', async () => {
  const f = await established()
  const handle = account.createAccountHandler({ provider: () => 'keycloak', authorize: (...a) => f.sessions.authorize(...a), env: () => ({ ADMIN_KEYCLOAK_ACCOUNT_VERIFIED: 'true', ADMIN_OIDC_ISSUER: issuer, ADMIN_KEYCLOAK_ACCOUNT_URL: issuer + '/account/' }) })
  globalThis.fetch = async (url, opts) => {
    if (url === '/api/auth/provider') return Response.json({ provider: 'keycloak' })
    if (url === '/api/auth/session') return f.handlers.session(f.request())
    assert.equal(url, '/api/auth/account'); assert.equal(opts.body, undefined); assert.equal(new Headers(opts.headers).get('authorization'), null)
    return handle(f.request('POST', Object.fromEntries(new Headers(opts.headers))))
  }
  assert.equal(await client.openAdminAccount(), issuer + '/account/')
})
for (const payload of [{}, { authenticated: true }, { authenticated: true, actor: { profileId }, csrfToken: '' }]) test('client refuses malformed cookie contract ' + JSON.stringify(payload), async () => {
  globalThis.fetch = async () => Response.json(payload)
  await assert.rejects(client.adminCookieSession())
})
test('client unknown provider never falls back to Supabase', async () => {
  globalThis.fetch = async () => Response.json({ provider: 'unknown' })
  await assert.rejects(client.logoutAdmin()); await assert.rejects(client.openAdminAccount())
})
test('server-rendered login uses Keycloak POST with no password input and no redirect loop', async () => {
  select()
  const { default: Login } = (await load('app/login/page.tsx')).exports
  const html = renderToStaticMarkup(await Login({}))
  assert.match(html, /action="\/api\/auth\/login"/); assert.match(html, /method="post"/); assert.doesNotMatch(html, /type="password"/)
  process.env.ADMIN_AUTH_PROVIDER = 'unknown'
  assert.match(renderToStaticMarkup(await Login({})), /unavailable/)
})
test('AdminGate pending SSR hides children before asynchronous authorization', async () => {
  const { AdminGate } = (await load('components/admin-gate.tsx')).exports
  const { createElement } = await import('react')
  const html = renderToStaticMarkup(createElement(AdminGate, null, 'PRIVATE CONTENT'))
  assert.doesNotMatch(html, /PRIVATE CONTENT/)
})
async function gateEffect() {
  // Injectable hook lifecycle, not a browser/rendering claim. Actual gate body,
  // asynchronous client transport and B1 session handler all execute in process.
  const hooks = { effects: [], ready: [], redirects: [] }
  globalThis.__c3hooks = hooks
  let code = ts.transpileModule(fs.readFileSync('components/admin-gate.tsx', 'utf8'), { fileName: 'gate.tsx', compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const react = data('export const useEffect=f=>globalThis.__c3hooks.effects.push(f);export const useState=()=>[false,v=>globalThis.__c3hooks.ready.push(v)]')
  const nav = data('export const useRouter=()=>({replace:p=>globalThis.__c3hooks.redirects.push(p)})')
  code = code.replaceAll("'react'", JSON.stringify(react)).replaceAll("'next/navigation'", JSON.stringify(nav)).replaceAll("'@/lib/admin-auth-client'", JSON.stringify((await load('lib/admin-auth-client.ts')).url)).replaceAll("'@/lib/supabase'", JSON.stringify(data('throw Error("Legacy browser client forbidden")'))).replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  const { AdminGate } = await import(data(code)); AdminGate({ children: 'private' })
  return { hooks, cleanup: hooks.effects[0]() }
}
test('actual gate effect validates cookie session and never imports legacy browser client in Keycloak mode', async () => {
  const f = await established()
  globalThis.fetch = async url => url === '/api/auth/provider' ? Response.json({ provider: 'keycloak' }) : f.handlers.session(f.request())
  const { hooks, cleanup } = await gateEffect()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(hooks.ready, [true]); assert.deepEqual(hooks.redirects, []); cleanup()
})
test('actual gate effect denies revoked mapping and unknown provider', async () => {
  const f = await established(); f.revoke()
  for (const provider of ['keycloak', 'unknown']) {
    globalThis.fetch = async url => url === '/api/auth/provider' ? Response.json({ provider }) : f.handlers.session(f.request())
    const { hooks, cleanup } = await gateEffect()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(hooks.ready, []); assert.deepEqual(hooks.redirects, ['/login']); cleanup()
  }
})
test('actual gate effect cannot mark ready after unmount during session validation', async () => {
  let release
  globalThis.fetch = async url => url === '/api/auth/provider' ? Response.json({ provider: 'keycloak' }) : new Promise(resolve => { release = resolve })
  const { hooks, cleanup } = await gateEffect()
  await new Promise(resolve => setImmediate(resolve)); cleanup()
  release(Response.json({ authenticated: true, actor: { profileId }, csrfToken: 'fixture' }))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(hooks.ready, []); assert.deepEqual(hooks.redirects, [])
})
test('actual shared dashboard layout and summary use RDS adapters with mapped notification ownership', async () => {
  select(); const f = await established()
  // React cache() deduplicates authorizeProductPage within an RSC request. React's
  // standalone renderer has no request dispatcher, so inject that boundary here.
  const authorization = f.sessions.authorize(f.request()); pageAuthorize = () => authorization
  const sqlCalls = []
  dbQuery = async (sql, args) => {
    sqlCalls.push([sql, args])
    if (sql.includes('AS present')) return { rows: [{ present: false }] }
    if (sql.includes('AS identities')) return { rows: [{ identities: '2', guest_orders: '1', legacy_account_orders: '3' }] }
    if (sql.includes("'products',(SELECT")) return { rows: [{ item: JSON.stringify({ products: 2, orders: 0, identities: 2, guestOrders: 1, revenue: [], recent: [], items: [] }) }] }
    return { rows: [] }
  }
  const { default: Layout } = (await load('app/dashboard/layout.tsx')).exports
  const result = await Layout({ children: 'CHILD' })
  assert.equal(result.props.children[0].props.customerCount, 2)
  assert.ok(sqlCalls.some(([sql, args]) => sql.includes('admin_notification_reads') && args[0] === profileId))
  const { default: Dashboard } = (await load('app/dashboard/page.tsx')).exports
  const html = renderToStaticMarkup(await Dashboard())
  assert.match(html, /Customer identities/); assert.doesNotMatch(html, /Supabase auth registrations/)
  pageAuthorize = async () => { throw new ProductSessionError(401) }
  const prior = sqlCalls.length
  await assert.rejects(Dashboard(), /Redirect:\/login/)
  assert.equal(sqlCalls.length, prior)
})
test('actual password endpoint in Keycloak mode denies inline updates and enforces CSRF before handoff', async () => {
  select(); const f = await established(); pageAuthorize = (...a) => f.sessions.authorize(...a)
  const { POST } = (await load('app/api/settings/password/route.ts')).exports
  const response = await POST(f.request('POST'))
  assert.equal(response.status, 409); assert.equal((await response.json()).success, undefined)
  assert.notEqual((await POST(f.request('POST', { 'x-admin-csrf': '' }))).status, 409)
})
