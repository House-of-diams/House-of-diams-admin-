// OID-independent manifest, portable across the fixture and target PostgreSQL.
// PG18's standalone NOT NULL constraint rows are represented by column flags.
export const mediaCatalogSql=`jsonb_build_object(
 'schema',(SELECT jsonb_build_object('owner',n.nspowner::regrole::text,'acl',
  (SELECT jsonb_agg(jsonb_build_object('grantor',a.grantor::regrole::text,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type)
   FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a)) FROM pg_namespace n WHERE n.nspname='admin_media'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'owner',c.relowner::regrole::text,'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,
   'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),
   'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',x.grantor::regrole::text,'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END,
    'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY x.grantee::regrole::text,x.privilege_type) FROM aclexplode(a.attacl) x)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',a.grantor::regrole::text,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY k.conname)
   FROM pg_constraint k WHERE k.conrelid=c.oid AND k.contype<>'n'),
  'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
  'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',(SELECT jsonb_agg(r::regrole::text ORDER BY r::regrole::text) FROM unnest(p.polroles) r),
   'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) ORDER BY c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='admin_media' AND c.relkind NOT IN('i','I')),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
  'return',pg_get_function_result(p.oid),'language',l.lanname,'owner',p.proowner::regrole::text,'definer',p.prosecdef,
  'config',p.proconfig,'set',p.proretset,'strict',p.proisstrict,'leakproof',p.proleakproof,'kind',p.prokind,'volatile',p.provolatile,
  'parallel',p.proparallel,'defaults',p.pronargdefaults,'body',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
  'acl',(SELECT jsonb_agg(jsonb_build_object('grantor',a.grantor::regrole::text,'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.proname)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname='admin_media'))`

export async function inspectMediaCatalog(db,expected){
 const manifest=(await db.query(`SELECT ${mediaCatalogSql} AS manifest`)).rows[0]?.manifest
 if(!manifest?.schema)return {ok:false,schema_present:false,catalog_matches:false,policy_rows:0,policy_disabled:false}
 const equal=(await db.query('SELECT $1::jsonb=$2::jsonb AS equal',[JSON.stringify(manifest),JSON.stringify(expected)])).rows[0]?.equal===true
 const state=(await db.query(`SELECT count(*)::int AS rows,bool_and(NOT enabled) AS disabled FROM admin_media.policy`)).rows[0]
 return {ok:equal,schema_present:manifest?.schema!==null,catalog_matches:equal,policy_rows:state.rows,policy_disabled:state.rows===1&&state.disabled===true}
}
