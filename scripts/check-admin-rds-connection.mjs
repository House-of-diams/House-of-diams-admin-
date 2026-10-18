// Listener-free READ ONLY connection proof. Requires approved admin-only configuration.
// Does not create roles/objects, enroll admins or activate providers.
// --products explicitly reads products/reference metadata; only counts/flags leave stdout.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { createSourceLoader } from './admin-rds-source-loader.mjs'
import { assessConnectionProof, connectionFailure } from './admin-rds-connection-diagnostics.mjs'

const root = process.cwd()
if (!fs.existsSync(path.join(root, 'lib/db/config.ts'))) throw new Error('Run from the admin directory.')
const require = createRequire(import.meta.url)
const nextRequire = createRequire(require.resolve('next/package.json'))
const { loadEnvConfig } = nextRequire('@next/env')
loadEnvConfig(root, true, { info() {}, error() {} })
const actualSource = createSourceLoader(root)

let pool
let stage = 'source_loading'
let originalError
let principal
let transport
let proofChecks
let productStage
let businessDataRead = false
const presence = {
  url: Boolean(process.env.ADMIN_DATABASE_URL), login: Boolean(process.env.ADMIN_DB_LOGIN_ROLE),
  ca_file: Boolean(process.env.ADMIN_DB_TLS_CA_FILE), expected_hostname: Boolean(process.env.ADMIN_DB_TLS_EXPECTED_HOST),
}
try {
  const { readAdminDbConfig } = await import(await actualSource('lib/db/config.ts'))
  const { withAdminTransaction } = await import(await actualSource('lib/db/query.ts'))
  const checkProducts = process.argv.includes('--products')
  const checkSummaries = process.argv.includes('--summaries')
  const checkIdentity = process.argv.includes('--identity') || checkProducts || checkSummaries
  const { createAdminIdentityLookup } = checkIdentity
    ? await import(await actualSource('lib/db/admin-repositories/identity-core.ts')) : {}
  const { loadRdsProductList, loadRdsProductSummaries } = checkProducts || checkSummaries
    ? await import(await actualSource('lib/db/admin-repositories/product-list.ts')) : {}
  const { loadRdsProductEditor } = checkProducts
    ? await import(await actualSource('lib/db/admin-repositories/product-editor.ts')) : {}
  const { loadRdsProductBootstrap } = checkProducts
    ? await import(await actualSource('lib/db/admin-repositories/product-bootstrap.ts')) : {}
  stage = 'configuration'
  const config = readAdminDbConfig(process.env, p => fs.readFileSync(p, 'utf8'))
  if (config.pool.database !== 'hod_staging') throw new Error('Wrong target')
  pool = new Pool(config.pool)
  pool.on('error', () => {})
  // Preserve the safe underlying code before the application's error mapper
  // converts it to AdminDbError.sqlState (and removes non-SQL transport codes).
  const diagnosticPool = {
    async connect() {
      stage = 'connecting'
      let client
      try { client = await pool.connect() }
      catch (error) { originalError = error; throw error }
      const socket = client.connection?.stream
      transport = {
        encrypted: socket?.encrypted === true,
        authorized: socket?.authorized === true,
        authorizationError: Boolean(socket?.authorizationError),
        strict: config.pool.ssl?.rejectUnauthorized === true
          && config.pool.ssl?.servername === process.env.ADMIN_DB_TLS_EXPECTED_HOST
          && typeof config.pool.ssl?.checkServerIdentity === 'function',
      }
      return {
        async query(text, values) {
          if (text !== 'ROLLBACK') {
            stage = text.startsWith('BEGIN') ? 'begin_read_only'
              : text.includes('AS capability_exists') ? 'role_policy'
              : text.startsWith('SET LOCAL ROLE') ? 'set_admin_role'
              : text.includes('public.admin_identity_lookup_v1(') ? 'identity_lookup'
              : text === 'COMMIT' ? 'commit_read_only' : productStage ?? 'read_connection_metadata'
          }
          try {
            const result = await client.query(text, values)
            if (stage === 'role_policy' && text !== 'ROLLBACK') principal = result.rows[0]
            return result
          } catch (error) { originalError ??= error; throw error }
        },
        release(discard) { client.release(discard) },
      }
    },
  }
  const proof = await withAdminTransaction(diagnosticPool, config.loginRole, async db => {
    const result = await db.query(`SELECT current_database() AS database,
      session_user::text AS login_role,current_user::text AS capability,
      current_setting('transaction_read_only') AS read_only,
      (SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls`)
    stage = 'proof_validation'
    const row = result.rows[0]
    const assessment = assessConnectionProof(result.rows, config.loginRole, transport)
    proofChecks = assessment.checks
    if (!assessment.ok) throw new Error('Connection proof failed')
    let identityProof = {}
    if (checkIdentity) {
      const issuer = 'https://auth-uat.houseofdiams.com/realms/houseofdiams'
      const subject = '1167a5b6-9fcb-45d1-b7d8-53e95cd49704'
      const profileId = '133321f4-53bb-4ef1-a9d6-7d0031080b75'
      const identities = await createAdminIdentityLookup(db)(issuer, subject)
      stage = 'identity_lookup'
      const identity = identities.length === 1 ? identities[0] : undefined
      if (!identity || identity.issuer !== issuer || identity.subject !== subject
        || identity.profileId !== profileId || identity.enabled !== true
        || identity.revokedAt !== null || identity.profileRole !== 'admin') {
        throw new Error('Identity lookup proof failed')
      }
      identityProof = { identity_lookup_verified: true, identity_data_read: true,
        profile_id: profileId, keycloak_user_id: subject }
    }
    let productProof = {}
    if (checkProducts) {
      productStage = stage = 'product_list'
      const list = await loadRdsProductList(db, undefined, 1, '')
      if (!Number.isSafeInteger(list.total) || list.total < 0
        || !Array.isArray(list.items) || (list.total > 0 && !list.items.length)) {
        throw new Error('Invalid product list proof')
      }
      productStage = stage = 'product_editor'
      const first = list.items[0]
      const editor = first ? await loadRdsProductEditor(db, first.id) : null
      if (first && (!editor || editor.id !== first.id)) throw new Error('Invalid editor proof')
      productStage = stage = 'product_bootstrap'
      const references = await loadRdsProductBootstrap(db, 'all')
      const referenceCounts = {}
      for (const [key, values] of Object.entries(references)) {
        if (!Array.isArray(values)) throw new Error('Invalid reference proof')
        referenceCounts[key] = values.length
      }
      businessDataRead = true
      productProof = { product_list_verified: true, product_total: list.total,
        product_editor_verified: Boolean(editor),
        ...(first ? {} : { product_editor_skipped: 'no_products_available' }),
        product_bootstrap_verified: true, reference_counts: referenceCounts }
    }
    if (checkSummaries) {
      productStage = stage = 'product_summaries'
      const summaries = await loadRdsProductSummaries(db)
      if (!Array.isArray(summaries) || summaries.some(item => !item || typeof item.id !== 'string'
        || !Array.isArray(item.certificates) || !Array.isArray(item.metals))) {
        throw new Error('Invalid product summaries proof')
      }
      businessDataRead = true
      productProof = { ...productProof, product_summaries_verified: true,
        product_summary_count: summaries.length }
    }
    return { ...row, tls: true, tls_stats: row.tls, tls_certificate_verified: true,
      ...identityProof, ...productProof }
  }, { snapshot: true })
  process.stdout.write(JSON.stringify({ ok: true, ...proof, business_data_read: businessDataRead }) + '\n')
} catch (error) {
  process.stdout.write(JSON.stringify(connectionFailure(error, { stage, originalError, principal, presence, proofChecks })) + '\n')
  process.exitCode = 1
} finally {
  if (pool) await pool.end()
}
