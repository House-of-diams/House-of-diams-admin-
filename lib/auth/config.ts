import 'server-only'
import { deploymentProfile } from '../deployment-profile'

export type AuthConfig = Readonly<{
  issuer: string; clientId: string; clientSecret: string; origin: string
  tokenAuthMethod: 'client_secret_post' | 'client_secret_basic'
  roleLocation: 'realm' | 'client'; requiredClientRole: string
  sessionMaxSeconds: number; sessionIdleSeconds: number; revalidateSeconds: number
}>

export class AuthUnavailable extends Error {
  constructor() { super('Admin authentication unavailable') }
}

/** Explicit policy values are required; realm capabilities are not client policy evidence. */
export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const issuer = env.ADMIN_OIDC_ISSUER
  const clientId = env.ADMIN_OIDC_CLIENT_ID
  const clientSecret = env.ADMIN_OIDC_CLIENT_SECRET
  const origin = env.ADMIN_AUTH_ORIGIN
  const roleLocation = env.ADMIN_OIDC_ROLE_LOCATION
  const tokenAuthMethod = env.ADMIN_OIDC_TOKEN_AUTH_METHOD
  if (env.ADMIN_AUTH_POLICY_VERIFIED !== 'true'
    || issuer !== deploymentProfile(env.NEXT_PUBLIC_HOD_DEPLOYMENT).oidcIssuer
    || clientId !== 'hod-admin' || !clientSecret || !origin
    || (roleLocation !== 'realm' && roleLocation !== 'client')
    || (tokenAuthMethod !== 'client_secret_post' && tokenAuthMethod !== 'client_secret_basic')
    || env.ADMIN_OIDC_REQUIRED_ROLE !== 'hod-admin') throw new AuthUnavailable()
  let url: URL
  try { url = new URL(origin) } catch { throw new AuthUnavailable() }
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new AuthUnavailable()
  function seconds(name: string, maximum: number) {
    const raw = env[name]
    const value = Number(raw)
    if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > maximum) throw new AuthUnavailable()
    return value
  }
  // Admins stay signed in for up to 7 days; the configured value may be shorter.
  const sessionMaxSeconds = seconds('ADMIN_SESSION_MAX_SECONDS', 604800)
  const sessionIdleSeconds = seconds('ADMIN_SESSION_IDLE_SECONDS', sessionMaxSeconds)
  const revalidateSeconds = seconds('ADMIN_SESSION_REVALIDATE_SECONDS', Math.min(300, sessionIdleSeconds))
  return Object.freeze({ issuer, clientId, clientSecret, origin, roleLocation, tokenAuthMethod,
    requiredClientRole: 'hod-admin', sessionMaxSeconds, sessionIdleSeconds, revalidateSeconds })
}
