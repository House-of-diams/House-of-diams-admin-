// Configuration-only preflight. No connection, server, writes or secret output.
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {createSourceLoader} from './admin-rds-source-loader.mjs'
const mode=process.argv[2]
if(!['--local-shape','--hosted-shape'].includes(mode)){console.log('{"ok":false,"code":"EXPLICIT_MODE_REQUIRED"}');process.exit(1)}
const require=createRequire(import.meta.url)
// @next/env belongs to Next, not to this package's direct pnpm dependencies.
const nextRequire=createRequire(require.resolve('next/package.json'))
nextRequire('@next/env').loadEnvConfig(process.cwd(),mode==='--local-shape',{info(){},error(){}})
try{
 const load=createSourceLoader(process.cwd())
 const {readAdminAuthProvider}=await import(await load('lib/auth/integration.ts'))
 const {readAuthConfig}=await import(await load('lib/auth/config.ts'))
 const {readAdminDbConfig}=await import(await load('lib/db/config.ts'))
 const {createSessionStore}=await import(await load('lib/auth/session-store.ts'))
 const {imageTarget,readImageProvider}=await import(await load('lib/image-provider.ts'))
 const {videoSources,readVideoProvider}=await import(await load('lib/video-provider.ts'))
 for(const [file,reader] of [['product-provider','readProductDataProvider'],['catalog-provider','readCatalogDataProvider'],['cms-provider','readCmsDataProvider'],['operations-provider','readOperationsProvider']]){
  const providers=await import(await load(`lib/${file}.ts`))
  if(providers[reader](process.env)!=='rds')throw Error()
 }
 if(readAdminAuthProvider()!=='keycloak')throw Error()
 if(readImageProvider()!=='aws'||readVideoProvider()!=='aws')throw Error()
 const auth=readAuthConfig(),db=readAdminDbConfig(process.env,p=>fs.readFileSync(p,'utf8'))
 if(auth.origin!=='https://manage-uat.houseofdiams.com'||db.pool.database!=='hod_staging'||db.loginRole!=='hod_admin_login_uat')throw Error()
 createSessionStore();imageTarget('product');imageTarget('content');videoSources()
 if(mode==='--hosted-shape'&&['localhost','127.0.0.1','::1'].includes(String(db.pool.host)))throw Error()
 console.log(JSON.stringify({ok:true,mode,auth:'keycloak',data:'rds',media:'aws',origin:auth.origin,
  shape_only:true,connection_tested:false,browser_login_tested:false,server_started:false}))
}catch{console.log(JSON.stringify({ok:false,mode,code:'UAT_CONFIGURATION_NOT_READY',next:'Check the approved provider manifest and injected private runtime settings; never deploy a localhost database URL.',server_started:false}));process.exitCode=1}
