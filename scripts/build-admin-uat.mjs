import fs from 'node:fs'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'

// Pass build settings through the environment, not Node --env-file arguments:
// Next workers can otherwise propagate that flag into forbidden NODE_OPTIONS.
const manifest = parseEnv(fs.readFileSync('config/admin-uat-aws.env', 'utf8'))
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, ...manifest, NEXT_TELEMETRY_DISABLED: '1', AWS_EC2_METADATA_DISABLED: 'true' },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
