import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose'
import type { JWTPayload } from 'jose'
import type { AuthConfig } from './config'
import type { VerifiedAdminSession } from './admin-identity-core'
import { equalSecret } from './request-security'

export const randomSecret = () => randomBytes(32).toString('base64url')
export const digest = (value: string) => createHash('sha256').update(value).digest('base64url')
export type FetchAdapter = typeof fetch
export type TokenSet = { accessToken: string; idToken: string; refreshToken: string }

/** No discovered or JWT-provided URLs: fixed issuer endpoints, bounded response sizes, no redirects. */
export function createKeycloak(config: AuthConfig, fetcher: FetchAdapter = fetch, now = () => Date.now()) {
  const endpoint = (name: string) => `${config.issuer}/protocol/openid-connect/${name}`
  function clientAuthentication(parameters: Record<string, string>) {
    const body = new URLSearchParams(parameters)
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
    if (config.tokenAuthMethod === 'client_secret_post') {
      body.set('client_id', config.clientId)
      body.set('client_secret', config.clientSecret)
    } else {
      const encode = (value: string) => new URLSearchParams({ v: value }).toString().slice(2)
      headers.Authorization = `Basic ${Buffer.from(`${encode(config.clientId)}:${encode(config.clientSecret)}`).toString('base64')}`
    }
    return { body, headers }
  }
  async function boundedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (![endpoint('certs'), endpoint('token'), endpoint('logout')].includes(url)) throw new Error('Invalid OIDC endpoint')
    const response = await fetcher(input, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!response.ok || (response.url && response.url !== url)) throw new Error('OIDC request failed')
    if (!response.headers.get('content-type')?.includes('application/json') && url !== endpoint('logout')) throw new Error('Invalid OIDC response')
    if (url === endpoint('logout')) return response
    if (!response.body) throw new Error('Empty OIDC response')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > 131072) throw new Error('OIDC response too large')
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers })
  }
  const keys = createRemoteJWKSet(new URL(endpoint('certs')), {
    cooldownDuration: 30000, cacheMaxAge: 300000, timeoutDuration: 5000,
    [customFetch]: boundedFetch,
  })
  async function verify(token: string, kind: 'ID' | 'Bearer'): Promise<JWTPayload> {
    if (token.length > 32768) throw new Error('Invalid token')
    const { payload, protectedHeader } = await jwtVerify(token, keys, {
      issuer: config.issuer, audience: config.clientId, algorithms: ['RS256'], clockTolerance: 0,
      requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat'], currentDate: new Date(now()),
    })
    const seconds = Math.floor(now() / 1000)
    if (!protectedHeader.kid || payload.typ !== kind || typeof payload.sub !== 'string' || !payload.sub
      || payload.sub.length > 512 || payload.azp !== config.clientId
      || typeof payload.iat !== 'number' || payload.iat > seconds
      || typeof payload.exp !== 'number' || payload.exp <= seconds || payload.exp <= payload.iat) throw new Error('Invalid token claims')
    return payload
  }
  async function validate(tokens: TokenSet, nonce?: string, expectedSubject?: string) {
    const [id, access] = await Promise.all([verify(tokens.idToken, 'ID'), verify(tokens.accessToken, 'Bearer')])
    if (id.sub !== access.sub || (expectedSubject && access.sub !== expectedSubject)
      || (nonce !== undefined && (typeof id.nonce !== 'string' || !equalSecret(id.nonce, nonce)))) throw new Error('Invalid OIDC binding')
    if (id.at_hash !== undefined) {
      const hash = createHash('sha256').update(tokens.accessToken).digest().subarray(0, 16).toString('base64url')
      if (typeof id.at_hash !== 'string' || !equalSecret(id.at_hash, hash)) throw new Error('Invalid access token binding')
    }
    const container = config.roleLocation === 'realm' ? access.realm_access
      : (access.resource_access as Record<string, unknown> | undefined)?.[config.clientId]
    const roles = (container as { roles?: unknown } | undefined)?.roles
    if (!Array.isArray(roles) || !roles.every(r => typeof r === 'string') || !roles.includes(config.requiredClientRole)) throw new Error('Admin role missing')
    const session: VerifiedAdminSession = {
      issuer: config.issuer, subject: access.sub!, clientId: config.clientId,
      audiences: typeof access.aud === 'string' ? [access.aud] : access.aud!, clientRoles: roles,
      expiresAt: Math.min(id.exp!, access.exp!),
    }
    return session
  }
  async function tokenRequest(parameters: Record<string, string>): Promise<TokenSet> {
    const response = await boundedFetch(endpoint('token'), { method: 'POST', ...clientAuthentication(parameters) })
    const value = await response.json()
    if (value.token_type?.toLowerCase() !== 'bearer' || typeof value.access_token !== 'string'
      || typeof value.id_token !== 'string' || typeof value.refresh_token !== 'string'
      || !value.refresh_token || value.refresh_token.length > 32768) throw new Error('Invalid token response')
    return { accessToken: value.access_token, idToken: value.id_token, refreshToken: value.refresh_token }
  }
  return {
    validate,
    authorizationUrl(state: string, nonce: string, verifier: string) {
      const url = new URL(endpoint('auth'))
      url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/auth/callback`,
        response_type: 'code', scope: 'openid', state, nonce, code_challenge: digest(verifier), code_challenge_method: 'S256' }).toString()
      return url.href
    },
    exchange: (code: string, verifier: string) => tokenRequest({ grant_type: 'authorization_code', code,
      code_verifier: verifier, redirect_uri: `${config.origin}/api/auth/callback` }),
    refresh: (refreshToken: string) => tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    async logout(refreshToken: string) {
      await boundedFetch(endpoint('logout'), { method: 'POST', ...clientAuthentication({ refresh_token: refreshToken }) })
    },
  }
}
export type KeycloakAdapter = ReturnType<typeof createKeycloak>
