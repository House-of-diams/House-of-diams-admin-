import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

// Compile pure validation modules in memory; no build output or API/database calls.
function loadTs(path) {
  const moduleRecord = { exports: {} }
  const nodeRequire = createRequire(path)
  const output = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(output, {
    module: moduleRecord, exports: moduleRecord.exports, URL,
    require: (name) => name.startsWith('.') ? loadTs(resolve(dirname(path), `${name}.ts`)) : nodeRequire(name),
  })
  return moduleRecord.exports
}
const { reelsSaveSchema, reelsSaveError } = loadTs(fileURLToPath(new URL('../lib/cms-reels-save.ts', import.meta.url)))
const valid = () => ({
  request_id: '00000000-0000-4000-8000-000000000001', expected_revision: 'a'.repeat(32),
  heading: 'Instagram', subtitle: '', is_enabled: true, marquee_duration_seconds: 40,
  pause_on_hover: true, deleted_ids: [],
  items: [{ instagram_url: 'https://www.instagram.com/reel/ABC/?utm_source=test', title: '', is_enabled: true }],
})
test('canonicalizes URLs and leaves new primary keys absent', () => {
  const data = reelsSaveSchema.parse(valid())
  assert.equal(data.items[0].instagram_url, 'https://www.instagram.com/reel/ABC/')
  assert.equal(Object.hasOwn(data.items[0], 'id'), false)
  assert.equal(Object.hasOwn(data.items[0], 'cover_image_url'), false)
})
test('rejects malformed/null IDs instead of turning them into new records', () => {
  for (const id of [null, '', 'draft-1', 23]) {
    const data = valid()
    data.items[0].id = id
    assert.equal(reelsSaveSchema.safeParse(data).success, false)
  }
})
test('rejects duplicate IDs, duplicate normalized URLs and retained/deleted conflicts', () => {
  let data = valid()
  data.items.push({ ...data.items[0], instagram_url: 'https://www.instagram.com/reel/ABC/' })
  assert.equal(reelsSaveSchema.safeParse(data).success, false)
  data = valid()
  data.items[0].id = data.request_id
  data.items.push({ ...data.items[0], instagram_url: 'https://www.instagram.com/reel/OTHER/' })
  assert.equal(reelsSaveSchema.safeParse(data).success, false)
  data.items.pop()
  data.deleted_ids = [data.request_id]
  assert.equal(reelsSaveSchema.safeParse(data).success, false)
})
test('requires version and explicit deletion intent; rejects mass-assigned columns', () => {
  for (const key of ['expected_revision', 'deleted_ids', 'request_id']) {
    const data = valid()
    delete data[key]
    assert.equal(reelsSaveSchema.safeParse(data).success, false)
  }
  const data = valid()
  data.items[0].created_by = data.request_id
  assert.equal(reelsSaveSchema.safeParse(data).success, false)
})
test('returns deployment/conflict errors without exposing unknown database details', () => {
  assert.equal(reelsSaveError({ code: 'PGRST202', message: 'internal' }).status, 503)
  assert.equal(reelsSaveError({ code: '40001', message: 'Reload' }).status, 409)
  assert.equal(reelsSaveError({ code: '23514', message: 'private table details' }).message.includes('private'), false)
})
