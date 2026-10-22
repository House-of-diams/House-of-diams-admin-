// Offline only: no listen(), HTTP server, browser, Redis or database connection.
import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import fs from 'node:fs'
import ts from 'typescript'
// Execute the actual server-only sources in memory; remove only Next's import sentinel.
// No protocol, cryptography or session behavior is replaced by this loader.
async function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
  if (path.includes('/auth/') && !path.endsWith('admin-identity-core.ts')) assert.ok(source.includes("import 'server-only'"))
  let code = ts.transpileModule(source.replace("import 'server-only'", ''), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [name, url] of Object.entries(dependencies)) code = code.replaceAll(`'${name}'`, `'${url}'`)
  const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  return { url, exports: await import(url) }
}
const profile = await load('../lib/deployment-profile.ts')
const cfg = await load('../lib/auth/config.ts', { '../deployment-profile': profile.url })
const security = await load('../lib/auth/request-security.ts')
const core = await load('../lib/auth/admin-identity-core.ts')
const oidcModule = await load('../lib/auth/keycloak.ts', { './request-security': security.url, jose: import.meta.resolve('jose') })
const sessionModule = await load('../lib/auth/session.ts', { './admin-identity-core': core.url, './keycloak': oidcModule.url, './request-security': security.url })
const handlerModule = await load('../lib/auth/handlers.ts', { './session': sessionModule.url, './request-security': security.url })
const storageModule = await load('../lib/auth/session-store.ts', { './config': cfg.url, './keycloak': oidcModule.url })
const { readAuthConfig } = cfg.exports
const { createKeycloak, randomSecret, digest } = oidcModule.exports
const { createSessions } = sessionModule.exports
const { createAuthHandlers } = handlerModule.exports
const { createSessionStore } = storageModule.exports
const { safeReturnPath, assertMutation, SESSION_COOKIE, FLOW_COOKIE, secureCookie } = security.exports

const env = {
  ADMIN_AUTH_POLICY_VERIFIED: 'true', ADMIN_OIDC_ISSUER: 'https://auth-uat.houseofdiams.com/realms/houseofdiams',
  ADMIN_OIDC_CLIENT_ID: 'hod-admin', ADMIN_OIDC_CLIENT_SECRET: 'offline-fixture-secret',
  ADMIN_OIDC_TOKEN_AUTH_METHOD: 'client_secret_post',
  ADMIN_AUTH_ORIGIN: 'https://manage-uat.houseofdiams.com', ADMIN_OIDC_ROLE_LOCATION: 'client',
  ADMIN_OIDC_REQUIRED_ROLE: 'hod-admin', ADMIN_SESSION_MAX_SECONDS: '3600',
  ADMIN_SESSION_IDLE_SECONDS: '600', ADMIN_SESSION_REVALIDATE_SECONDS: '60',
}
const config = readAuthConfig(env)
const origin = config.origin
const pair = await generateKeyPair('RS256')
const jwk = { ...await exportJWK(pair.publicKey), kid: 'offline-key', alg: 'RS256', use: 'sig' }
const profileId = '71ab01bc-4160-40a9-80cb-7519f88e91ab'
const mapping = { issuer: config.issuer, subject: 'keycloak-subject', profileId, enabled: true, revokedAt: null, profileRole: 'admin' }
let seconds = 1800000000

async function jwt(kind, overrides = {}, key = pair.privateKey, header = {}) {
  return new SignJWT({ typ: kind, azp: 'hod-admin', resource_access: { 'hod-admin': { roles: ['hod-admin'] } }, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'offline-key', ...header }).setIssuer(overrides.iss ?? config.issuer)
    .setSubject(overrides.sub ?? mapping.subject).setAudience(overrides.aud ?? 'hod-admin')
    .setIssuedAt(overrides.iat ?? seconds).setExpirationTime(overrides.exp ?? seconds + 120).sign(key)
}
async function tokens(nonce, access = {}, id = {}) {
  return { accessToken: await jwt('Bearer', access), idToken: await jwt('ID', { nonce, ...id }), refreshToken: randomSecret() }
}
function memory() {
  const rows = new Map()
  const copy = v => structuredClone(v)
  return {
    rows,
    async create(key, data, ttl) { if (rows.has(key)) return false; rows.set(key, { version: randomSecret(), data: copy(data), until: seconds + ttl }); return true },
    async get(key) { const v = rows.get(key); if (!v || v.until <= seconds) return null; return copy(v) },
    async consume(key, version) { const v = rows.get(key); if (!v || v.until <= seconds || v.version !== version) return null; rows.delete(key); return copy(v.data) },
    async replace(key, version, data, ttl) { const v = rows.get(key); if (!v || v.until <= seconds || v.version !== version) return false; rows.set(key, { version: randomSecret(), data: copy(data), until: seconds + ttl }); return true },
    async delete(key) { rows.delete(key) },
  }
}
function fixture(options = {}) {
  seconds = 1800000000
  const store = memory()
  const calls = []
  let issued
  const fetcher = async (input, init) => {
    const url = String(input)
    calls.push({ url, init })
    assert.equal(init.redirect, 'error')
    assert.equal(init.cache, 'no-store')
    if (url.endsWith('/certs')) return Response.json(options.jwks ?? { keys: [jwk] })
    if (url.endsWith('/logout')) { if (options.logoutFailure) throw Error('offline failure'); return new Response(null, { status: 204 }) }
    assert.ok(url.endsWith('/token'))
    const form = new URLSearchParams(init.body)
    assert.equal(form.get('client_secret'), env.ADMIN_OIDC_CLIENT_SECRET)
    if (options.tokenFailure) return Response.json({ error: 'offline' }, { status: 400 })
    if (options.tokenOutage) return Response.json({ error: 'busy' }, { status: 503 })
    if (form.get('grant_type') === 'authorization_code') {
      assert.equal(digest(form.get('code_verifier')), options.challenge)
      assert.equal(form.get('redirect_uri'), `${origin}/api/auth/callback`)
      issued = await tokens(options.nonce, options.access, options.id)
    } else issued = await tokens(undefined, options.refreshAccess, options.refreshId)
    return Response.json({ token_type: 'Bearer', access_token: issued.accessToken, id_token: issued.idToken, refresh_token: options.reuse ? form.get('refresh_token') : issued.refreshToken })
  }
  const oidc = createKeycloak(config, fetcher, () => seconds * 1000)
  const deps = { config, store, oidc, lookup: async () => options.lookupFailure ? Promise.reject(Error('offline db failure')) : options.mappings ?? [mapping], now: () => seconds * 1000, sleep: options.sleep }
  return { options, store, oidc, deps, calls, handlers: createAuthHandlers(deps), sessions: createSessions(deps) }
}
function request(path, method = 'GET', cookie = '', headers = {}) {
  return new Request(`${origin}/api/auth/${path}`, { method, headers: { ...(cookie ? { cookie } : {}), ...(method === 'POST' ? { origin } : {}), ...headers } })
}
function proxiedRequest(path, method = 'GET', cookie = '', headers = {}, base = 'https://localhost:3101') {
  return new Request(`${base}/api/auth/${path}`, { method, headers: {
    host: new URL(origin).host, 'x-forwarded-host': new URL(origin).host, 'x-forwarded-proto': 'https',
    ...(cookie ? { cookie } : {}), ...(method === 'POST' ? { origin } : {}), ...headers,
  } })
}

test('EC2 loopback URL supports the complete proxied auth flow and mutation CSRF', async () => {
  const f = fixture()
  const begin = await f.handlers.login(proxiedRequest('login', 'POST'))
  assert.equal(begin.status, 303)
  const authorize = new URL(begin.headers.get('location'))
  f.options.nonce = authorize.searchParams.get('nonce')
  f.options.challenge = authorize.searchParams.get('code_challenge')
  const flowCookie = begin.headers.get('set-cookie').split(';')[0]
  const callback = await f.handlers.callback(proxiedRequest(`callback?state=${authorize.searchParams.get('state')}&code=offline-code`, 'GET', flowCookie))
  assert.equal(callback.status, 303)
  assert.equal(new URL(callback.headers.get('location')).origin, origin)
  const sessionCookie = callback.headers.getSetCookie().find(value => value.startsWith(SESSION_COOKIE + '=')).split(';')[0]
  const session = await f.handlers.session(proxiedRequest('session', 'GET', sessionCookie))
  assert.equal(session.status, 200)
  const data = await session.json()
  assert.equal(data.authenticated, true)
  assert.equal((await f.sessions.authorize(proxiedRequest('save', 'POST', sessionCookie, { 'x-admin-csrf': data.csrfToken }), true)).actor.profileId, profileId)
  for (const headers of [{ origin: 'https://evil.example' }, { 'x-admin-csrf': 'wrong' }, { 'sec-fetch-site': 'cross-site' }]) {
    await assert.rejects(f.sessions.authorize(proxiedRequest('save', 'POST', sessionCookie, { 'x-admin-csrf': data.csrfToken, ...headers }), true))
  }
  const logout = await f.handlers.logout(proxiedRequest('logout', 'POST', sessionCookie, { 'x-admin-csrf': data.csrfToken }))
  assert.equal(logout.status, 200)
  assert.equal((await f.handlers.session(proxiedRequest('session', 'GET', sessionCookie))).status, 401)
})

test('proxy origin validation rejects spoofed hosts, protocols, chains and non-loopback URLs', () => {
  const { assertRequestOrigin } = security.exports
  for (const base of ['http://127.0.0.1:3101', 'https://localhost:3101', 'http://[::1]:3101']) {
    assert.doesNotThrow(() => assertRequestOrigin(proxiedRequest('session', 'GET', '', {}, base), origin))
  }
  for (const headers of [
    { host: 'evil.example' }, { 'x-forwarded-host': 'evil.example' },
    { 'x-forwarded-host': `${new URL(origin).host}, evil.example` },
    { 'x-forwarded-proto': 'http' }, { 'x-forwarded-proto': 'https,http' },
    { host: 'localhost:3101' }, { 'x-forwarded-host': `${new URL(origin).host}:3101` },
  ]) assert.throws(() => assertRequestOrigin(proxiedRequest('session', 'GET', '', headers), origin))
  for (const base of ['https://evil.example', 'http://10.0.0.1:3101', 'http://manage-uat.houseofdiams.com']) {
    assert.throws(() => assertRequestOrigin(proxiedRequest('session', 'GET', '', {}, base), origin))
  }
  assert.throws(() => assertRequestOrigin(new Request('http://localhost:3101/api/auth/session'), origin))
  assert.throws(() => assertRequestOrigin(request('session', 'GET', '', { 'x-forwarded-host': 'evil.example' }), origin))
})
async function start(f) {
  const response = await f.handlers.login(request('login?returnTo=/dashboard/products', 'POST'))
  assert.equal(response.status, 303)
  const url = new URL(response.headers.get('location'))
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('response_type'), 'code')
  f.options.nonce = url.searchParams.get('nonce')
  f.options.challenge = url.searchParams.get('code_challenge')
  const cookie = response.headers.get('set-cookie').split(';')[0]
  return { cookie, state: url.searchParams.get('state') }
}
async function login(f) {
  const flow = await start(f)
  const callback = request(`callback?state=${flow.state}&code=offline-code`, 'GET', flow.cookie)
  const response = await f.handlers.callback(callback)
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), `${origin}/dashboard/products`)
  const sessionCookie = response.headers.getSetCookie().find(v => v.startsWith(SESSION_COOKIE)).split(';')[0]
  return { sessionCookie, callback }
}

test('explicit config, secure cookies, strict redirects and mutation origin/CSRF', () => {
  for (const name of Object.keys(env)) assert.throws(() => readAuthConfig({ ...env, [name]: undefined }))
  for (const delta of [{ ADMIN_AUTH_ORIGIN: 'http://localhost:3000' }, { ADMIN_OIDC_CLIENT_ID: 'hod-storefront' }, { ADMIN_SESSION_MAX_SECONDS: 'Infinity' }, { ADMIN_OIDC_ROLE_LOCATION: 'guess' }, { ADMIN_AUTH_ORIGIN: `${origin}/` }]) assert.throws(() => readAuthConfig({ ...env, ...delta }))
  for (const path of ['//evil.test', '/dashboard/../login', '/dashboard%2fproducts', '/dashboard?next=evil', '/login', '/dashboard\\evil', '/dashboard\n']) assert.throws(() => safeReturnPath(path))
  assert.equal(safeReturnPath(null), '/dashboard')
  const cookie = secureCookie(SESSION_COOKIE, randomSecret(), 3600)
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(cookie.includes(flag))
  const csrf = randomSecret()
  assert.doesNotThrow(() => assertMutation(request('logout', 'POST', '', { 'x-admin-csrf': csrf }), origin, csrf))
  for (const headers of [{ origin: 'https://evil.test', 'x-admin-csrf': csrf }, { origin, 'x-admin-csrf': 'bad' }, { origin, 'x-admin-csrf': csrf, 'sec-fetch-site': 'cross-site' }]) assert.throws(() => assertMutation(request('logout', 'POST', '', headers), origin, csrf))
})

test('signed ID/access verification rejects issuer/audience/client/expiry/nonce/subject/role/signature', async () => {
  const f = fixture()
  const nonce = randomSecret()
  assert.equal((await f.oidc.validate(await tokens(nonce), nonce)).subject, mapping.subject)
  for (const access of [{ iss: `${config.issuer}-customer` }, { aud: 'hod-storefront' }, { azp: 'hod-storefront' }, { exp: seconds - 1 }, { iat: seconds + 1 }, { typ: 'ID' }, { resource_access: {} }, { resource_access: { 'hod-admin': { roles: ['customer'] } } }, { realm_access: { roles: ['hod-admin'] }, resource_access: {} }]) await assert.rejects(f.oidc.validate(await tokens(nonce, access), nonce))
  await assert.rejects(f.oidc.validate(await tokens(nonce, {}, { nonce: 'wrong' }), nonce))
  await assert.rejects(f.oidc.validate(await tokens(nonce, {}, { sub: 'other-subject' }), nonce))
  await assert.rejects(f.oidc.validate(await tokens(nonce, { nbf: seconds + 30 }), nonce))
  await assert.rejects(f.oidc.validate(await tokens(nonce, {}, { at_hash: 'bad' }), nonce))
  const other = await generateKeyPair('RS256')
  const bad = await tokens(nonce)
  bad.accessToken = await jwt('Bearer', {}, other.privateKey)
  await assert.rejects(f.oidc.validate(bad, nonce))
  bad.accessToken = await jwt('Bearer', {}, pair.privateKey, { kid: 'unknown-key' })
  await assert.rejects(f.oidc.validate(bad, nonce))
  assert.equal(f.calls.filter(v => v.url.endsWith('/certs')).length, 1, 'unknown kid cannot trigger fetch flood during cooldown')
  const realm = createKeycloak({ ...config, roleLocation: 'realm' }, async () => Response.json({ keys: [jwk] }), () => seconds * 1000)
  assert.equal((await realm.validate(await tokens(nonce, { resource_access: {}, realm_access: { roles: ['hod-admin'] } }), nonce)).clientRoles[0], 'hod-admin')
})

test('JWKS fetch/format/ambiguity/redirect/oversize errors fail closed', async () => {
  for (const fetcher of [async () => { throw Error('network') }, async () => Response.json({}, { status: 500 }), async () => Response.json({ keys: [jwk, jwk] }), async () => new Response('x'.repeat(131073), { headers: { 'content-type': 'application/json' } }), async () => new Response('<html>')]) {
    const oidc = createKeycloak(config, fetcher, () => seconds * 1000)
    await assert.rejects(oidc.validate(await tokens('nonce'), 'nonce'))
  }
})

test('full offline code flow, no-store/browser payload, replay and session fixation defense', async () => {
  const f = fixture()
  const { sessionCookie, callback } = await login(f)
  assert.equal((await f.handlers.callback(callback)).status, 401)
  const response = await f.handlers.session(request('session', 'GET', sessionCookie))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.json()
  assert.deepEqual(body.actor, { profileId })
  assert.match(body.csrfToken, /^[A-Za-z0-9_-]{43}$/)
  assert.deepEqual(Object.keys(body).sort(), ['actor', 'authenticated', 'csrfToken'])
  assert.equal((await f.handlers.session(request('session', 'GET', `${sessionCookie}; ${sessionCookie}`))).status, 401)
  assert.equal((await f.handlers.session(request('session', 'GET', `${SESSION_COOKIE}=${randomSecret()}`))).status, 401)
})

test('callback browser/state/nonce/issuer/errors/expiry and concurrent replay', async () => {
  for (const variant of ['no-cookie', 'wrong-cookie', 'wrong-state', 'duplicate-state', 'duplicate-code', 'error', 'issuer', 'expired', 'nonce', 'token-failure']) {
    const f = fixture()
    const flow = await start(f)
    let query = `state=${flow.state}&code=code`
    let cookie = flow.cookie
    if (variant === 'no-cookie') cookie = ''
    if (variant === 'wrong-cookie') cookie = `${FLOW_COOKIE}=${randomSecret()}`
    if (variant === 'wrong-state') query = 'state=wrong&code=code'
    if (variant === 'duplicate-state') query += `&state=${flow.state}`
    if (variant === 'duplicate-code') query += '&code=code2'
    if (variant === 'error') query += '&error=access_denied'
    if (variant === 'issuer') query += '&iss=https://evil.test'
    if (variant === 'expired') seconds += 301
    if (variant === 'nonce') f.options.id = { nonce: 'bad' }
    if (variant === 'token-failure') f.options.tokenFailure = true
    assert.equal((await f.handlers.callback(request(`callback?${query}`, 'GET', cookie))).status, 401, variant)
  }
  const f = fixture(), flow = await start(f)
  const responses = await Promise.all([1, 2].map(() => f.handlers.callback(request(`callback?state=${flow.state}&code=code`, 'GET', flow.cookie))))
  assert.deepEqual(responses.map(v => v.status).sort(), [303, 401])
})

test('unmapped/disabled/revoked/changed/duplicate identity and DB failure denied', async () => {
  for (const mappings of [[], [{ ...mapping, enabled: false }], [{ ...mapping, revokedAt: '2026-10-14' }], [{ ...mapping, profileRole: 'customer' }], [mapping, mapping]]) {
    const f = fixture({ mappings })
    const flow = await start(f)
    assert.equal((await f.handlers.callback(request(`callback?state=${flow.state}&code=code`, 'GET', flow.cookie))).status, 401)
  }
  const f = fixture(), { sessionCookie } = await login(f)
  f.options.mappings = [{ ...mapping, enabled: false }]
  assert.equal((await f.handlers.session(request('session', 'GET', sessionCookie))).status, 401)
  f.options.lookupFailure = true
  assert.equal((await f.handlers.session(request('session', 'GET', sessionCookie))).status, 401)
})

test('refresh rotation, role removal, reuse, upstream error, idle/absolute expiry', async () => {
  const f = fixture(), { sessionCookie } = await login(f)
  seconds += 61
  assert.equal((await f.handlers.session(request('session', 'GET', sessionCookie))).status, 200)
  assert.equal(f.calls.filter(v => v.url.endsWith('/token')).length, 2)
  for (const options of [{ reuse: true }, { tokenFailure: true }, { refreshAccess: { resource_access: {} } }, { refreshId: { sub: 'new-subject' } }]) {
    const x = fixture(), loginResult = await login(x)
    Object.assign(x.options, options)
    seconds += 61
    assert.equal((await x.handlers.session(request('session', 'GET', loginResult.sessionCookie))).status, 401)
    assert.equal(x.store.rows.size, 0)
  }
  for (const elapsed of [601, 3601]) {
    const x = fixture(), loginResult = await login(x)
    seconds += elapsed
    assert.equal((await x.handlers.session(request('session', 'GET', loginResult.sessionCookie))).status, 401)
  }
})

test('a temporary identity-provider outage during refresh keeps the session and releases the claim', async () => {
  const f = fixture(), { sessionCookie } = await login(f)
  Object.assign(f.options, { tokenOutage: true })
  seconds += 61
  const failed = await f.handlers.session(request('session', 'GET', sessionCookie))
  assert.equal(failed.status, 503, 'temporary failure is not a logout')
  assert.equal(f.store.rows.size, 1, 'the session is kept')
  Object.assign(f.options, { tokenOutage: false })
  assert.equal((await f.handlers.session(request('session', 'GET', sessionCookie))).status, 200, 'the next request refreshes normally')
})

test('concurrent refresh consumes rotating token at most once; logout race cannot resurrect', async () => {
  const f = fixture(), { sessionCookie } = await login(f)
  seconds += 61
  const result = await Promise.all([1, 2].map(() => f.handlers.session(request('session', 'GET', sessionCookie))))
  // HOD-022: the request that meets the refresh waits for it instead of being logged out.
  assert.deepEqual(result.map(v => v.status), [200, 200])
  assert.equal(f.calls.filter(v => v.url.endsWith('/token')).length, 2, 'login + exactly one refresh')
  const x = fixture(), loginResult = await login(x)
  let release, entered
  const reached = new Promise(resolve => { entered = resolve })
  const barrier = new Promise(resolve => { release = resolve })
  const oldRefresh = x.oidc.refresh
  x.oidc.refresh = async token => { entered(); await barrier; return oldRefresh(token) }
  const initial = await x.handlers.session(request('session', 'GET', loginResult.sessionCookie))
  const csrf = (await initial.json()).csrfToken
  seconds += 61
  const refreshing = x.handlers.session(request('session', 'GET', loginResult.sessionCookie))
  await reached
  assert.equal((await x.handlers.logout(request('logout', 'POST', loginResult.sessionCookie, { 'x-admin-csrf': csrf }))).status, 200)
  release()
  assert.equal((await refreshing).status, 401)
  assert.equal(x.store.rows.size, 0)
})

test('HOD-022: abandoned refresh claim is taken over; a refresh that never ends gives 503 after waiting', async () => {
  const claim = async (x, cookie, startedAt) => {
    const key = x.sessions.sessionKey(cookie.split('=')[1])
    const current = await x.store.get(key)
    assert.ok(await x.store.replace(key, current.version, { ...current.data, refreshing: true, refreshStartedAt: startedAt }, 600))
    return key
  }
  const a = fixture(), first = await login(a)
  const key = await claim(a, first.sessionCookie, seconds - 31)
  assert.equal((await a.handlers.session(request('session', 'GET', first.sessionCookie))).status, 200)
  assert.equal((await a.store.get(key)).data.refreshing, false)
  let waits = 0
  const b = fixture({ sleep: async () => { waits++ } }), second = await login(b)
  await claim(b, second.sessionCookie, seconds)
  assert.equal((await b.handlers.session(request('session', 'GET', second.sessionCookie))).status, 503)
  assert.equal(waits, 40)
  assert.equal(b.calls.filter(v => v.url.endsWith('/token')).length, 1, 'waiting never uses the rotating token')
})

test('logout CSRF/origin enforced; local deletion survives upstream logout error', async () => {
  const f = fixture({ logoutFailure: true }), { sessionCookie } = await login(f)
  const csrf = (await (await f.handlers.session(request('session', 'GET', sessionCookie))).json()).csrfToken
  assert.equal((await f.handlers.logout(request('logout', 'POST', sessionCookie))).status, 403)
  assert.equal((await f.handlers.logout(request('logout', 'POST', sessionCookie, { origin: 'https://evil.test', 'x-admin-csrf': csrf }))).status, 403)
  const response = await f.handlers.logout(request('logout', 'POST', sessionCookie, { 'x-admin-csrf': csrf }))
  assert.equal(response.status, 502)
  assert.equal((await response.json()).authenticated, false)
  assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'))
  assert.equal((await f.handlers.session(request('session', 'GET', sessionCookie))).status, 401)
})

test('storage rejects unverified/malformed config and cryptographic tampering without network', async () => {
  assert.throws(() => createSessionStore({}))
  const storageEnv = { ADMIN_SESSION_STORAGE_VERIFIED: 'true', UPSTASH_REDIS_REST_URL: 'https://offline.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'offline-only', ADMIN_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), ADMIN_SESSION_NAMESPACE: 'hod-admin:offline' }
  for (const delta of [{ UPSTASH_REDIS_REST_URL: 'http://localhost' }, { ADMIN_SESSION_NAMESPACE: 'customers' }, { ADMIN_SESSION_ENCRYPTION_KEY: 'bad' }]) assert.throws(() => createSessionStore({ ...storageEnv, ...delta }))
  let sealed
  const store = createSessionStore(storageEnv, async (_url, init) => {
    const args = JSON.parse(init.body)
    if (args[0] === 'SET') { sealed = args[2]; return Response.json({ result: 'OK' }) }
    return Response.json({ result: sealed })
  })
  const name = `session:${digest(randomSecret())}`
  await store.create(name, { refreshToken: 'TOP-SECRET' }, 60)
  assert.ok(!sealed.includes('TOP-SECRET'))
  assert.equal((await store.get(name)).data.refreshToken, 'TOP-SECRET')
  await assert.rejects(store.get(`session:${digest(randomSecret())}`), 'AAD binds encrypted data to its key')
  const value = JSON.parse(sealed); value.version = randomSecret(); sealed = JSON.stringify(value)
  await assert.rejects(store.get(name))
})

test('expiry or logout during identity lookup cannot return authorization', async () => {
  for (const variant of ['expiry', 'logout']) {
    const f = fixture(), { sessionCookie } = await login(f)
    f.deps.lookup = async () => {
      if (variant === 'expiry') seconds += 121
      else await f.store.delete(f.sessions.sessionKey(sessionCookie.split('=')[1]))
      return [mapping]
    }
    const handler = createAuthHandlers(f.deps)
    assert.equal((await handler.session(request('session', 'GET', sessionCookie))).status, 401)
  }
})

test('login rejects GET/cross-site/unsafe return path and storage errors without token exchange', async () => {
  const f = fixture()
  assert.equal((await f.handlers.login(request('login'))).status, 405)
  assert.equal((await f.handlers.login(request('login', 'POST', '', { origin: 'https://evil.test' }))).status, 503)
  assert.equal((await f.handlers.login(request('login?returnTo=//evil.test', 'POST'))).status, 503)
  f.store.create = async () => { throw Error('offline storage outage') }
  assert.equal((await f.handlers.login(request('login', 'POST'))).status, 503)
  assert.equal(f.calls.length, 0)
})

test('production REST adapter sends bounded TTL/NX/version CAS and never recreates deleted keys', async () => {
  const storageEnv = { ADMIN_SESSION_STORAGE_VERIFIED: 'true', UPSTASH_REDIS_REST_URL: 'https://offline.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'offline-only', ADMIN_SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), ADMIN_SESSION_NAMESPACE: 'hod-admin:offline' }
  const rows = new Map(), calls = []
  const store = createSessionStore(storageEnv, async (_url, init) => {
    const args = JSON.parse(init.body); calls.push(args)
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store')
    let result = null
    if (args[0] === 'SET') {
      assert.deepEqual(args.slice(3), ['EX', 60, 'NX'])
      if (!rows.has(args[1])) { rows.set(args[1], args[2]); result = 'OK' }
    } else if (args[0] === 'GET') result = rows.get(args[1]) ?? null
    else if (args[0] === 'DEL') { rows.delete(args[1]); result = 1 }
    else {
      assert.equal(args[0], 'EVAL'); assert.equal(args[2], 1)
      assert.ok(args[1].includes("if not v then return false end"))
      assert.ok(args[1].includes('e.version~=ARGV[1]'))
      const raw = rows.get(args[3])
      if (raw && JSON.parse(raw).version === args[4]) {
        if (args.length === 5) { rows.delete(args[3]); result = raw }
        else { assert.equal(args[6], 60); rows.set(args[3], args[5]); result = 1 }
      }
    }
    return Response.json({ result })
  })
  const key = `session:${digest(randomSecret())}`
  assert.equal(await store.create(key, { value: 1 }, 60), true)
  assert.equal(await store.create(key, { value: 9 }, 60), false)
  const record = await store.get(key)
  assert.equal(await store.replace(key, randomSecret(), { value: 2 }, 60), false)
  assert.equal(await store.replace(key, record.version, { value: 2 }, 60), true)
  assert.equal(await store.consume(key, record.version), null)
  const latest = await store.get(key)
  assert.deepEqual(await store.consume(key, latest.version), { value: 2 })
  assert.equal(await store.replace(key, latest.version, { value: 3 }, 60), false)
  assert.equal(await store.get(key), null)
  await assert.rejects(store.create(key, {}, 0))
  assert.ok(calls.every(v => v[0] === 'EVAL' ? v[3].startsWith('hod-admin:offline:') : v[1].startsWith('hod-admin:offline:')))
})

test('JWKS refresh accepts a rotated signing key after bounded cooldown', async () => {
  const originalDateNow = Date.now
  let clock = originalDateNow(), currentKeys = [jwk], count = 0
  Date.now = () => clock
  try {
    const oidc = createKeycloak(config, async () => { count++; return Response.json({ keys: currentKeys }) }, () => seconds * 1000)
    await oidc.validate(await tokens('nonce'), 'nonce')
    const rotated = await generateKeyPair('RS256')
    currentKeys = [{ ...await exportJWK(rotated.publicKey), kid: 'rotated-key', alg: 'RS256', use: 'sig' }]
    clock += 31000
    const set = { idToken: await jwt('ID', { nonce: 'nonce' }, rotated.privateKey, { kid: 'rotated-key' }),
      accessToken: await jwt('Bearer', {}, rotated.privateKey, { kid: 'rotated-key' }), refreshToken: randomSecret() }
    assert.equal((await oidc.validate(set, 'nonce')).subject, mapping.subject)
    assert.equal(count, 2)
  } finally { Date.now = originalDateNow }
})

test('explicit confidential basic authentication and unconfigured runtime endpoints fail closed', async () => {
  const cfgBasic = { ...config, tokenAuthMethod: 'client_secret_basic', clientSecret: 'offline:& +secret' }
  const oidc = createKeycloak(cfgBasic, async (_url, init) => {
    const body = new URLSearchParams(init.body)
    assert.equal(body.has('client_secret'), false)
    const basic = Buffer.from(init.headers.Authorization.slice(6), 'base64').toString()
    assert.equal(basic, 'hod-admin:offline%3A%26+%2Bsecret')
    return Response.json({ error: 'fixture-denial' }, { status: 400 })
  })
  await assert.rejects(oidc.exchange('offline-code', randomSecret()))
  const unavailableLookup = 'data:text/javascript,export const lookupAdminIdentity=async()=>{throw Error("offline")}'
  const runtime = await load('../lib/auth/runtime.ts', { './config': cfg.url, './keycloak': oidcModule.url,
    './session-store': storageModule.url, './handlers': handlerModule.url, '../db/admin-repositories/identity': unavailableLookup,
    './request-security': security.url })
  for (const action of ['login', 'callback', 'logout', 'session']) {
    const response = await runtime.exports.runAuthRoute(action, request(action))
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { error: 'Authentication unavailable' })
  }
})
