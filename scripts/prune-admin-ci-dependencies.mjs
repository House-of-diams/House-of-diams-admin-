import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// The source-based server preflight needs TypeScript, but not test/build tools.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hod-typescript-runtime-'))
try {
  fs.cpSync(fs.realpathSync('node_modules/typescript'), path.join(temporary, 'typescript'), { recursive: true })
  const result = spawnSync('pnpm', ['prune', '--prod'], { stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error('Production dependency pruning failed')
  if (!fs.existsSync('node_modules/typescript')) fs.cpSync(path.join(temporary, 'typescript'), 'node_modules/typescript', { recursive: true })
} finally { fs.rmSync(temporary, { recursive: true, force: true }) }
