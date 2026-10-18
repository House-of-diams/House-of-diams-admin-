import assert from 'node:assert/strict'
import test from 'node:test'
import { validateSafeSvg } from '../lib/admin-upload-validation.ts'

test('accepts simple SVG icons and local fragment references', () => {
  assert.equal(validateSafeSvg(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0h10v10z"/></svg>')), true)
})

test('rejects scripts, event handlers, external references, and embedded HTML', () => {
  const unsafe = [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"><path/></svg>',
    '<svg><foreignObject><div>HTML</div></foreignObject></svg>',
    '<svg><image href="https://attacker.example/a.png"/></svg>',
    '<svg><path style="fill:url(https://attacker.example/a.svg)"/></svg>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
  ]
  for (const value of unsafe) assert.equal(validateSafeSvg(Buffer.from(value)), false)
})

test('rejects non-SVG and binary payloads', () => {
  assert.equal(validateSafeSvg(Buffer.from('<html></html>')), false)
  assert.equal(validateSafeSvg(Buffer.from([0, 1, 2, 3])), false)
})
