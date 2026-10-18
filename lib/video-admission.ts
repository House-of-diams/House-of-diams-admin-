import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { videoUrl, videoTypes, MAX_VIDEO_BYTES, type VideoMime, type VideoSend } from './video-storage'
import { productVideoContentsMatch } from './product-operations-validation'
import type { VideoSource } from './video-provider'
import type { AdminActor } from './auth/admin-identity-core'
import { readAdminAuthProvider } from './auth/integration'

export type Admission = {
  id: string; operationId: string; actorId: string; actorIssuer: string; actorSubject: string; bucket: string; key: string; url: string
  sha256: string; size: number; mime: VideoMime; version: string | null
  policy: string; verifier: string; evidence: 'new-upload-intent' | 'historical-current-object'
  status: 'pending' | 'admitted' | 'rejected' | 'retired'
}
export interface AdmissionRepository {
  reserve(record: Admission): Promise<{ record: Admission; created: boolean }>
  admit(record: Admission): Promise<Admission>
  reject(id: string): Promise<void>
  find(url: string): Promise<Admission | null>
}
/** Requesting an incomplete capability is an error, never a fallback to approval. */
export function admissionPolicy(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.ADMIN_VIDEO_ADMISSION_PROVIDER) return null
  if (readAdminAuthProvider(env) !== 'keycloak') throw new Error('Video admission requires migrated server authorization.')
  if (env.ADMIN_VIDEO_ADMISSION_PROVIDER !== 'rds' || env.ADMIN_VIDEO_IMMUTABILITY_VERIFIED !== 'true'
    || !/^[a-zA-Z0-9._-]{1,80}$/.test(env.ADMIN_VIDEO_ADMISSION_POLICY ?? '')) throw new Error('Video admission unavailable.')
  return env.ADMIN_VIDEO_ADMISSION_POLICY!
}
export function assertAdmission(record: Admission | null, source: VideoSource, policy: string): asserts record is Admission {
  if (!record || record.status !== 'admitted' || record.policy !== policy || record.bucket !== source.bucket
    || record.url !== videoUrl(source, record.key) || record.size <= 0 || record.size > MAX_VIDEO_BYTES
    || !Object.hasOwn(videoTypes, record.mime) || !record.verifier || !record.sha256
    || !['new-upload-intent', 'historical-current-object'].includes(record.evidence)) throw new Error('Video is not admitted.')
}
export async function confirmAdmission(record: Admission, source: VideoSource, policy: string, send: VideoSend) {
  assertAdmission(record, source, policy)
  // Inspect current canonical object, not VersionId: the URL is deliberately unversioned.
  const head = await send(new HeadObjectCommand({ Bucket: record.bucket, Key: record.key, ChecksumMode: 'ENABLED' }))
  if (head.ChecksumSHA256 !== record.sha256 || head.ContentLength !== record.size || head.ContentType !== record.mime
    || (head.VersionId ?? null) !== record.version) throw new Error('Published video identity changed.')
  return record
}
/** A fresh final key is the candidate and publication; no copy/delete permission is required.
 * Pending bytes may exist, but cannot be selected. No automatic retry overwrites an orphan.
 */
export function createVideoAdmission(repo: AdmissionRepository, send: VideoSend, policy: string) {
  return {
    async upload(source: VideoSource, body: Buffer, mime: VideoMime, actor: AdminActor, operationId: string = randomUUID()) {
      if (!/^[0-9a-f-]{36}$/i.test(operationId) || !actor.profileId || !actor.issuer || !actor.subject || !body.length || body.length > MAX_VIDEO_BYTES
        || !Object.hasOwn(videoTypes, mime) || !productVideoContentsMatch(mime, body)) throw new Error('Invalid video admission.')
      const key = `${source.prefix}${randomUUID()}.${videoTypes[mime]}`
      const proposed: Admission = { id: randomUUID(), operationId, actorId: actor.profileId, actorIssuer: actor.issuer, actorSubject: actor.subject, bucket: source.bucket, key,
        url: videoUrl(source, key), sha256: createHash('sha256').update(body).digest('base64'), size: body.length, mime,
        version: null, policy, verifier: 'hod-container-head-v1', evidence: 'new-upload-intent', status: 'pending' }
      const { record, created } = await repo.reserve(proposed)
      if (record.actorId !== proposed.actorId || record.actorIssuer !== proposed.actorIssuer || record.actorSubject !== proposed.actorSubject
        || record.bucket !== proposed.bucket || !record.key.startsWith(source.prefix)
        || record.sha256 !== proposed.sha256 || record.size !== proposed.size || record.mime !== proposed.mime
        || record.policy !== policy || record.evidence !== 'new-upload-intent' || record.verifier !== proposed.verifier) throw new Error('Admission operation conflict.')
      if (!created) return confirmAdmission(record, source, policy, send)
      try {
        const put = await send(new PutObjectCommand({ Bucket: source.bucket, Key: record.key, Body: body, ContentType: mime,
          ContentLength: body.length, ChecksumSHA256: record.sha256, IfNoneMatch: '*', CacheControl: 'public, max-age=86400' }))
        const verified = { ...record, status: 'admitted' as const, version: put.VersionId ?? null }
        await confirmAdmission(verified, source, policy, send)
        const admitted = await repo.admit(verified)
        assertAdmission(admitted, source, policy)
        if ((Object.keys(verified) as (keyof Admission)[]).some(key => admitted[key] !== verified[key])) throw new Error('Admission persistence mismatch.')
        return admitted
      } catch (error) {
        // A failed/ambiguous commit never returns success. The conditional reject cannot retire/resurrect an admitted row.
        await repo.reject(record.id).catch(() => {})
        throw error
      }
    },
  }
}
