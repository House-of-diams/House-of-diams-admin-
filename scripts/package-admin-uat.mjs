import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { execFileSync } from 'node:child_process'

const output = process.argv[2]
const sha = process.env.GITHUB_SHA
if (!output || !/^[0-9a-f]{40}$/.test(sha ?? '')) throw Error('Explicit output directory and commit are required')
if (fs.existsSync(output)) throw Error('Package directory must be new')
if (!fs.existsSync('.next/BUILD_ID')) throw Error('Production build is missing')
fs.mkdirSync(output, { recursive: true })
// Explicit runtime allowlist: never package .env*, Git history, CI credentials or diagnostics.
for (const item of ['.next', 'node_modules', 'public', 'lib', 'scripts', 'config/admin-uat-aws.env', 'package.json', 'pnpm-lock.yaml', 'next.config.mjs', 'tsconfig.json', 'next-env.d.ts']) {
  if (fs.existsSync(item)) fs.cpSync(item, path.join(output, item), { recursive: true, verbatimSymlinks: true })
}
fs.rmSync(path.join(output, '.next/cache'), { recursive: true, force: true })
const manifest = parseEnv(fs.readFileSync('config/admin-uat-aws.env', 'utf8'))
const publicValues = Object.fromEntries(Object.entries(manifest).filter(([key]) => key.startsWith('NEXT_PUBLIC_')))
fs.writeFileSync(path.join(output, 'BUILD_PUBLIC_ENV.json'), JSON.stringify(publicValues))
fs.writeFileSync(path.join(output, 'RELEASE_COMMIT'), sha + '\n')
// pnpm links remain within the included node_modules/.pnpm tree.
execFileSync(process.execPath, ['-e', "const {createRequire}=require('node:module');require.resolve('next');require.resolve('typescript');require.resolve('sharp');const nextRequire=createRequire(require.resolve('next/package.json'));if(typeof nextRequire('@next/env').loadEnvConfig!=='function')throw Error('Next env loader unavailable')"], { cwd: output, stdio: 'inherit' })
console.log('Prepared built runtime artifact; no runtime credentials included')
