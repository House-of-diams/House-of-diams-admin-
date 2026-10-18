// Read-only source/evidence analysis; writes only D1a evidence. No runtime adapters.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
const dir = 'docs/aws-phase-d/', normal = p => p.replaceAll('\\', '/')
const hash = value => createHash('sha256').update(value).digest('hex').toUpperCase()
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const baseline = json(dir + 'D1a-initial-sources.json').map(row => ({ ...row, path: normal(row.path) }))
const owned = [
  'app/api/cms/checkout-result/route.ts', 'app/api/orders/[id]/route.ts', 'app/dashboard/products/product-list.ts',
  'components/product-form.tsx', 'components/product-form/VideoLibraryDialog.tsx',
  'lib/auth/session.ts', 'lib/auth/handlers.ts', 'lib/db/query.ts', 'lib/db/pool.ts',
  'lib/db/admin-repositories/product-list.ts', 'lib/db/admin-repositories/orders.ts',
  'lib/product-page-data.ts', 'lib/product-rds-handlers.ts',
  'lib/video-storage.ts', 'lib/video-transport.ts', 'scripts/test-admin-d1a.mjs', 'scripts/verify-admin-d1a.mjs',
]
const sources = execFileSync('rg', ['--files', 'app', 'components', 'hooks', 'lib', 'scripts'], { encoding: 'utf8' }).trim().split(/\r?\n/).map(normal).filter(f => /\.(?:ts|tsx|mjs|py)$/.test(f))
const before = new Map(baseline.map(row => [row.path, row]))
const changed = baseline.filter(row => !fs.existsSync(row.path) || hash(fs.readFileSync(row.path)) !== row.sha256).map(row => row.path)
const added = sources.filter(f => !before.has(f))
for (const f of [...changed, ...added]) if (!owned.includes(f)) throw Error('Unexpected source delta: ' + f)
for (const row of baseline) if (hash(row.text) !== row.sha256) throw Error('Original text proof failed: ' + row.path)
for (const f of owned) if (fs.readFileSync(f, 'utf8').split(/\r?\n/).some(line => /[ \t]+$/.test(line))) throw Error('Whitespace: ' + f)
const c3 = fs.readFileSync('docs/aws-phase-c/C3-source-hashes.csv', 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map(line => { const [file, sha256] = line.split(','); return { file, sha256, matches: hash(fs.readFileSync(file)) === sha256 } })
if (c3.some(row => !row.matches)) throw Error('C3 source drift')
const c3Baseline = json('docs/aws-phase-c/C3-baseline.json')
const dependencies = ['package.json', 'pnpm-lock.yaml'].map(file => ({ file, matchesC3Initial: hash(fs.readFileSync(file)) === c3Baseline.find(row => normal(row.path) === file).sha256 }))
if (dependencies.some(row => !row.matchesC3Initial)) throw Error('Dependency drift')
const graph = new Map(), declarations = []
for (const file of sources.filter(f => /\.tsx?$/.test(f))) {
  const source = fs.readFileSync(file, 'utf8'), sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const imports = [...new Set([...code.matchAll(/(?:from\s+|import\s*\(?\s*)['"]([^'"]+)['"]/g)].map(m => m[1]))]
  const internal = imports.filter(name => name.startsWith('.') || name.startsWith('@/')).map(name => {
    const candidate = normal(name.startsWith('@/') ? name.slice(2) : path.relative(process.cwd(), path.resolve(path.dirname(file), name)))
    return [candidate, candidate + '.ts', candidate + '.tsx', candidate + '/index.ts', candidate + '/index.tsx'].find(f => sources.includes(f))
  }).filter(Boolean)
  graph.set(file, { file, imports, internal, client: /^['"]use client['"]/m.test(source), serverOnly: imports.includes('server-only') })
  if (owned.includes(file)) declarations.push({ file, exports: sf.statements.filter(s => s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(s => s.name?.getText(sf) ?? (ts.isVariableStatement(s) ? s.declarationList.declarations.map(d => d.name.getText(sf)).join(',') : s.getText(sf).split('\n')[0])) })
}
const violations = []
for (const start of [...graph.values()].filter(row => row.client)) {
  const seen = new Set(), queue = [[start.file]]
  while (queue.length) {
    const chain = queue.shift(), file = chain.at(-1)
    if (seen.has(file)) continue
    seen.add(file)
    const row = graph.get(file)
    if (row?.serverOnly) { violations.push(chain); continue }
    for (const child of row?.internal ?? []) queue.push([...chain, child])
  }
}
const review = c3.map(row => ({ ...row, consumers: [...graph.values()].filter(f => f.internal.includes(row.file)).map(f => f.file), runtimeImports: graph.get(row.file)?.imports ?? [], review: row.file.includes('test-') || row.file.includes('verify-') ? 'Harness reviewed: injected boundaries, no live acceptance; historical generator deliberately not rerun.' : 'Current complete source and real callers reviewed; see D1a-C3-review.md for contracts, caveats and dispositions.' }))
fs.writeFileSync(dir + 'D1a-C3-source-review.json', JSON.stringify(review, null, 2) + '\n')
fs.writeFileSync(dir + 'D1a-import-boundaries.json', JSON.stringify({ method: 'Transpiled runtime imports, including dynamic imports; static reachability only, no execution claim.', graph: [...graph.values()], clientToServerOnly: violations }, null, 2) + '\n')
fs.writeFileSync(dir + 'D1a-preservation.json', JSON.stringify({ baselineSources: baseline.length, originalTextProof: baseline.length, owned, changed, added, unchanged: baseline.length - changed.length, c3Matched: c3.filter(row => row.matches).length, dependencies, clientServerBoundaryCandidates: violations.length }, null, 2) + '\n')
fs.writeFileSync(dir + 'D1a-exports.json', JSON.stringify(declarations, null, 2) + '\n')
fs.writeFileSync(dir + 'D1a-local-delta.json', JSON.stringify(owned.map(file => ({ file, before: before.get(file)?.text ?? null, after: fs.readFileSync(file, 'utf8') })), null, 2) + '\n')
fs.writeFileSync(dir + 'D1a-source-hashes.csv', 'path,sha256\n' + owned.map(file => file + ',' + hash(fs.readFileSync(file))).join('\n') + '\n')
const saved = json('docs/aws-phase-a/rds-targeted-live-2026-10-14.json')
const bindings = json('docs/aws-migration-audit/static-routine-binding-validation.json').calls
const names = new Set(bindings.map(row => row.routine))
const routineRights = saved.reviewed_routines.filter(row => names.has(row.name)).map(row => ({
  name: row.name, arguments: row.arguments, signature: row.name + '(' + row.arguments.split(',').filter(Boolean).map(arg => arg.trim().replace(/^\w+\s+/, '')).join(', ') + ')',
  securityDefiner: row.security_definer, definitionSha256: hash(row.definition), owner: row.owner,
  callers: bindings.filter(binding => binding.routine === row.name).map(binding => ({ file: binding.file, lineAtAudit: binding.line })),
  disposition: row.security_definer ? 'Exact EXECUTE candidate only; shared PUBLIC/legacy ACL review is separate.' : 'Exact EXECUTE candidate plus reviewed invoker base/column/sequence/RLS dependencies; blocked until DBA policy decision.',
}))
fs.writeFileSync(dir + 'D1a-sql-requirements.json', JSON.stringify({
  status: 'REVIEW DRAFT, NOT READY TO RUN; no SQL executed. Dated saved evidence only; no new export requested.',
  runtime: { capability: 'hod_admin_app', loginOptions: ['dedicated hod_admin_app LOGIN', 'separate hod_admin_login_* LOGIN with explicit SET LOCAL ROLE hod_admin_app'], roleFlags: 'NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; no unrelated memberships', poolMaxPerProcess: 5 },
  identity: { relation: 'public.admin_identities', key: ['issuer', 'subject'], profile: 'existing profiles UUID; preserve profiles.id -> auth.users FK', state: 'enabled/revoked_at', lookup: 'public.admin_identity_lookup_v1(text,text)', runtimeRights: 'EXECUTE lookup only; no mapping/profile enumeration or enrollment rights' },
  routineRights,
  invokerDependencies: json('docs/aws-phase-a/database-boundary-review.json'),
  cmsRightsEvidence: json('docs/aws-phase-b/B5-permission-review.json'),
  operationsRightsEvidence: json('docs/aws-phase-b/B6-permission-review.json'),
  sequenceEvidence: { file: 'docs/aws-phase-a/rds-sequence-review.csv', sha256: hash(fs.readFileSync('docs/aws-phase-a/rds-sequence-review.csv')), rule: 'Only defaults/nextval required by approved INSERT surfaces; no ALL SEQUENCES grant.' },
  stockTrigger: saved.trigger_routines.find(row => row.routine === 'restore_order_stock_on_cancel()'),
  sharedBlockers: ['PUBLIC/effective actor-taking EXECUTE remains broad; no standalone admin grant closes this.', 'Invoker profiles/is_admin/auth.uid and PUBLIC policies require separately approved RLS compatibility without JWT-GUC spoofing.', 'Cross-writer stock cancel/reopen invariant unproven; admin terminal guard is not a DB-wide constraint.'],
}, null, 2) + '\n')
const grants = ['-- REVIEW-ONLY exact callable routine EXECUTE candidates. EVERY line is commented.', '-- Do not run separately from the approved identity/runtime and per-feature RLS package.', '-- These ADD admin-only grants; they do NOT revoke/change PUBLIC, hod_app, anon, authenticated or service_role.', '-- Shared actor-taking ACL exposure and invoker RLS remain blockers; see D1a-sql-review.md.', ...routineRights.map(row => '-- GRANT EXECUTE ON FUNCTION public.' + row.signature + ' TO hod_admin_app;')]
fs.writeFileSync(dir + 'D1a-routine-grants-review.sql', grants.join('\n') + '\n')
const dispositions = {
  'F-01': 'Local JSONB expression remediated; exact dedicated-role SELECT remains deferred.',
  'F-02': 'Actual form hydration/save/reference/stale-response guards remediated and tested; browser acceptance deferred.',
  'F-03': 'Pure historical-context banner projection remediated; live preview inventory deferred.',
  'R-01': 'Still blocked: dedicated role/identity plus shared ACL and invoker RLS review; consolidated admin-only SQL remains draft.',
  'R-02': 'Bounded ordinary-read/logout metadata recovery implemented; refresh loser denies then explicit read retry; Upstash and revoked-mapping logout recovery deferred.',
  'R-03': 'Scoped repeatable-read read-only product API/SSR reads implemented; interleaved actual DB acceptance deferred.',
  'R-04': 'Unknown discovery UI is blocked from selection; durable/historical admission decision and host budget remain incomplete.',
  'R-05': 'Historical media/IAM/CDN inventory remains a live acceptance gate; no actual object operation.',
  'R-06': 'Narrow stock-backed terminal admin guard implemented in both providers; made_to_order exception preserved; cross-writer DB invariant still unproven.',
}
const traceability = json('docs/aws-migration-audit/plan-traceability.json')
const requirements = traceability.requirements.map(row => ({ ...row, auditEvidenceInherited: true, d1aScope: (row.finding_ids ?? '').split(/[;, ]+/).filter(id => dispositions[id]).map(id => ({ id, disposition: dispositions[id] })), d1aAcceptance: 'No inherited audit status is promoted to live or whole-migration acceptance.' }))
const coverage = json('docs/aws-migration-audit/file-coverage.json')
const reviewed = [...new Set([...owned, ...c3.map(row => row.file)])].map(file => ({ file, sha256: hash(fs.readFileSync(file)), auditContext: coverage.files.find(row => row.path === file) ?? null, d1aDepth: owned.includes(file) ? 'Complete bounded delta/current-source/caller and test review; see report.' : 'Independent complete C3 source/current consumer review; see C3 review.', changedByD1a: changed.includes(file), addedByD1a: added.includes(file) }))
fs.writeFileSync(dir + 'D1a-traceability.json', JSON.stringify({ scope: 'All inherited 77 audit obligations retained as context, with scoped D1a dispositions and separate current C3 review; no audit file rewritten.', dispositions, requirements, c3Review: 'D1a-C3-review.md', supplemental: ['D1a-live-acceptance.md', 'D1a-video-admission.md', 'D1a-sql-review.md'] }, null, 2) + '\n')
fs.writeFileSync(dir + 'D1a-file-review.json', JSON.stringify({ scope: 'D1a owned sources plus all 28 C3 files; untouched audit coverage is context, not a claimed new full audit.', reviewed, historicalAuditCoverageCounts: coverage.counts }, null, 2) + '\n')
console.log(JSON.stringify({ changed: changed.length, added: added.length, originalTextProof: baseline.length, c3Matched: c3.filter(row => row.matches).length, boundaryCandidates: violations.length }))
