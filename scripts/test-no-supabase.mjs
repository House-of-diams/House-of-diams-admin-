// Guard: the admin runs on AWS only. Fails if Supabase (or the legacy R2 video provider) comes back into the source.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirs = ['app', 'lib', 'components', 'hooks']
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs'])

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (extensions.has(path.extname(entry.name))) yield full
  }
}

test('no admin source file mentions Supabase or the legacy R2 provider', () => {
  const offenders = []
  for (const directory of sourceDirs) {
    for (const file of walk(path.join(root, directory))) {
      const text = fs.readFileSync(file, 'utf8')
      if (/supabase|CLOUDFLARE_R2/i.test(text)) offenders.push(path.relative(root, file).replaceAll(String.fromCharCode(92), '/'))
    }
  }
  assert.deepEqual(offenders, [])
})

test('the Supabase packages are not dependencies', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
  assert.deepEqual(names.filter(name => /supabase/i.test(name)), [])
})

test('no deployed configuration allows Supabase hosts', () => {
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8'), /supabase/i)
})
