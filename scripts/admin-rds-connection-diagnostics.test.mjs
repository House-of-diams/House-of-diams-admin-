import assert from 'node:assert/strict'
import test from 'node:test'
import { assessConnectionProof, connectionFailure } from './admin-rds-connection-diagnostics.mjs'

const login = 'hod_admin_login_uat'
const row = { database: 'hod_staging', login_role: login, capability: 'hod_admin_app', read_only: 'on', tls: true }
const transport = { encrypted: true, authorized: true, authorizationError: false, strict: true }

test('verified TLS succeeds even when SET ROLE hides server statistics', () => {
  for (const tls of [true, null]) {
    assert.equal(assessConnectionProof([{ ...row, tls }], login, transport).ok, true)
  }
})

test('plaintext, unverified certificates and relaxed TLS policy fail closed', () => {
  for (const change of [{ encrypted: false }, { authorized: false },
    { authorizationError: true }, { strict: false }]) {
    assert.equal(assessConnectionProof([row], login, { ...transport, ...change }).ok, false)
  }
  assert.equal(assessConnectionProof([row], login, undefined).ok, false)
  for (const tls of [false, undefined, 'true']) {
    assert.equal(assessConnectionProof([{ ...row, tls }], login, transport).ok, false)
  }
})

test('wrong database, role, transaction mode or row count fails', () => {
  for (const change of [{ database: 'postgres' }, { login_role: 'postgres' },
    { capability: 'hod_app' }, { read_only: 'off' }]) {
    assert.equal(assessConnectionProof([{ ...row, ...change }], login, transport).ok, false)
  }
  for (const rows of [[], [row, row]]) assert.equal(assessConnectionProof(rows, login, transport).ok, false)
})

test('diagnostics expose only fixed boolean proof checks', () => {
  const secret = 'private-password-and-url'
  const result = connectionFailure(new Error(secret), {
    stage: 'proof_validation', proofChecks: { database: true, login: secret, password: secret },
  })
  assert.equal(result.proof_checks.database, true)
  assert.equal(result.proof_checks.login, false)
  assert.equal(JSON.stringify(result).includes(secret), false)
  assert.equal(Object.hasOwn(result.proof_checks, 'password'), false)
})

test('write failures retain their operation stage without exposing database error text', () => {
  const result=connectionFailure({code:'42883',message:'private database error text'}, {stage:'fixture_draft_status'})
  assert.equal(result.stage,'fixture_draft_status')
  assert.equal(result.code,'42883')
  assert.ok(result.next.includes('rollback cleanup'))
  assert.ok(!JSON.stringify(result).includes('private database error text'))
})
