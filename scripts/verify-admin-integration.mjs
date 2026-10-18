// C3 preservation/contracts evidence only; no app, network, services or SQL execution.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
const hash = x => createHash('sha256').update(x).digest('hex').toUpperCase()
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const normal = file => file.replaceAll('\\', '/')
const owned = [
  'lib/auth/integration.ts', 'lib/auth/admin-session.ts', 'lib/auth/account.ts', 'lib/admin-auth-client.ts',
  'lib/admin-server.ts', 'lib/cms-auth.ts', 'lib/admin-supabase.ts', 'lib/server-supabase.ts',
  'lib/product-provider.ts', 'lib/catalog-provider.ts', 'lib/cms-provider.ts', 'lib/operations-provider.ts', 'lib/image-provider.ts', 'lib/video-provider.ts',
  'app/api/auth/provider/route.ts', 'app/api/auth/account/route.ts', 'app/api/settings/password/route.ts',
  'app/login/page.tsx', 'app/login/legacy-login.tsx', 'app/login/keycloak-login.tsx',
  'components/admin-gate.tsx', 'components/topbar.tsx', 'app/dashboard/page.tsx', 'app/dashboard/layout.tsx',
  'app/dashboard/settings/page.tsx', 'app/dashboard/settings/settings-client.tsx',
  'scripts/test-admin-integration.mjs', 'scripts/verify-admin-integration.mjs',
]
const baseline = json('docs/aws-phase-c/C3-baseline.json').map(x => ({ ...x, path: normal(x.path) }))
const before = new Map(baseline.map(x => [x.path, x.sha256]))
const changed = baseline.filter(x => !fs.existsSync(x.path) || hash(fs.readFileSync(x.path)) !== x.sha256).map(x => x.path)
for (const f of changed) if (!owned.includes(f)) throw Error('Unowned baseline changed: ' + f)
const sources = execFileSync('rg', ['--files', 'app', 'components', 'lib', 'scripts'], { encoding: 'utf8' }).trim().split(/\r?\n/).map(normal)
for (const f of sources) if (!before.has(f) && !owned.includes(f)) throw Error('Unowned addition: ' + f)
for (const f of owned) if (fs.readFileSync(f, 'utf8').split(/\r?\n/).some(line => /[ \t]+$/.test(line))) throw Error('Trailing whitespace: ' + f)
const originals = json('docs/aws-phase-c/C3-original-owned-sources.json')
const originalProof = originals.map(({ path: f, content }) => {
  if (hash(content) !== before.get(f)) throw Error('Original text hash mismatch: ' + f)
  return { path: f, sha256: before.get(f), valid: true }
})
const previous = []
for (const file of ['docs/aws-phase-b/B5-source-hashes.csv', 'docs/aws-phase-b/B6-source-hashes.csv', 'docs/aws-phase-c/C1-source-hashes.csv', 'docs/aws-phase-c/C2-source-hashes.csv']) {
  const records = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map(line => line.split(',').map(x => x.replace(/^"|"$/g, '')))
  previous.push({ manifest: file, records: records.length, changesSinceC3Baseline: records.filter(([f]) => hash(fs.readFileSync(f)) !== before.get(f)).map(([f]) => f) })
}
const exports = owned.filter(f => /\.tsx?$/.test(f)).map(file => {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  return { file, declarations: sf.statements.filter(s => s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(s => s.name?.getText(sf) ?? (ts.isVariableStatement(s) ? s.declarationList.declarations.map(d => d.name.getText(sf)).join(',') : s.getText(sf).split('\n')[0])) }
})
const imports = sources.filter(f => /\.tsx?$/.test(f)).map(file => {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  return { file, imports: sf.statements.filter(ts.isImportDeclaration).map(s => s.moduleSpecifier.text) }
})
const delta = []
for (const f of owned) {
  const initial = originals.find(x => x.path === f)?.content ?? ''
  const current = fs.readFileSync(f, 'utf8')
  if (initial === current) continue
  // Review evidence contains exact before/after text, not an automatically applied rollback.
  delta.push({ path: f, before: initial, after: current })
}
const report = { baselineFiles: baseline.length, changed, added: owned.filter(f => !before.has(f)), unchangedOutsideC3: baseline.length - changed.length, originalProof, previous, dependenciesUnchanged: ['package.json', 'pnpm-lock.yaml'].every(f => hash(fs.readFileSync(f)) === before.get(f)), ownedSources: owned.length }
fs.writeFileSync('docs/aws-phase-c/C3-preservation.json', JSON.stringify(report, null, 2) + '\n')
fs.writeFileSync('docs/aws-phase-c/C3-exports.json', JSON.stringify(exports, null, 2) + '\n')
fs.writeFileSync('docs/aws-phase-c/C3-imports.json', JSON.stringify(imports, null, 2) + '\n')
fs.writeFileSync('docs/aws-phase-c/C3-local-delta.json', JSON.stringify(delta, null, 2) + '\n')
fs.writeFileSync('docs/aws-phase-c/C3-source-hashes.csv', 'path,sha256\n' + owned.map(f => f + ',' + hash(fs.readFileSync(f))).join('\n') + '\n')
fs.writeFileSync('docs/aws-phase-c/C3-offline-script-list.txt', fs.readFileSync('docs/aws-phase-c/C2-offline-script-list.txt', 'utf8').trim() + '\n\n# Prior 28 scripts: node --conditions=react-server --experimental-strip-types --test <above paths>\n# C3 UI/SSR tests need normal React renderer, separately:\nnode --experimental-strip-types --test scripts/test-admin-integration.mjs\n')
console.log(JSON.stringify({ ...report, originalProof: originalProof.length }))
