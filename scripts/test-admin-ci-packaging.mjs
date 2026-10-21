import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const packager = fileURLToPath(new URL('./package-admin-uat.mjs', import.meta.url))
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hod-package-test-'))
  const write = (name, text = '') => { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), text) }
  write('.next/BUILD_ID', 'test-build')
  write('.next/cache/private-cache', 'not-for-release')
  write('.env.local', 'SYNTHETIC_SECRET=must-not-package')
  write('private-diagnostic.log', 'must-not-package')
  write('config/admin-uat-aws.env', 'NEXT_PUBLIC_HOD_DEPLOYMENT=uat\nNEXT_PUBLIC_MEDIA_CDN_BASE_URL=https://media.houseofdiams.com\nADMIN_VIDEO_IMMUTABILITY_VERIFIED=false\n')
  write('public/logo.txt', 'asset')
  write('scripts/check-admin-uat-data-config.mjs', '// runtime preflight')
  write('package.json', '{}')
  for (const name of ['next', 'typescript', 'sharp']) write(`node_modules/${name}/index.js`, 'module.exports = {}')
  const output = path.join(root, 'release')
  const run = () => spawnSync(process.execPath, [packager, output], { cwd: root, env: { ...process.env, GITHUB_SHA: 'a'.repeat(40) }, encoding: 'utf8', windowsHide: true })
  return { root, output, run }
}
test('built package includes runtime dependencies/assets/preflight and excludes local secrets/cache', () => {
  const f = fixture()
  try {
    const result = f.run(); assert.equal(result.status, 0, result.stderr)
    for (const name of ['.next/BUILD_ID', 'node_modules/next/index.js', 'public/logo.txt', 'scripts/check-admin-uat-data-config.mjs']) assert.ok(fs.existsSync(path.join(f.output, name)))
    for (const name of ['.env.local', 'private-diagnostic.log', '.next/cache']) assert.equal(fs.existsSync(path.join(f.output, name)), false)
    assert.equal(fs.readFileSync(path.join(f.output, 'RELEASE_COMMIT'), 'utf8').trim(), 'a'.repeat(40))
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.output, 'BUILD_PUBLIC_ENV.json'), 'utf8')), { NEXT_PUBLIC_HOD_DEPLOYMENT: 'uat', NEXT_PUBLIC_MEDIA_CDN_BASE_URL: 'https://media.houseofdiams.com' })
    assert.notEqual(f.run().status, 0, 'never overwrite an existing package')
  } finally { fs.rmSync(f.root, { recursive: true, force: true }) }
})
test('packaging refuses a source tree without a completed build', () => {
  const f = fixture()
  try { fs.unlinkSync(path.join(f.root, '.next/BUILD_ID')); assert.notEqual(f.run().status, 0); assert.equal(fs.existsSync(f.output), false) }
  finally { fs.rmSync(f.root, { recursive: true, force: true }) }
})
