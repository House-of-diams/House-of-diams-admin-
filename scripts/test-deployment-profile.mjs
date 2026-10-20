import assert from 'node:assert/strict'
import test from 'node:test'
import { deploymentProfile } from '../lib/deployment-profile.ts'

// HOD-010: one pinned set per deployment; unset keeps today's UAT values.
test('deployment profile pins issuer and storage per environment', () => {
  assert.equal(deploymentProfile(undefined).name, 'uat')
  assert.equal(deploymentProfile('').oidcIssuer, 'https://auth-uat.houseofdiams.com/realms/houseofdiams')
  assert.deepEqual(deploymentProfile('uat').media, { bucket: 'house-of-diams', baseUrl: 'https://media.houseofdiams.com' })
  assert.deepEqual(deploymentProfile('uat').content, { bucket: 'house-of-diams-hod', baseUrl: 'https://content.houseofdiams.com' })
  assert.equal(deploymentProfile('production').oidcIssuer, 'https://auth.houseofdiams.com/realms/houseofdiams')
  assert.throws(() => deploymentProfile('staging'), /Unknown deployment profile/)
  assert.throws(() => deploymentProfile('UAT'), /Unknown deployment profile/)
})
