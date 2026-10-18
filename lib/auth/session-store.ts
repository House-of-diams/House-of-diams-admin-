import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AuthUnavailable } from './config'
import { randomSecret } from './keycloak'
import type { SessionStore, Stored } from './session'

type Envelope = { version: string; sealed: string }
/** Adapter is opt-in only after server configuration, Redis EVAL and namespace are verified.
 * Uses existing REST service; never provisions or starts Redis. Values are AES-256-GCM sealed.
 */
export function createSessionStore(env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch): SessionStore {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  const encodedKey = env.ADMIN_SESSION_ENCRYPTION_KEY
  const namespace = env.ADMIN_SESSION_NAMESPACE
  if (env.ADMIN_SESSION_STORAGE_VERIFIED !== 'true' || !url || !token || !encodedKey
    || !namespace || !/^hod-admin:[a-z0-9-]{1,40}$/.test(namespace)) throw new AuthUnavailable()
  let target: URL
  try { target = new URL(url) } catch { throw new AuthUnavailable() }
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash
    || target.pathname !== '/' || !target.hostname.endsWith('.upstash.io')) throw new AuthUnavailable()
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encodedKey) throw new AuthUnavailable()
  const redisKey = (name: string) => {
    if (!/^(session|flow):[A-Za-z0-9_-]{43}$/.test(name)) throw new Error('Invalid storage key')
    return `${namespace}:${name}`
  }
  function seal<T>(name: string, data: T): Envelope {
    const version = randomSecret()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(`${redisKey(name)}:${version}`))
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
    return { version, sealed: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64') }
  }
  function open<T>(name: string, raw: string): Stored<T> {
    if (raw.length > 180000) throw new Error('Invalid session data')
    const envelope: Envelope = JSON.parse(raw)
    if (!/^[A-Za-z0-9_-]{43}$/.test(envelope.version) || typeof envelope.sealed !== 'string') throw new Error('Invalid session data')
    const bytes = Buffer.from(envelope.sealed, 'base64')
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    cipher.setAAD(Buffer.from(`${redisKey(name)}:${envelope.version}`))
    cipher.setAuthTag(bytes.subarray(12, 28))
    return { version: envelope.version, data: JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8')) }
  }
  async function command(args: (string | number)[]) {
    const response = await fetcher(target, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
    if (!response.ok) throw new AuthUnavailable()
    if (!response.body) throw new AuthUnavailable()
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.length
        if (size > 200000) throw new AuthUnavailable()
        chunks.push(value)
      }
    } finally { await reader.cancel() }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (body.error || !Object.hasOwn(body, 'result')) throw new AuthUnavailable()
    return body.result
  }
  function ttl(seconds: number) {
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86400) throw new Error('Invalid storage TTL')
    return seconds
  }
  const compare = "local v=redis.call('GET',KEYS[1]); if not v then return false end; local e=cjson.decode(v); if e.version~=ARGV[1] then return false end; "
  return {
    async create(name, data, seconds) { return await command(['SET', redisKey(name), JSON.stringify(seal(name, data)), 'EX', ttl(seconds), 'NX']) === 'OK' },
    async get<T>(name: string) {
      const raw = await command(['GET', redisKey(name)])
      return raw === null ? null : open<T>(name, raw)
    },
    async consume<T>(name: string, version: string) {
      const raw = await command(['EVAL', `${compare}redis.call('DEL',KEYS[1]); return v`, 1, redisKey(name), version])
      return raw === null || raw === false ? null : open<T>(name, raw).data
    },
    async replace(name, version, data, seconds) {
      return await command(['EVAL', `${compare}redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1`, 1,
        redisKey(name), version, JSON.stringify(seal(name, data)), ttl(seconds)]) === 1
    },
    async delete(name) { await command(['DEL', redisKey(name)]) },
  }
}
