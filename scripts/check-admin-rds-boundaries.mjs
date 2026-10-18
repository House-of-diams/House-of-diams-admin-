// Phase A only: catalog reads, verified TLS, no business routines or writes.
// Supply an existing reader env file and installed pg manifest; never copy secrets.
import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const folder = path.join(root, 'docs/aws-phase-a')
const args = process.argv.slice(2)
const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined }
let client
let auditStage = 'connect'
try {
  const envFile = option('--env-file')
  const pgManifest = option('--pg-manifest')
  if (!envFile || !pgManifest) throw new Error('Supply --env-file and --pg-manifest for an existing metadata reader.')
  const env = {}
  for (const line of fs.readFileSync(path.resolve(root, envFile), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    env[match[1]] = value
  }
  const databaseUrl = new URL(env.DATABASE_URL)
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
    || !['localhost', '127.0.0.1'].includes(databaseUrl.hostname)
    || databaseUrl.port !== '15432' || databaseUrl.pathname !== '/hod_staging'
    || !['hod_app', 'hod_dev_migration'].includes(decodeURIComponent(databaseUrl.username))) {
    throw new Error('Reader must target the intended staging database through the existing local tunnel.')
  }
  if (!env.DB_CA_CERT_PATH || env.DB_TLS_EXPECTED_HOST !== 'database-1.cqngaqgio3hj.us-east-1.rds.amazonaws.com') {
    throw new Error('Require the configured RDS CA and expected hostname.')
  }
  if ([...databaseUrl.searchParams.keys()].some(name => /^ssl/i.test(name))) {
    throw new Error('URL SSL options must not override the explicitly verified TLS configuration.')
  }
  const caPath = path.isAbsolute(env.DB_CA_CERT_PATH) ? env.DB_CA_CERT_PATH
    : path.resolve(path.dirname(path.resolve(root, envFile)), env.DB_CA_CERT_PATH)
  const { Client } = createRequire(path.resolve(root, pgManifest))('pg')
  client = new Client({
    host: '127.0.0.1', port: 15432, database: 'hod_staging',
    user: decodeURIComponent(databaseUrl.username), password: decodeURIComponent(databaseUrl.password),
    application_name: 'hod-admin-phase-a-readonly', connectionTimeoutMillis: 10000,
    options: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=5000',
    ssl: { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true,
      servername: env.DB_TLS_EXPECTED_HOST,
      checkServerIdentity: (_host, cert) => tls.checkServerIdentity(env.DB_TLS_EXPECTED_HOST, cert) },
  })
  await client.connect()
  const stream = client.connection.stream
  if (!stream.encrypted || !stream.authorized) throw new Error('Verified encrypted TLS is required.')
  const prepared = fs.readFileSync(path.join(folder, 'rds-targeted-boundaries.sql'), 'utf8')
  const statements = prepared.replace(/^\s*--.*$/gm, '').split(';').map(value => value.trim()).filter(Boolean)
  const stageNames = ['begin', 'connection', 'helpers', 'actor_execution', 'triggers', 'defaults', 'identity_relations', 'foreign_keys', 'commit']
  if (statements.length !== stageNames.length) throw new Error('Unexpected targeted SQL structure.')
  const results = []
  for (const [index, statement] of statements.entries()) {
    auditStage = stageNames[index]
    results.push(await client.query(statement))
  }
  const selects = results.filter(result => result.command === 'SELECT')
  const names = ['connection', 'helpers', 'actor_execution', 'triggers', 'defaults', 'identity_relations', 'foreign_keys']
  if (selects.length !== names.length) throw new Error('Unexpected targeted-check result shape.')
  const sections = Object.fromEntries(names.map((name, index) => [name, selects[index].rows]))
  if (sections.connection[0]?.database !== 'hod_staging') throw new Error('Unexpected database identity.')
  await client.query('BEGIN READ ONLY')
  try {
    auditStage = 'session_evidence'
    sections.session = (await client.query("SELECT current_database() AS database, current_user AS reader, current_setting('transaction_read_only') AS transaction_read_only, current_setting('default_transaction_read_only') AS default_transaction_read_only")).rows
    sections.tls = (await client.query('SELECT ssl, version, cipher, bits FROM pg_stat_ssl WHERE pid = pg_backend_pid()')).rows
    sections.roles = (await client.query("SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname IN ('hod_app','hod_admin_app','hod_dev_migration','hod_migration') ORDER BY rolname")).rows
    const original = JSON.parse(fs.readFileSync(path.join(folder, 'rds-admin-security-metadata.json'), 'utf8').replace(/^\uFEFF/, ''))
    auditStage = 'routine_freshness'
    sections.reviewed_routines = (await client.query(`SELECT p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS arguments, pg_get_function_result(p.oid) AS returns,
      pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer, p.proconfig AS settings,
      COALESCE(p.proacl,acldefault('f',p.proowner))::text AS acl, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f' AND p.proname=ANY($1::text[]) ORDER BY p.proname,arguments`,
      [original.functions.map(routine => routine.name)])).rows
    const triggerNames = [...new Set(sections.triggers.map(row => row.routine))]
    auditStage = 'trigger_definitions'
    sections.trigger_routines = (await client.query(`SELECT p.oid::regprocedure::text AS routine,
      pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,p.proconfig AS settings,
      COALESCE(p.proacl,acldefault('f',p.proowner))::text AS acl,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p WHERE p.prokind='f' AND p.oid IN (SELECT to_regprocedure(value) FROM unnest($1::text[]) AS value)
      ORDER BY routine`, [triggerNames])).rows
    auditStage = 'sequence_dependencies'
    sections.sequences = (await client.query(`SELECT tbl.relname AS relation,a.attname AS column_name,
      seq.relname AS sequence_name,dep.deptype AS dependency_type,
      pg_get_userbyid(seq.relowner) AS owner,
      COALESCE(seq.relacl,acldefault('s',seq.relowner))::text AS acl
      FROM pg_class seq JOIN pg_namespace ns ON ns.oid=seq.relnamespace
      JOIN pg_depend dep ON dep.objid=seq.oid AND dep.classid='pg_class'::regclass
        AND dep.refclassid='pg_class'::regclass AND dep.deptype IN ('a','i')
      JOIN pg_class tbl ON tbl.oid=dep.refobjid
      JOIN pg_attribute a ON a.attrelid=tbl.oid AND a.attnum=dep.refobjsubid
      WHERE ns.nspname='public' AND seq.relkind='S' ORDER BY relation,column_name`)).rows
    const boundaries = JSON.parse(fs.readFileSync(path.join(folder, 'database-boundary-review.json'), 'utf8'))
    const originalDefinitions = JSON.parse(fs.readFileSync(path.join(folder, 'rds-admin-definition-metadata.json'), 'utf8'))
    const knownRelations = new Set(originalDefinitions.tables.map(row => row.name))
    const relevantNames = new Set(['profiles', 'orders', 'order_items', 'order_love_letters', 'order_status_history', 'inventory_reservations'])
    for (const routine of [...sections.reviewed_routines, ...sections.trigger_routines]) {
      for (const match of routine.definition.matchAll(/\bpublic\.([a-z_][a-z_0-9]*)/gi)) {
        if (knownRelations.has(match[1])) relevantNames.add(match[1])
      }
    }
    for (const routine of boundaries.routines) for (const name of routine.reviewed_dynamic_tables) relevantNames.add(name)
    auditStage = 'relevant_relation_security'
    sections.relevant_relations = (await client.query(`SELECT c.relname AS name,c.relkind AS kind,
      pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
      COALESCE(c.relacl,acldefault('r',c.relowner))::text AS acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND c.relname=ANY($1::text[]) ORDER BY name`,
      [[...relevantNames]])).rows
    sections.relevant_policies = (await client.query('SELECT schemaname,tablename,policyname,permissive,roles::text[] AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=$1 AND tablename=ANY($2::text[]) ORDER BY tablename,policyname',
      ['public', [...relevantNames]])).rows
    auditStage = 'reader_schema_access'
    sections.schema_access = (await client.query("SELECT nspname,has_schema_privilege(current_user,oid,'USAGE') AS reader_has_usage FROM pg_namespace WHERE nspname IN ('public','auth') ORDER BY nspname")).rows
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error }
  const evidence = { checked_at: new Date().toISOString(), scope: 'catalog metadata only; no business routine execution or data mutation',
    verified_tls: { encrypted: true, authorized: true, expected_hostname_verified: true }, ...sections }
  const date = evidence.checked_at.slice(0, 10)
  const output = path.join(folder, `rds-targeted-live-${date}.json`)
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ output: path.relative(root, output), database: sections.connection[0].database,
    reader: sections.connection[0].reader, tls_verified: true, readonly: sections.session[0],
    counts: Object.fromEntries(Object.entries(sections).map(([name, rows]) => [name, rows.length])) }, null, 2))
} catch (error) {
  // Avoid logging connection strings, environment values or driver error details.
  console.error(JSON.stringify({ status: 'failed', audit_stage: auditStage, code: error.code ?? 'AUDIT_CHECK_FAILED', name: error.name,
    hint: 'Check the existing tunnel/reader/TLS configuration. No credentials or grants were changed.' }))
  process.exitCode = 1
} finally {
  if (client) await client.end()
}
