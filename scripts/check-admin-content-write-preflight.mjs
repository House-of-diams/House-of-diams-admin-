// Read-only source/catalog reconciliation for the next content permission delta.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {contentSnapshotSql,contentSequenceAclSql,contentSchemaAclSql} from './admin-content-permission-snapshot.mjs'
import {contentWriteRequirements} from './admin-content-write-requirements.mjs'
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const manifest=contentWriteRequirements(JSON.parse(fs.readFileSync('docs/aws-phase-d/D1e-minimum-grant-manifest.json','utf8')))
const names=manifest.relations.filter(r=>r.insert.length||r.update.length||r.delete||r.relation==='public.profiles').map(r=>r.relation).sort()
let pool
try {
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging')throw new Error('Wrong database')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const report=await withAdminTransaction(pool,config.loginRole,async db=>{
  const tables=await db.query(`SELECT name,${contentSnapshotSql()} AS snapshot,
   md5((${contentSnapshotSql()})::text) AS fingerprint,
   md5((${contentSnapshotSql({preservedOnly:true})})::text) AS preserved_fingerprint,
   has_table_privilege('hod_admin_app',c.oid,'SELECT') AS select_all,
   (SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid
    AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('hod_admin_app',c.oid,a.attnum,'SELECT')) AS select_columns,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'identity',a.attidentity,
    'sequence',pg_get_serial_sequence(name,a.attname),'usage',
    CASE WHEN pg_get_serial_sequence(name,a.attname) IS NOT NULL THEN has_sequence_privilege('hod_admin_app',pg_get_serial_sequence(name,a.attname),'USAGE') END)),'[]'::jsonb)
    FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND pg_get_serial_sequence(name,a.attname) IS NOT NULL) AS sequences,
   has_table_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS writes,
   has_any_column_privilege('hod_admin_app',c.oid,'INSERT,UPDATE,REFERENCES') AS column_writes
   FROM unnest($1::text[]) x(name) LEFT JOIN pg_class c ON c.oid=to_regclass(name) ORDER BY name`,[names])
  const signatures=manifest.routines.map(r=>'public.'+r.name+'('+r.arguments.replace(/\bp_[a-z0-9_]+\s+/g,'')+')')
  const routines=await db.query(`SELECT signature,p.prosecdef AS definer,p.proowner::regrole::text AS owner,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256,
   has_function_privilege('hod_admin_app',p.oid,'EXECUTE') AS executable
   FROM unnest($1::text[]) x(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature) ORDER BY signature`,[signatures])
  const sequences=await db.query(`SELECT 'public.blog_post_products_id_seq' AS name,
   c.relowner::regrole::text AS owner,${contentSequenceAclSql} AS acl_hash,
   has_sequence_privilege('hod_admin_app',c.oid,'USAGE,SELECT,UPDATE') AS accessible
   FROM pg_class c WHERE c.oid=to_regclass('public.blog_post_products_id_seq') AND c.relkind='S'`)
  const triggers=await db.query(`SELECT c.oid::regclass::text AS relation,t.tgname AS name,
   p.proowner::regrole::text AS owner,p.prosecdef AS definer,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
   WHERE NOT t.tgisinternal AND c.oid=ANY(SELECT to_regclass(n) FROM unnest($1::text[]) x(n)) ORDER BY c.relname,t.tgname`,[names])
  const authSchema=(await db.query(`SELECT n.nspowner::regrole::text AS owner,
   has_schema_privilege('hod_admin_app',n.oid,'USAGE') AS usage,
   has_schema_privilege('hod_admin_app',n.oid,'CREATE') AS create,
   ${contentSchemaAclSql()} AS acl_hash,${contentSchemaAclSql(true)} AS preserved_hash
   FROM pg_namespace n WHERE n.nspname='auth'`)).rows[0]
  const authHelpers=(await db.query(`SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS signature,p.proowner::regrole::text AS owner,
   p.prosecdef AS definer,has_function_privilege('hod_admin_app',p.oid,'EXECUTE') AS executable,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='auth' OR (n.nspname='public' AND p.proname='is_admin') ORDER BY n.nspname,p.proname`)).rows
  return {database:'hod_staging',read_only:true,tables:tables.rows,routines:routines.rows,sequences:sequences.rows,triggers:triggers.rows,
   auth_schema:authSchema,auth_helpers:authHelpers,
   providers_changed:false,server_started:false,business_rows_read:false}
 },{snapshot:true})
 for(const r of report.routines){
  const source=manifest.routines.find(s=>r.signature.startsWith('public.'+s.name+'('))
  if(r.sha256!==source.sha256||r.definer!==!source.invoker||!r.executable)throw new Error('Routine drift')
 }
 for(const t of report.triggers){
  let reviewed=manifest.triggerDependencies.find(d=>d.relation.replace(/^public\./,'')===t.relation.replace(/^public\./,'')&&d.trigger===t.name)
  if(!reviewed){
   const body=manifest.relations.find(r=>r.relation.replace(/^public\./,'')===t.relation.replace(/^public\./,''))?.triggers.find(x=>x.tgname===t.name)?.body
   if(body)reviewed={owner:body.owner,definer:body.security_definer,sha256:createHash('sha256').update(body.definition).digest('hex')}
  }
  if(!reviewed||reviewed.owner!==t.owner||reviewed.definer!==t.definer||reviewed.sha256!==t.sha256)throw new Error('Trigger dependency drift')
 }
 for(const helper of report.auth_helpers){
  const source=manifest.helpers.find(h=>helper.signature===h.nspname+'.'+h.proname+'()')
  if(source&&createHash('sha256').update(source.definition).digest('hex')!==helper.sha256)throw new Error('Legacy policy helper drift')
 }
 if(report.tables.some(t=>t.writes||t.column_writes||t.snapshot.owner!=='hod_migration'||t.snapshot.kind!=='r'||t.snapshot.force
  ||t.snapshot.policies.some(p=>!p.permissive||p.name.startsWith('hod_admin_content10_'))))throw new Error('Table prestate differs')
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-10-content-write-preflight.json',JSON.stringify(report,null,2)+'\n')
 process.stdout.write(JSON.stringify({ok:true,read_only:true,tables:report.tables.length,routines:report.routines.length,
  serial_sequences:report.tables.flatMap(t=>t.sequences.filter(s=>!s.identity)).map(s=>s.sequence),business_rows_read:false})+'\n')
}catch(error){process.stdout.write(JSON.stringify({ok:false,stage:'content_catalog_preflight',
 code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'CONTENT_PREFLIGHT_NOT_VERIFIED'})+'\n');process.exitCode=1}
finally{if(pool)await pool.end()}
