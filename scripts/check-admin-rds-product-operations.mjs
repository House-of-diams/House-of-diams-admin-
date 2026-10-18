// --prepare: READ ONLY. --run-operations-rollback: explicitly authorized staging write test.
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
if (!['--prepare','--run-operations-rollback'].includes(mode)) {
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
let writeAccessReady = false
let fixtureId
let fixtureSlug
let verifyFixtureAbsence
let fixtureCreationAttempted = false
const suffix = randomUUID()
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
  const { createProductRepository } = await import(await source('lib/db/admin-repositories/products.ts'))
  const { createInventoryRepository } = await import(await source('lib/db/admin-repositories/inventory.ts'))
  stage = 'configuration'
  const config = readAdminDbConfig(process.env, file => fs.readFileSync(file,'utf8'))
  if (config.pool.database !== 'hod_staging' || config.loginRole !== 'hod_admin_login_uat') throw new Error('Wrong target')
  pool = new Pool(config.pool)
  pool.on('error', () => {})
  const rollbackPool = createRollbackPool(pool, {
    onQueryError(error) { originalError ??= error },
    onRollback() { rolledBack = true },
  })
  verifyFixtureAbsence = async () => {
    const result=await withAdminTransaction(rollbackPool,config.loginRole,db=>db.query(
      'SELECT count(*)::int AS remaining FROM public.products WHERE sku=$1::text OR id=$2::uuid OR slug=$3::text',
      ['AWS-PROBE-'+suffix,fixtureId??null,fixtureSlug??null]),{snapshot:true})
    return result.rows.length===1&&result.rows[0].remaining===0
  }
  const evidence = JSON.parse(fs.readFileSync(path.join(root,'docs/aws-phase-d/ADMIN-RDS-05-human-result.json'),'utf8'))
  const expectedRoutine = evidence.routines.find(r => r.signature === 'public.admin_product_save_v1(uuid,uuid,text,jsonb)')
  const proof = await withAdminTransaction(rollbackPool, config.loginRole, async db => {
    stage = 'identity_lookup'
    const identities = await createAdminIdentityLookup(db)(issuer,subject)
    const identity = identities.length === 1 ? identities[0] : undefined
    if (!identity || identity.profileId !== profileId || identity.enabled !== true
      || identity.revokedAt !== null || identity.profileRole !== 'admin') throw new Error('Identity mismatch')
    stage = 'product_write_permissions'
    const permissions = await db.query(`SELECT
      has_column_privilege('hod_admin_app','public.products','status','UPDATE')
      AND has_column_privilege('hod_admin_app','public.products','updated_at','UPDATE')
      AND has_table_privilege('hod_admin_app','public.products','DELETE') AS product_writes,
      (SELECT bool_and(has_column_privilege('hod_admin_app',to_regclass('public.'||name),'id','UPDATE'))
       FROM unnest(ARRAY['catalog_categories','catalog_subcategories','catalog_options','catalog_gst_slabs','product_metal_variants']) x(name)) AS row_locks`)
    writeAccessReady=permissions.rows[0]?.product_writes===true && permissions.rows[0]?.row_locks===true
    preflightChecks.product_write_permissions_ready=writeAccessReady
    stage = 'product_save_preflight'
    const routine = await db.query(`SELECT p.proowner::regrole::text AS owner,p.prosecdef AS definer,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS hash
      FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.admin_product_save_v1(uuid,uuid,text,jsonb)')`)
    preflightChecks.routine_matches = routine.rows.length===1 && routine.rows[0].owner==='hod_migration'
      && routine.rows[0].definer===true && routine.rows[0].hash===expectedRoutine?.sha256
    if (!preflightChecks.routine_matches) throw new Error('Routine drift')
    const stockRoutine=await db.query(`SELECT p.proowner::regrole::text AS owner,p.prosecdef AS definer,
      encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS hash
      FROM pg_proc p WHERE p.oid=to_regprocedure('public.admin_inventory_set_stock_v1(uuid,uuid,integer,integer,text)')`)
    const expectedStock=evidence.routines.find(r=>r.signature==='public.admin_inventory_set_stock_v1(uuid,uuid,integer,integer,text)')
    preflightChecks.stock_routine_matches=stockRoutine.rows.length===1&&stockRoutine.rows[0].owner==='hod_migration'
      &&stockRoutine.rows[0].definer===true&&stockRoutine.rows[0].hash===expectedStock?.sha256
    if(!preflightChecks.stock_routine_matches)throw new Error('Stock routine drift')
    const ledger=await db.query(`SELECT NOT EXISTS(SELECT FROM pg_trigger
      WHERE tgrelid='public.inventory_adjustments'::regclass AND NOT tgisinternal) AS no_triggers`)
    const ledgerDefaults=await db.query(`SELECT pg_get_expr(d.adbin,d.adrelid) AS expression
      FROM pg_attrdef d WHERE d.adrelid='public.inventory_adjustments'::regclass`)
    preflightChecks.ledger_has_no_unreviewed_triggers=ledger.rows[0]?.no_triggers===true
    preflightChecks.ledger_defaults_safe=ledgerDefaults.rows.every(row=>{
      const expression=row.expression.replaceAll('pg_catalog.','')
      return /^(?:gen_random_uuid\(\)|now\(\)|clock_timestamp\(\)|CURRENT_TIMESTAMP|true|false|-?\d+(?:\.\d+)?)$/.test(expression)
        || /^nextval\('(?:public\.)?inventory_adjustments_id_seq'::regclass\)$/.test(expression)
        || /^'[A-Za-z0-9_-]*'::(?:text|character varying|boolean|integer|bigint|smallint|numeric)$/.test(expression)
    })
    if(!preflightChecks.ledger_has_no_unreviewed_triggers||!preflightChecks.ledger_defaults_safe)
      throw new Error('Inventory history side effects require review')
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
    if (mode==='--prepare') return { write_test_ready:writeAccessReady, writes_executed:false,
      planned_operations:['create isolated draft','update that draft','set stock only on that fixture and undo its savepoint','draft status only on that fixture','delete only that fixture','rollback','verify absence'],
      fixture_has_media:false,existing_products_will_be_edited:false }
    if(!writeAccessReady)throw new Error('Install reviewed ADMIN-RDS-09 permissions first')
    stage = 'product_save_create'
    fixtureCreationAttempted = true
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
    stage = 'fixture_stock'
    const actor={profileId,issuer,subject}
    await db.query('SAVEPOINT fixture_stock_probe')
    const stock=await createInventoryRepository(db).setStock(actor,fixtureId,{expected_stock:0,stock_quantity:1,notes:'Isolated AWS migration rollback probe'})
    if(stock.product_id!==fixtureId||stock.stock_quantity!==1)throw new Error('Fixture stock check failed')
    const stockReadback=await db.query('SELECT stock_quantity FROM public.products WHERE id=$1::uuid',[fixtureId])
    if(stockReadback.rows.length!==1||Number(stockReadback.rows[0].stock_quantity)!==1)throw new Error('Stock readback failed')
    // Undo this fixture's inventory history before testing deletion. Retained
    // audit-history FKs must not be weakened to make a delete probe pass.
    await db.query('ROLLBACK TO SAVEPOINT fixture_stock_probe')
    await db.query('RELEASE SAVEPOINT fixture_stock_probe')
    stage='fixture_draft_status'
    const drafted=await createProductRepository(db).draft(fixtureId,'draft')
    if(drafted.status!=='updated'||drafted.item.id!==fixtureId)throw new Error('Draft check failed')
    const stale=await createProductRepository(db).draft(fixtureId,'active')
    if(stale.status!=='conflict')throw new Error('Stale status check failed')
    stage='fixture_delete'
    const deleted=await db.query('DELETE FROM public.products WHERE id=$1::uuid RETURNING id',[fixtureId])
    if(deleted.rows.length!==1||deleted.rows[0].id!==fixtureId)throw new Error('Fixture delete check failed')
    return {create_verified:true,update_verified:true,readback_verified:true,fixture_stock_verified:true,
      draft_status_verified:true,stale_status_conflict_verified:true,fixture_delete_verified:true,
      existing_products_edited:false,sequence_counters_may_advance:true}
  }, { snapshot:mode==='--prepare' })
  if (!rolledBack) throw new Error('Rollback was not confirmed')
  if (mode==='--run-operations-rollback') {
    stage = 'product_save_cleanup'
    if (!await verifyFixtureAbsence()) throw new Error('Fixture still present')
  }
  process.stdout.write(JSON.stringify({ok:true,database:'hod_staging',...proof,
    rolled_back:true,...(mode==='--run-operations-rollback'?{fixture_absent_after_rollback:true}:{}),
    providers_changed:false,server_started:false})+'\n')
} catch(error) {
  let fixtureAbsent
  if(fixtureCreationAttempted) {
    try{fixtureAbsent=await verifyFixtureAbsence()}catch{fixtureAbsent=false}
  }
  process.stdout.write(JSON.stringify({...connectionFailure(error,{stage,originalError}),preflight_checks:preflightChecks,
    ...(fixtureCreationAttempted?{fixture_absent_after_rollback:fixtureAbsent}:{})})+'\n')
  process.exitCode=1
} finally { if(pool) await pool.end() }
