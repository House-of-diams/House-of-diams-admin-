// Local C2 evidence only. Does not execute app, cloud, DB, HTTP or other C1 verification writers.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
const hash = x => createHash('sha256').update(x).digest('hex').toUpperCase()
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''))
const baseline = readJson('docs/aws-phase-c/C2-baseline.json')
const originals = new Map(readJson('docs/aws-phase-c/C2-original-owned-sources.json').map(x => [x.path, x.source]))
const owned = [
  'lib/video-provider.ts', 'lib/video-storage.ts', 'lib/video-library.ts', 'lib/video-route.ts', 'lib/video-transport.ts', 'lib/video-reference.ts',
  'app/api/videos/provider/route.ts', 'app/api/products/media/route.ts', 'app/api/products/videos/route.ts', 'app/api/cms/uploads/about-hero/route.ts', 'app/api/cms/uploads/about-hero/sign/route.ts',
  'components/product-form.tsx', 'components/product-form/VideoLibraryDialog.tsx', 'lib/cms-direct-upload-client.ts', 'scripts/test-admin-videos.mjs', 'scripts/verify-admin-videos.mjs',
]
const before = new Map(baseline.map(x => [x.path, x.sha256]))
const changed = baseline.filter(x => !fs.existsSync(x.path) || hash(fs.readFileSync(x.path)) !== x.sha256).map(x => x.path)
for (const f of changed) if (!owned.includes(f)) throw Error('Unowned source changed: ' + f)
const files = execFileSync('rg', ['--files', 'app', 'components', 'lib', 'scripts'], { encoding: 'utf8' }).trim().split(/\r?\n/).map(x => x.replaceAll('\\', '/'))
for (const f of files) if (!before.has(f) && !owned.includes(f)) throw Error('Unowned source added: ' + f)
for (const f of owned) if (fs.readFileSync(f, 'utf8').split(/\r?\n/).some(x => /[ \t]+$/.test(x))) throw Error('Whitespace: ' + f)
const dependencies = readJson('docs/aws-phase-c/C1-dependency-preservation.json').map(x => ({ path: x.path, sha256: hash(fs.readFileSync(x.path)), unchanged: hash(fs.readFileSync(x.path)) === x.currentSha256 }))
if (dependencies.some(x => !x.unchanged)) throw Error('Dependencies changed')
const c1 = fs.readFileSync('docs/aws-phase-c/C1-source-hashes.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(x => x.split(',').map(v => v.replace(/^"|"$/g, '')))
const intentionalC1 = c1.filter(([f, sha]) => hash(fs.readFileSync(f)) !== sha).map(([f]) => f)
for (const f of intentionalC1) if (!owned.includes(f)) throw Error('Unexpected C1 change: ' + f)
const b6 = fs.readFileSync('docs/aws-phase-b/B6-source-hashes.csv', 'utf8').trim().split(/\r?\n/).slice(1).map(x => x.split(',').map(v => v.replace(/^"|"$/g, '')))
for (const [f, sha] of b6) if (hash(fs.readFileSync(f)) !== sha) throw Error('B6 change: ' + f)
// Raw initial texts retained before implementation. Validate their encoding against hashes.
for (const [file, source] of originals) if (hash(source) !== before.get(file)) throw Error('Initial source reconstruction mismatch: ' + file)
function tokens(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text), values = []
  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) values.push(scanner.getTokenText())
  return hash(JSON.stringify(values))
}
function helpers(text, file) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), out = []
  function visit(n) { if (ts.isFunctionLike(n) && n.body) { const name = n.name?.getText(sf) ?? (ts.isVariableDeclaration(n.parent) ? n.parent.name.getText(sf) : 'anonymous'); out.push({ name, sha256: tokens(n.body.getText(sf)) }) } ts.forEachChild(n, visit) }
  visit(sf); return out
}
const helperProof = []
for (const file of ['components/product-form.tsx', 'lib/cms-direct-upload-client.ts']) {
  const current = helpers(fs.readFileSync(file, 'utf8'), file)
  for (const fn of helpers(originals.get(file), file)) {
    if (fn.name === 'anonymous' || /^[A-Z]/.test(fn.name) || ['uploadMedia', 'uploadMediaThroughServer', 'uploadCmsAssetDirectWithFallback'].includes(fn.name)) continue
    if (!current.some(x => x.name === fn.name && x.sha256 === fn.sha256)) throw Error('Existing helper changed: ' + file + ' ' + fn.name)
    helperProof.push({ file, ...fn })
  }
}
const imageProof = []
const product = 'app/api/products/media/route.ts'
const about = 'app/api/cms/uploads/about-hero/route.ts'
for (const [file, start, end] of [[product, "  if (kind === 'image') {", '  const deniedVideo ='], [about, '  if (!isVideo) {\n    try {', '  if (isS3MediaConfigured()) {']]) {
  const initial = originals.get(file).replaceAll('\r\n', '\n'), current = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
  const oldEnd = file === product ? '  const extension = videoExtensions.get(file.type)' : end
  const a = initial.slice(initial.indexOf(start), initial.indexOf(oldEnd, initial.indexOf(start)))
  const b = current.slice(current.indexOf(start), current.indexOf(end, current.indexOf(start)))
  if (!a || tokens(a) !== tokens(b)) throw Error('Image branch changed: ' + file)
  imageProof.push({ file, sha256: tokens(a) })
}
const manifests = owned.map(file => ({ path: file, sha256: hash(fs.readFileSync(file)) }))
fs.writeFileSync('docs/aws-phase-c/C2-source-hashes.csv', 'path,sha256\n' + manifests.map(x => x.path + ',' + x.sha256).join('\n') + '\n')
const exports = owned.filter(f => f.endsWith('.ts')).map(file => {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  return { file, declarations: sf.statements.filter(s => s.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)).map(s => s.name?.getText(sf) ?? (ts.isVariableStatement(s) ? s.declarationList.declarations.map(d => d.name.getText(sf)).join(',') : s.getText(sf).split('\n')[0])) }
})
const report = { baselineSources: baseline.length, changed, added: owned.filter(f => !before.has(f)), unchangedOutsideC2: baseline.length - changed.length, c1HashesUnchanged: c1.length - intentionalC1.length, intentionalC1Changes: intentionalC1, b6HashesUnchanged: b6.length, dependencies, helperProof, imageProof, manifestSources: manifests.length }
fs.writeFileSync('docs/aws-phase-c/C2-preservation.json', JSON.stringify(report, null, 2) + '\n')
fs.writeFileSync('docs/aws-phase-c/C2-exports.json', JSON.stringify(exports, null, 2) + '\n')
console.log(JSON.stringify({ baseline: baseline.length, changed: changed.length, added: report.added.length, unchangedOutsideC2: report.unchangedOutsideC2, c1Unchanged: report.c1HashesUnchanged, b6Unchanged: report.b6HashesUnchanged, helpers: helperProof.length, imageBranches: imageProof.length, manifest: manifests.length }))
