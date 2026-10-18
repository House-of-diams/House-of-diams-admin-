// --prepare: READ ONLY. --run-rollback: explicitly authorized staging write test.
// Never commits a write transaction, starts services or changes provider settings.
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { Pool } from 'pg'
import { createSourceLoader } from './admin-rds-source-loader.mjs'
import { productWriteFixture } from './admin-rds-product-write-fixture.mjs'
import { createRollbackPool } from './admin-rds-rollback-pool.mjs'
import { connectionFailure } from './admin-rds-connection-diagnostics.mjs'

const root = process.cwd()
const mode = process.argv[2]
if (!['--prepare','--run-rollback'].includes(mode)) {
  process.stdout.write('{"ok":false,"code":"EXPLICIT_TEST_MODE_REQUIRED"}\n')
  process.exit(1)
}
const require = createRequire(import.meta.url)
const nextRequire = createRequire(require.resolve('next/package.json'))
nextRequire('@next/env').loadEnvConfig(root, true, { info() {}, error() {} })
const source = createSourceLoader(root)
let pool
let stage = 'source_loading'
let originalError
let rolledBack = false
const preflightChecks = {}
const issuer = 'https://auth-uat.houseofdiams.com/realms/houseofdiams'
const subject = '1167a5b6-9fcb-45d1-b7d8-53e95cd49704'
const profileId = '133321f4-53bb-4ef1-a9d6-7d0031080b75'
try {
  const { readAdminDbConfig } = await import(await source('lib/db/config.ts'))
  const { withAdminTransaction } = await import(await source('lib/db/query.ts'))
  const { createAdminIdentityLookup } = await import(await source('lib/db/admin-repositories/identity-core.ts'))
  const { productPayloadSchema } = await import(await source('lib/product-payload-validation.ts'))
  const { saveRdsProduct } = await import(await source('lib/db/admin-repositories/product-save.ts'))
  stage = 'configuration'
  const config = readAdminDbConfig(process.env, file => fs.readFileSync(file,'utf8'))
  if (config.pool.database !== 'hod_staging' || config.loginRole !== 'hod_admin_login_uat') throw new Error('Wrong target')
  pool = new Pool(config.pool)
  pool.on('error', () => {})
  const rollbackPool = createRollbackPool(pool, {
    onQueryError(error) { originalError ??= error },
    onRollback() { rolledBack = true },
  })
  const evidence = JSON.parse(fs.readFileSync(path.join(root,'docs/aws-phase-d/ADMIN-RDS-05-human-result.json'),'utf8'))
  const expectedRoutine = evidence.routines.find(r => r.signature === 'public.admin_product_save_v1(uuid,uuid,text,jsonb)')
  const suffix = randomUUID()
  let fixtureId
  let fixtureSlug
  const proof = await withAdminTransaction(rollbackPool, config.loginRole, async db => {
    stage = 'identity_lookup'
    const identities = await createAdminIdentityLookup(db)(issuer,subject)
    const identity = identities.length === 1 ? identities[0] : undefined
    if (!identity || identity.profileId !== profileId || identity.enabled !== true
      || identity.revokedAt !== null || identity.profileRole !== 'admin') throw new Error('Identity mismatch')
    stage = 'product_save_preflight'
    const routine = await db.query(`SELECT p.proowner::regrole::text AS owner,p.prosecdef AS definer,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS hash
      FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.admin_product_save_v1(uuid,uuid,text,jsonb)')`)
    preflightChecks.routine_matches = routine.rows.length===1 && routine.rows[0].owner==='hod_migration'
      && routine.rows[0].definer===true && routine.rows[0].hash===expectedRoutine?.sha256
    if (!preflightChecks.routine_matches) throw new Error('Routine drift')
    const relations = evidence.relations.filter(r => !['profiles','product_duplicate_requests'].includes(r.name))
    const triggers = await db.query(`SELECT c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,
      pg_get_triggerdef(t.oid) AS definition,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS hash
      FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal`,
      [relations.map(r=>r.name)])
    const expectedTriggers = relations.flatMap(r=>r.triggers.map(t=>({ relation:r.name,name:t.name,
      enabled:t.enabled,definition:t.definition,hash:t.sha256 })))
    const canonical = rows => JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())
    preflightChecks.trigger_manifest_matches = canonical(triggers.rows)===canonical(expectedTriggers)
    preflightChecks.row_triggers_only = triggers.rows.every(t=>t.definition.includes('FOR EACH ROW'))
    if (!preflightChecks.trigger_manifest_matches || !preflightChecks.row_triggers_only) throw new Error('Trigger drift or statement side effects require review')
    const idDefault = await db.query(`SELECT pg_get_expr(d.adbin,d.adrelid) AS expression
      FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_attrdef d
        ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid='public.products'::regclass AND a.attname='id'
        AND a.atttypid='uuid'::regtype`)
    preflightChecks.uuid_default_verified = idDefault.rows.length===1
      && /^(?:pg_catalog\.)?gen_random_uuid\(\)$/.test(idDefault.rows[0].expression)
    if (!preflightChecks.uuid_default_verified) throw new Error('Unexpected ID default')
    const category = await db.query("SELECT id FROM public.catalog_categories WHERE status::text='active' AND coalesce(category_lane,'standard')='standard' ORDER BY id LIMIT 1")
    preflightChecks.standard_category_available = category.rows.length===1
    if (!preflightChecks.standard_category_available) throw new Error('No reviewed standard category')
    const payload = productPayloadSchema.parse(productWriteFixture(category.rows[0].id,suffix))
    if (mode==='--prepare') return { write_test_ready:true, writes_executed:false,
      planned_operations:['create isolated draft','update that draft','read back','rollback','verify absence'],
      fixture_has_media:false,existing_products_will_be_edited:false }
    stage = 'product_save_create'
    const created = await saveRdsProduct(db,{profileId,issuer,subject},payload,null)
    const item = created.data?.item
    if (created.error || !item?.id || item.status!=='draft' || item.name!==payload.name) throw new Error('Create verification failed')
    fixtureId = item.id
    fixtureSlug = item.slug
    stage = 'product_save_update'
    const updatedPayload = productPayloadSchema.parse({ ...payload,name:payload.name+' Updated',base_price:2 })
    const updated = await saveRdsProduct(db,{profileId,issuer,subject},updatedPayload,fixtureId)
    if (updated.error || updated.data?.item?.id!==fixtureId) throw new Error('Update failed')
    stage = 'product_save_readback'
    const readback = await db.query('SELECT id,name,base_price,status FROM public.products WHERE id=$1::uuid',[fixtureId])
    if (readback.rows.length!==1 || readback.rows[0].name!==updatedPayload.name
      || Number(readback.rows[0].base_price)!==2 || readback.rows[0].status!=='draft') throw new Error('Readback failed')
    return { create_verified:true,update_verified:true,readback_verified:true }
  }, { snapshot:mode==='--prepare' })
  if (!rolledBack) throw new Error('Rollback was not confirmed')
  if (mode==='--run-rollback') {
    stage = 'product_save_cleanup'
    const absent = await withAdminTransaction(rollbackPool,config.loginRole, async db =>
      db.query('SELECT count(*)::int AS remaining FROM public.products WHERE id=$1::uuid OR slug=$2::text',[fixtureId,fixtureSlug]),{snapshot:true})
    if (absent.rows[0]?.remaining!==0) throw new Error('Fixture still present')
  }
  process.stdout.write(JSON.stringify({ok:true,database:'hod_staging',...proof,
    rolled_back:true,...(mode==='--run-rollback'?{fixture_absent_after_rollback:true}:{}),
    providers_changed:false,server_started:false})+'\n')
} catch(error) {
  process.stdout.write(JSON.stringify({...connectionFailure(error,{stage,originalError}),preflight_checks:preflightChecks})+'\n')
  process.exitCode=1
} finally { if(pool) await pool.end() }
