import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createOrderFixture,orderMetadata} from './admin-order-test-fixture.mjs'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
import {buildOrderPacket} from './build-admin-order-capability-packet.mjs'
import {inspectOrderCapability} from './admin-order-installation-check.mjs'
const local=sql=>sql.replace("current_database()<>'hod_staging'","current_database()<>'postgres'")
async function fixture(){
 const db=await createOrderFixture({capability:false})
 try{
  const metadata=structuredClone(orderMetadata)
  for(const t of metadata.tables){
   const row=(await db.query(`SELECT ${contentSnapshotSql()} AS snapshot,md5((${contentSnapshotSql()})::text) AS fingerprint
    FROM pg_class c WHERE c.oid=to_regclass($1)`,[t.name])).rows[0]
   Object.assign(t,row)
  }
  await db.exec('SET SESSION AUTHORIZATION hod_dev_migration')
  return {db,metadata,packet:buildOrderPacket(metadata)}
 }catch(error){await db.close();throw error}
}
test('order packet hashes pin one function and owner rollback probe, with no table or role grants',()=>{
 const packet=buildOrderPacket(orderMetadata),saved=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-12-order-scope.json','utf8'))
 for(const [mode,key] of [['forward','sql_sha256'],['inverse','inverse_sha256']]){
  const text=fs.readFileSync(`docs/aws-phase-d/ADMIN-RDS-12-order-${mode}.sql`,'utf8')
  assert.equal(packet[mode],text);assert.equal(createHash('sha256').update(text).digest('hex'),saved[key])
 }
 assert.ok(!/GRANT\s+(?:UPDATE|INSERT|DELETE|ALL)|ALTER\s+(?:ROLE|POLICY|FUNCTION)|CREATE\s+(?:ROLE|TRIGGER)/i.test(packet.forward))
 assert.match(packet.forward,/ROLLBACK TO SAVEPOINT admin_order12_acceptance/)
})
test('real forward runs complete fixture trigger chain, proves rollback absence, preserves graph ACLs and reverses exactly',async()=>{
 const {db,metadata,packet}=await fixture()
 try{
  await db.exec(local(packet.forward))
  assert.equal((await inspectOrderCapability(db,metadata,packet)).ok,true)
  await db.exec('SET ROLE hod_migration')
  const absent=await db.query("SELECT NOT EXISTS(SELECT FROM public.products WHERE sku LIKE 'AWS-PROBE-%') AND NOT EXISTS(SELECT FROM public.orders WHERE order_number LIKE 'AWS-PROBE-%') AS absent")
  assert.equal(absent.rows[0].absent,true)
  await db.exec('RESET ROLE')
  const acl=(await db.query("SELECT has_table_privilege('hod_admin_app','public.orders','UPDATE') AS direct_order,has_column_privilege('hod_admin_app','public.products','stock_quantity','UPDATE') AS direct_stock")).rows[0]
  assert.deepEqual(acl,{direct_order:false,direct_stock:false})
  await assert.rejects(()=>db.exec(local(packet.forward)),/already exists/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec(local(packet.inverse))
  assert.equal((await inspectOrderCapability(db,metadata,packet)).ok,false)
  assert.equal((await db.query("SELECT to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)') IS NULL AS absent")).rows[0].absent,true)
  for(const t of metadata.tables)assert.equal((await db.query(`SELECT md5((${contentSnapshotSql()})::text) AS fingerprint FROM pg_class c WHERE c.oid=to_regclass($1)`,[t.name])).rows[0].fingerprint,t.fingerprint)
 }finally{await db.close()}
})
test('wrong target, dependency drift and new PUBLIC execute rights stop the order packet/inverse atomically',async()=>{
 const {db,packet}=await fixture()
 try{
  await assert.rejects(()=>db.exec(packet.forward),/Use HOD Staging/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec('SET ROLE hod_migration;ALTER TABLE public.orders ADD COLUMN unreviewed text;RESET ROLE')
  await assert.rejects(()=>db.exec(local(packet.forward)),/dependency.*differs/);await db.exec('ROLLBACK;RESET ROLE')
  await db.exec('SET ROLE hod_migration;ALTER TABLE public.orders DROP COLUMN unreviewed;RESET ROLE')
  await db.exec(local(packet.forward))
  await db.exec('SET ROLE hod_migration;GRANT EXECUTE ON FUNCTION public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamptz) TO PUBLIC;RESET ROLE')
  await assert.rejects(()=>db.exec(local(packet.inverse)),/capability.*differ/);await db.exec('ROLLBACK;RESET ROLE')
  assert.equal((await db.query("SELECT to_regprocedure('public.admin_order_status_update_v1(uuid,text,text,uuid,jsonb,timestamp with time zone)') IS NOT NULL AS present")).rows[0].present,true)
 }finally{await db.close()}
})
