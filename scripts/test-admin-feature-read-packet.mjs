import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {PGlite} from '@electric-sql/pglite'

const source=fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-08-feature-read-forward.sql','utf8')
const manifest=JSON.parse(fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-08-feature-read-scope.json','utf8'))
const inverse=fs.readFileSync('docs/aws-phase-d/ADMIN-RDS-08-feature-read-inverse.sql','utf8')
const qi=s=>'"'+s.replaceAll('"','""')+'"'
// PGlite connects to postgres. Only the expected database-name literal changes;
// role, RLS, ACL, column scope, installer checks and all DDL remain the real SQL.
const fixtureSql=source.replace("current_database()<>'hod_staging'","current_database()<>'postgres'")
async function fixture(){
 const db=new PGlite()
 await db.exec(`CREATE ROLE hod_migration LOGIN NOINHERIT;
 CREATE ROLE hod_dev_migration LOGIN NOINHERIT;
 CREATE ROLE hod_admin_app NOLOGIN NOINHERIT;
 CREATE ROLE hod_app NOLOGIN;
 CREATE ROLE audit_reader NOLOGIN;
 GRANT hod_migration TO hod_dev_migration WITH INHERIT FALSE, SET TRUE;
 GRANT USAGE ON SCHEMA public TO hod_migration,hod_dev_migration,hod_admin_app,hod_app,audit_reader;
 GRANT CREATE ON SCHEMA public TO hod_migration,hod_dev_migration;`)
 for(const r of manifest.scope){
  const columns=[...new Set([...r.columns,'read_fixture_marker'])]
  await db.exec(`CREATE TABLE ${r.name} (${columns.map(c=>qi(c)+' text').join(',')});
   INSERT INTO ${r.name}(read_fixture_marker) VALUES ('private-fixture');
   GRANT SELECT ON ${r.name} TO hod_app;
   GRANT SELECT(read_fixture_marker) ON ${r.name} TO audit_reader;
   ${r.rls?`ALTER TABLE ${r.name} ENABLE ROW LEVEL SECURITY;
   CREATE POLICY retained_storefront_policy ON ${r.name} FOR SELECT TO hod_app USING(false);`:''}
   ALTER TABLE ${r.name} OWNER TO ${qi(r.owner)};`)
 }
 await db.exec('SET SESSION AUTHORIZATION hod_dev_migration')
 return db
}
async function denied(db,sql,pattern){
 await assert.rejects(()=>db.exec(sql),pattern)
 await db.exec('ROLLBACK; RESET ROLE;')
}
test('read packet hash and private/previously-installed scope remain exact',()=>{
 assert.equal(createHash('sha256').update(source).digest('hex'),manifest.sql_sha256)
 assert.equal(createHash('sha256').update(inverse).digest('hex'),manifest.inverse_sha256)
 assert.equal(manifest.scope.length,75)
 assert.ok(manifest.scope.every(r=>!['public.profiles','public.admin_identities','public.cms_save_receipts','public.products'].includes(r.name)))
 assert.ok(!/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|ALL)\b/i.test(source))
})
test('real packet DDL grants only reviewed reads and preserves storefront/column ACLs; replay denied',async()=>{
 const db=await fixture()
 try{
  await db.exec(fixtureSql)
  await db.exec('SET SESSION AUTHORIZATION postgres')
  for(const r of manifest.scope){
   const result=await db.query(`SELECT has_table_privilege('hod_app',$1,'SELECT') AS retained,
    has_column_privilege('audit_reader',$1,'read_fixture_marker','SELECT') AS retained_column,
    has_table_privilege('hod_admin_app',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS writes`,[r.name])
   assert.deepEqual(result.rows[0],{retained:true,retained_column:true,writes:false})
   await db.exec('SET ROLE hod_admin_app')
   const field=r.all?'*':qi(r.columns[0])
   assert.equal((await db.query(`SELECT ${field} FROM ${r.name}`)).rows.length,1)
   await db.exec('RESET ROLE')
  }
  const limited=manifest.scope.find(r=>!r.all&&r.rls)
  await db.exec('SET ROLE hod_admin_app')
  await assert.rejects(()=>db.query(`SELECT read_fixture_marker FROM ${limited.name}`),{code:'42501'})
  await assert.rejects(()=>db.query(`INSERT INTO ${limited.name} DEFAULT VALUES`),{code:'42501'})
  await db.exec('RESET ROLE;SET ROLE hod_app')
  assert.equal((await db.query(`SELECT * FROM ${limited.name}`)).rows.length,0)
  await db.exec('RESET ROLE')
  await db.exec('SET SESSION AUTHORIZATION hod_dev_migration')
  await denied(db,fixtureSql,/Existing permission\/policy differs/)
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname='hod_admin_feature_read_v1'`)).rows[0].n,
    manifest.scope.filter(r=>r.rls).length)
  await db.exec(inverse.replace("current_database()<>'hod_staging'","current_database()<>'postgres'"))
  for(const r of manifest.scope){
   const result=await db.query(`SELECT has_any_column_privilege('hod_admin_app',$1,'SELECT') AS admin,
    has_table_privilege('hod_app',$1,'SELECT') AS storefront,
    has_column_privilege('audit_reader',$1,'read_fixture_marker','SELECT') AS audit`,[r.name])
   assert.deepEqual(result.rows[0],{admin:false,storefront:true,audit:true})
  }
 }finally{await db.close()}
})
test('wrong database, write rights, restrictive policy, missing column and owner drift fail atomically',async()=>{
 const db=await fixture()
 try{
  await denied(db,source,/Use HOD Staging/)
  const r=manifest.scope[0]
  await db.exec(`SET ROLE ${qi(r.owner)};GRANT UPDATE(read_fixture_marker) ON ${r.name} TO hod_admin_app;RESET ROLE;`)
  await denied(db,fixtureSql,/Existing permission\/policy differs/)
  await db.exec(`SET ROLE ${qi(r.owner)};REVOKE UPDATE(read_fixture_marker) ON ${r.name} FROM hod_admin_app;
   CREATE POLICY incompatible_read_policy ON ${r.name} AS RESTRICTIVE FOR SELECT TO hod_admin_app USING(false);RESET ROLE;`)
  await denied(db,fixtureSql,/Existing permission\/policy differs/)
  await db.exec(`SET ROLE ${qi(r.owner)};DROP POLICY incompatible_read_policy ON ${r.name};RESET ROLE;`)
  const limited=manifest.scope.find(s=>!s.all)
  await db.exec(`SET ROLE ${qi(limited.owner)};ALTER TABLE ${limited.name} DROP COLUMN ${qi(limited.columns[0])};RESET ROLE;`)
  await denied(db,fixtureSql,/column .* does not exist/)
  await db.exec(`SET ROLE ${qi(limited.owner)};ALTER TABLE ${limited.name} ADD COLUMN ${qi(limited.columns[0])} text;RESET ROLE;`)
  await db.exec(`SET SESSION AUTHORIZATION postgres;ALTER TABLE ${r.name} OWNER TO postgres;SET SESSION AUTHORIZATION hod_dev_migration;`)
  await denied(db,fixtureSql,/Table\/owner\/RLS differs/)
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname='hod_admin_feature_read_v1'`)).rows[0].n,0)
 }finally{await db.close()}
})
