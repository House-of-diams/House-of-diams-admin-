import { checkServerIdentity } from 'node:tls'
import { isIP } from 'node:net'
import { X509Certificate } from 'node:crypto'
import type { PoolConfig } from 'pg'

export type AdminDbConfig = { pool: PoolConfig; loginRole: string }
const identifier = /^[a-z][a-z0-9_]{0,62}$/
export function readAdminDbConfig(env: NodeJS.ProcessEnv, readCa: (path: string) => string): AdminDbConfig {
  try {
    const url = new URL(env.ADMIN_DATABASE_URL ?? '')
    const loginRole = env.ADMIN_DB_LOGIN_ROLE ?? ''
    const username = decodeURIComponent(url.username)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)
      || !url.password || url.search || url.hash || !identifier.test(loginRole) || username !== loginRole
      || (loginRole !== 'hod_admin_app' && !loginRole.startsWith('hod_admin_login_'))) throw new Error()
    const transportHost = url.hostname.replace(/^\[|\]$/g, '')
    const host = transportHost === 'localhost' ? '127.0.0.1' : transportHost
    if (isIP(host) && host !== '127.0.0.1' && host !== '::1') throw new Error()
    const expected = env.ADMIN_DB_TLS_EXPECTED_HOST || host
    if (isIP(expected) || expected === 'localhost' || !/^[a-z0-9.-]+$/i.test(expected)
      || (!isIP(host) && host !== 'localhost' && expected !== host)) throw new Error()
    const ca = readCa(env.ADMIN_DB_TLS_CA_FILE ?? '')
    const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
    if (!certificates?.length) throw new Error()
    for (const certificate of certificates) { if (!new X509Certificate(certificate).ca) throw new Error() }
    const port = url.port ? Number(url.port) : 5432
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error()
    return { loginRole, pool: {
      host, port, database: decodeURIComponent(url.pathname.slice(1)), user: loginRole,
      password: decodeURIComponent(url.password), max: 5, idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000, statement_timeout: 10_000, query_timeout: 12_000,
      lock_timeout: 3_000, idle_in_transaction_session_timeout: 15_000,
      application_name: 'hod-admin',
      ssl: { ca, rejectUnauthorized: true, servername: expected,
        checkServerIdentity: (_host, certificate) => checkServerIdentity(expected, certificate) },
    } }
  } catch { throw new Error('Admin database configuration is missing or invalid') }
}
