// Scoped catalog-only inventory. No product rows, owner changes or listeners.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {Pool} from 'pg'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
import {contentSnapshotSql} from './admin-content-permission-snapshot.mjs'
const require=createRequire(import.meta.url)
createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(),true,{info(){},error(){}})
const names=['products','profiles','admin_identities','product_duplicate_requests','product_metal_selections',
 'product_material_value_selections','product_stone_shapes','product_subcategory_links','product_option_links',
 'product_metal_media','product_purity_prices','product_variant_media_items','product_metal_variants','product_faq_items',
 'catalog_categories','catalog_subcategories','catalog_options','product_content_rules','catalog_metals',
 'catalog_material_values','catalog_stone_shapes','catalog_gst_slabs','catalog_ring_categories','catalog_styles'].map(n=>'public.'+n)
let pool
try{
 const load=createSourceLoader(process.cwd())
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {withAdminTransaction}=await import(await load('lib/db/query.ts'))
 const config=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(config.pool.database!=='hod_staging')throw Error('Wrong database')
 pool=new Pool(config.pool);pool.on('error',()=>{})
 const report=await withAdminTransaction(pool,config.loginRole,async db=>{
  await db.query('SET LOCAL search_path=pg_catalog,public,pg_temp')
  const tables=(await db.query(`SELECT name,${contentSnapshotSql()} AS snapshot,md5((${contentSnapshotSql()})::text) AS fingerprint,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'identity',a.attidentity,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
   FROM unnest($1::text[]) x(name) LEFT JOIN pg_class c ON c.oid=to_regclass(name) ORDER BY name`,[names])).rows
  const triggers=(await db.query(`SELECT n.nspname||'.'||c.relname AS relation,t.tgname AS name,
   pg_get_triggerdef(t.oid) AS definition,p.oid::regprocedure::text AS routine,p.proowner::regrole::text AS owner,
   p.prosecdef AS definer,pg_get_functiondef(p.oid) AS function_definition,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal
   AND c.oid=ANY(SELECT to_regclass(name) FROM unnest($1::text[]) x(name)) ORDER BY n.nspname,c.relname,t.tgname`,[names])).rows
  const legacy=(await db.query(`SELECT pg_get_functiondef(p.oid) AS definition,p.proowner::regrole::text AS owner,
   p.prosecdef AS definer,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256,
   has_function_privilege('hod_admin_app',p.oid,'EXECUTE') AS runtime_execute
   FROM pg_proc p WHERE p.oid=to_regprocedure('public.duplicate_product(uuid,uuid,uuid)')`)).rows[0]
  const helper=(await db.query("SELECT to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid)') IS NOT NULL OR to_regprocedure('public.admin_product_duplicate_prepare_v1(uuid,uuid,uuid,text,text)') IS NOT NULL AS present")).rows[0]
  const enums=(await db.query(`SELECT n.nspname||'.'||t.typname AS name,jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
   FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
   WHERE n.nspname='public' GROUP BY n.nspname,t.typname ORDER BY t.typname`)).rows
  return {database:'hod_staging',read_only:true,business_rows_read:false,tables,triggers,legacy,enums,helper_present:helper.present}
 },{snapshot:true})
 if(report.helper_present||!report.legacy||report.legacy.owner!=='hod_migration'||!report.legacy.definer
  ||report.tables.some(t=>t.snapshot.owner!=='hod_migration'||t.snapshot.force||!t.columns))throw Error('Unreviewed prestate')
 if([...report.triggers.map(t=>t.function_definition),report.legacy.definition].some(s=>/https?:\/\/|password|secret|http_post|dblink|foreign server/i.test(s)))throw Error('Unexpected function dependency')
 fs.writeFileSync('docs/aws-phase-d/ADMIN-RDS-13-duplicate-preflight.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({ok:true,read_only:true,tables:report.tables.length,triggers:report.triggers.length,helper_present:false,
  legacy_sha256:report.legacy.sha256,business_rows_read:false}))
}catch(error){console.log(JSON.stringify({ok:false,code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'DUPLICATE_PREFLIGHT_NOT_VERIFIED'}));process.exitCode=1}
finally{if(pool)await pool.end()}
