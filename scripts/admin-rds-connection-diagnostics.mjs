// Only fixed codes/stages and boolean role flags may leave this boundary.
// Never serialize error messages, stacks, DSNs, passwords, certificate text or ENV.
const codes = new Set(['28P01', '28000', '42501', '3D000', '42704', '42703', '42P01', '42883', '42804', '42601',
  '23502', '23503', '23505', '23514', '22023', '22P02', '40001', '40P01',
  '53300', '57014', '0A000', '08P01', '08001', '08006', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_MODULE_NOT_FOUND'])
const stages = new Set(['source_loading', 'configuration', 'connecting', 'begin_read_only',
  'role_policy', 'set_admin_role', 'read_connection_metadata', 'proof_validation', 'identity_lookup',
  'product_list', 'product_editor', 'product_bootstrap', 'product_summaries', 'commit_read_only',
  'product_save_preflight','product_save_create','product_save_update','product_save_readback','product_save_cleanup',
  'product_write_permissions','fixture_stock','fixture_draft_status','fixture_delete'])
// pg_stat_ssl fields can be hidden after SET ROLE. Verify the actual pg TLS
// socket instead; a visible server report of plaintext still fails closed.
export function assessConnectionProof(rows, loginRole, transport) {
  const row = rows?.length === 1 ? rows[0] : undefined
  const checks = {
    single_row: rows?.length === 1,
    database: row?.database === 'hod_staging',
    login: row?.login_role === loginRole,
    capability: row?.capability === 'hod_admin_app',
    read_only: row?.read_only === 'on',
    tls_encrypted: transport?.encrypted === true,
    tls_certificate_verified: transport?.authorized === true && !transport?.authorizationError,
    tls_policy_strict: transport?.strict === true,
    server_tls_not_contradictory: row?.tls === true || row?.tls === null,
  }
  return { ok: Object.values(checks).every(value => value === true), checks }
}
export function connectionFailure(error, context) {
  const candidates = [context.originalError, error]
    .flatMap(value => [value?.code, value?.sqlState, value?.cause?.code,
      ...(Array.isArray(value?.errors) ? value.errors.slice(0, 4).map(item => item?.code) : [])])
  const code = candidates.find(value => typeof value === 'string' && codes.has(value)) ?? 'ADMIN_CONNECTION_NOT_VERIFIED'
  const stage = stages.has(context.stage) ? context.stage : 'source_loading'
  let next = 'Return this diagnostic result; no environment changes were saved.'
  if (['28P01', '28000'].includes(code)) next = 'The database rejected authentication. Check the password saved for hod_admin_login_uat; do not send it to chat.'
  else if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '08001', '08006'].includes(code)) next = 'Check the existing approved database route. No tunnel or service has been started.'
  else if (code.includes('CERT') || code.includes('SIGNATURE')) next = 'TLS verification failed. Keep certificate and hostname verification enabled.'
  else if (stage === 'role_policy' || stage === 'set_admin_role') next = 'Authentication reached the database; inspect the isolated role flags/membership without granting broad permissions.'
  else if (stage === 'configuration') next = 'Local database configuration was rejected before connecting.'
  else if (stage === 'identity_lookup') next = 'The runtime identity lookup failed or did not match the enrolled admin. Return this result; do not broaden database permissions.'
  else if (stage === 'product_write_permissions' || stage.startsWith('fixture_')) next = 'Product write diagnostic stopped. Verify fixture rollback cleanup before retrying; provider settings are unchanged.'
  else if (stage.startsWith('product_save_')) next = 'Product save diagnostic stopped. Its transaction requests rollback, never commit. Inspect cleanup before further tests; provider settings are unchanged.'
  else if (stage.startsWith('product_')) next = 'A real product read failed. Return this stage/code; no writes or provider changes were made.'
  const result = { ok: false, stage, code, next }
  if (context.principal) {
    result.role_checks = Object.fromEntries(['capability_exists', 'safe_login', 'isolated_login',
      'safe_capability', 'isolated_capability'].map(key => [key, context.principal[key] === true]))
  }
  if (context.presence) result.configuration_present = Object.fromEntries(
    ['url', 'login', 'ca_file', 'expected_hostname'].map(key => [key, context.presence[key] === true]))
  if (context.proofChecks) result.proof_checks = Object.fromEntries(
    ['single_row', 'database', 'login', 'capability', 'read_only', 'tls_encrypted',
      'tls_certificate_verified', 'tls_policy_strict', 'server_tls_not_contradictory']
      .map(key => [key, context.proofChecks[key] === true]))
  return result
}
