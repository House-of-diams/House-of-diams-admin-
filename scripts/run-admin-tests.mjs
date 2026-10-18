// Reproducible offline suites. PGlite is in-process WASM; no DB service/listener.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const renderSuites=new Set(['test-admin-integration.mjs','test-admin-d1a.mjs',
  'test-admin-d1b.mjs','test-admin-d1c.mjs','test-admin-d1e.mjs'])
const files=fs.readdirSync(path.join(root,'scripts')).filter(name=>
  (/^test.*\.mjs$/.test(name)||name.endsWith('.test.mjs'))
  // Historical copy has exactly the same cases; its fixture is now in the original.
  && name!=='test-admin-d1e-prior-products.mjs').sort()
const env={...process.env,PGLITE_MODULE:fileURLToPath(import.meta.resolve('@electric-sql/pglite'))}
const guard=new URL('./offline-network-guard.mjs',import.meta.url).href
for(const render of [false,true]) {
  const selected=files.filter(name=>renderSuites.has(name)===render).map(name=>path.join(root,'scripts',name))
  process.stdout.write(`\nOffline ${render?'render/integration':'core/SQL'} group: ${selected.length} files\n`)
  const result=spawnSync(process.execPath,['--import',guard,
    ...(render?[]:['--conditions=react-server']),'--experimental-strip-types','--test',
    '--test-concurrency=1',...selected],{cwd:root,env,stdio:'inherit',windowsHide:true})
  if(result.status!==0) process.exit(result.status??1)
}
