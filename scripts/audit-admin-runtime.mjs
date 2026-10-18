// Source-only reconciliation. Never loads env values or contacts providers.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'docs/aws-phase-a')
const legacy = /supabase|@supabase|postgrest|PGRST|\/rest\/v1|\/auth\/v1|\/storage\/v1|cloudflare|\bR2\b/i
const records = []
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(folder, entry.name)
    return entry.isDirectory() ? walk(target) : /\.tsx?$/.test(entry.name) ? [target] : []
  })
}
for (const file of ['app', 'components', 'lib'].flatMap(folder => walk(path.join(root, folder))).sort()) {
  const source = fs.readFileSync(file, 'utf8')
  const rel = path.relative(root, file).replaceAll('\\', '/')
  const ast = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true)
  const evidence = []
  const imports = []
  const mark = (node, kind, value) => evidence.push({ line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, kind, value })
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text
      imports.push(specifier)
      if (/supabase|\/r2$/.test(specifier)) mark(node, 'provider-import', specifier)
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const receiver = node.expression.expression.getText(ast)
      // Array.from and Buffer.from are not database accesses.
      if (['from', 'rpc', 'channel', 'removeChannel'].includes(method) && !['Array', 'Buffer', 'Uint8Array'].includes(receiver)) {
        mark(node, 'transport-call', `${receiver}.${method}(${node.arguments[0]?.getText(ast) ?? ''})`)
      }
      if (/\.(?:auth|storage)(?:\.|$)/.test(receiver)) mark(node, 'auth-or-storage-call', node.expression.getText(ast))
    }
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(ast) === 'process.env' && /SUPABASE|CLOUDFLARE/.test(node.name.text)) {
      mark(node, 'provider-env', node.name.text)
    }
    if (ts.isStringLiteral(node) && /PGRST\d+|\/rest\/v1|\/auth\/v1|\/storage\/v1/.test(node.text)) mark(node, 'transport-contract', node.text)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const candidate = legacy.test(source)
  let classification = evidence.length ? 'required-source-edit' : 'no-direct-edit-evidence'
  let reason = evidence.length ? [...new Set(evidence.map(row => row.kind))].join('; ') : ''
  // Explicitly reviewed exceptions; keep historical URL consumers until Phase C parity.
  if (rel === 'app/dashboard/customers/customers-client.tsx') {
    classification = 'conditional-consumer-edit'
    reason = 'Provider label and confirmed/pending semantics; change only with agreed customer read model.'
  } else if (rel === 'components/catalog-image-preview.tsx') {
    classification = 'phase-c-compatibility-edit'
    reason = 'Relative paths resolve to legacy storage; preserve preview rollback until CDN parity.'
  } else if (!evidence.length && candidate) {
    classification = 'mention-review'
    reason = 'No parsed provider operation; inspect mention before counting as an edit.'
  }
  const feature = /\/(products|collection-products|inventory)\//.test(rel) || /lib\/product-|lib\/inventory-|bulk-price|product-form/.test(rel) ? 'B3-products-inventory'
    : /catalog|navbar/.test(rel) ? 'B4-catalog-navbar'
    : /uploads|media|\/r2\.ts|upload|image-preview/.test(rel) ? 'C-media'
    : /cms|bespoke|blog|education|couples/.test(rel) && !/cms-auth/.test(rel) ? 'B5-cms-bespoke'
    : /auth|admin-server|supabase|\/login\/|admin-gate/.test(rel) ? 'B1-identity-session'
    : 'B6-operations-read-model'
  records.push({ path: rel, candidate, classification, feature, reason, imports, evidence,
    sha256: crypto.createHash('sha256').update(source).digest('hex') })
}
// Record indirect consumers separately: a changed provider-free loader/command contract
// can require edits, but an import alone is not proof of a required source change.
const byPath = new Map(records.map(row => [row.path.replace(/\.tsx?$/, ''), row]))
for (const row of records) {
  row.migration_consumers = row.imports.flatMap(specifier => {
    const target = specifier.startsWith('@/') ? specifier.slice(2)
      : specifier.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(row.path), specifier)) : ''
    const dependency = byPath.get(target)
    return dependency && dependency.classification !== 'no-direct-edit-evidence' ? [dependency.path] : []
  })
  if (row.classification === 'no-direct-edit-evidence' && row.migration_consumers.length) {
    row.classification = 'consumer-contract-review'
    row.reason = 'Imports migration dependency; retain source if replacement preserves its contract.'
  }
}
const csv = values => values.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')
fs.writeFileSync(path.join(out, 'runtime-reconciliation.csv'), [csv(['path', 'legacy_candidate', 'classification', 'slice', 'reason', 'dependency_consumers', 'line_evidence', 'sha256']),
  ...records.filter(row => row.candidate || row.evidence.length || row.migration_consumers.length).map(row => csv([row.path, row.candidate, row.classification, row.feature, row.reason,
    row.migration_consumers.join('; '), row.evidence.map(item => `${item.line}:${item.kind}:${item.value}`).join('; '), row.sha256]))].join('\n') + '\n')
const count = predicate => records.filter(predicate).length
const summary = {
  source_files: records.length,
  legacy_candidates: count(row => row.candidate),
  candidate_groups: Object.fromEntries(['app/api/', 'app/dashboard/', 'components/', 'lib/'].map(prefix => [prefix, count(row => row.candidate && row.path.startsWith(prefix))])),
  candidate_pages: count(row => row.candidate && row.path.startsWith('app/') && !row.path.startsWith('app/api/')),
  classifications: Object.fromEntries([...new Set(records.map(row => row.classification))].map(value => [value, count(row => row.classification === value)])),
  direct_edits_without_legacy_keyword: count(row => !row.candidate && row.classification === 'required-source-edit'),
  limitation: 'Parsed source evidence plus reviewed exceptions; not a certified effort count, full runtime import graph, or semantic API parity sign-off.',
}
fs.writeFileSync(path.join(out, 'runtime-reconciliation.json'), JSON.stringify({ summary, files: records }, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
