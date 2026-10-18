import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeMappedAdmin } from '../lib/auth/admin-identity-core.ts'

const now = 2_000_000_000
const policy = { issuer: 'https://identity.example/realms/houseofdiams', clientId: 'hod-admin', requiredClientRole: 'admin' }
const session = { issuer: policy.issuer, subject: 'keycloak-subject-not-a-uuid', audiences: ['hod-admin'], clientId: 'hod-admin', clientRoles: ['admin'], expiresAt: now + 300 }
const mapping = { issuer: session.issuer, subject: session.subject, profileId: '12345678-1234-4234-9234-123456789abc', enabled: true, revokedAt: null, profileRole: 'admin' }
const authorize = (claims = session, rows = [mapping], config = policy) => authorizeMappedAdmin(claims, rows, config, now)

test('returns the stable internal UUID, never the Keycloak subject', () => {
  assert.equal(authorize().profileId, mapping.profileId)
  assert.ok(Object.isFrozen(authorize()))
})
test('requires a live session and explicit, unique mapping', () => {
  assert.equal(authorize(null), null)
  assert.equal(authorize(session, []), null)
  assert.equal(authorize(session, [mapping, mapping]), null)
  for (const expiresAt of [now, now - 1, NaN, Infinity]) assert.equal(authorize({ ...session, expiresAt }), null)
})
test('isolates issuer, audience, client and role from customer identities', () => {
  for (const changes of [{ issuer: 'https://identity.example/realms/hod-customers' }, { audiences: ['hod-storefront'] }, { clientId: 'hod-storefront' }, { clientRoles: [] }, { subject: '' }]) {
    assert.equal(authorize({ ...session, ...changes }), null)
  }
  assert.equal(authorize(session, [mapping], { ...policy, requiredClientRole: '' }), null)
})
test('rejects disabled, revoked, changed-role, corrupt or mismatched mappings', () => {
  for (const changes of [{ enabled: false }, { revokedAt: '2026-10-12T00:00:00Z' }, { profileRole: 'customer' }, { profileId: session.subject }, { issuer: 'other-issuer' }, { subject: 'other-subject' }]) {
    assert.equal(authorize(session, [{ ...mapping, ...changes }]), null)
  }
})
