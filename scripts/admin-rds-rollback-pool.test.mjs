import assert from 'node:assert/strict'
import test from 'node:test'
import { createRollbackPool } from './admin-rds-rollback-pool.mjs'
import { createSourceLoader } from './admin-rds-source-loader.mjs'
import { productWriteFixture } from './admin-rds-product-write-fixture.mjs'

const source = createSourceLoader(process.cwd())
const { withAdminTransaction } = await import(await source('lib/db/query.ts'))
function fixture({ rollbackFails = false, trustedTls = true } = {}) {
  const calls = []
  const releases = []
  const principal = { login_role:'hod_admin_login_uat',active_role:'hod_admin_login_uat',
    capability_exists:true,safe_login:true,isolated_login:true,safe_capability:true,isolated_capability:true }
  const pool = { async connect() { return {
    connection:{ stream:{ encrypted:true,authorized:trustedTls } },
    async query(sql,values) {
      calls.push({sql,values})
      if(sql==='ROLLBACK' && rollbackFails) throw new Error('rollback failed')
      return {rows:sql.includes('AS capability_exists')?[principal]:[]}
    },
    release(discard) { releases.push(discard) },
  } } }
  return {pool,calls,releases}
}
test('actual transaction success rolls back instead of committing', async () => {
  const f=fixture()
  let rolledBack=false
  const value=await withAdminTransaction(createRollbackPool(f.pool,{onRollback(){rolledBack=true}}),
    'hod_admin_login_uat',async db=>{await db.query('SELECT 1');return 42})
  assert.equal(value,42)
  assert.equal(rolledBack,true)
  assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'))
  assert.ok(f.calls.every(c=>c.sql!=='COMMIT'))
  assert.deepEqual(f.releases,[false])
})
test('query failure rolls back and rollback failure discards the client', async () => {
  for(const rollbackFails of [false,true]) {
    const f=fixture({rollbackFails})
    await assert.rejects(withAdminTransaction(createRollbackPool(f.pool),'hod_admin_login_uat',async()=>{throw new Error('stop')}))
    assert.ok(f.calls.some(c=>c.sql==='ROLLBACK'))
    assert.ok(f.calls.every(c=>c.sql!=='COMMIT'))
    assert.deepEqual(f.releases,[rollbackFails])
  }
})
test('failed success-path rollback cannot report success', async()=>{
  const f=fixture({rollbackFails:true})
  let success=false
  await assert.rejects(withAdminTransaction(createRollbackPool(f.pool,{onRollback(){success=true}}),
    'hod_admin_login_uat',async()=>42))
  assert.equal(success,false)
  assert.deepEqual(f.releases,[true])
})
test('unverified TLS is discarded before any SQL',async()=>{
  const f=fixture({trustedTls:false})
  await assert.rejects(createRollbackPool(f.pool).connect())
  assert.deepEqual(f.calls,[])
  assert.deepEqual(f.releases,[true])
})
test('fixture passes actual strict payload validation and has no media',async()=>{
  const {productPayloadSchema}=await import(await source('lib/product-payload-validation.ts'))
  const payload=productPayloadSchema.parse(productWriteFixture('12345678-1234-4234-9234-123456789abc','offline'))
  assert.equal(payload.status,'draft')
  assert.equal(payload.allow_checkout,false)
  assert.equal(payload.video_path,null)
  assert.deepEqual(payload.metal_variants,[])
  assert.deepEqual(payload.purity_prices,[])
  assert.ok(!('id' in payload))
})
