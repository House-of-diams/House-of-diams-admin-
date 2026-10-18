import 'server-only'
import { adminTransaction } from './db/pool'
import { createAdmissionRepository } from './db/admin-repositories/video-admission'
import { admissionPolicy, confirmAdmission, createVideoAdmission, type AdmissionRepository } from './video-admission'
import { sendVideoCommand } from './video-storage'
import { videoSources, type VideoSource } from './video-provider'
import type { AdminActor } from './auth/admin-identity-core'
import type { VideoMime } from './video-storage'
import type { DbExecutor } from './db/query'

export async function lockAdmissionPolicy(db: DbExecutor, policy: string) {
  const result = await db.query<{ policy: string; sources: VideoSource[] }>('SELECT policy,sources FROM admin_media.policy WHERE singleton=true AND enabled=true AND policy=$1 FOR SHARE', [policy])
  if (result.rows.length !== 1) throw new Error('Video admission policy unavailable.')
  return result.rows[0]
}
// Each durable step commits separately. No transaction/connection is held across an object Put.
const repository: AdmissionRepository = {
  reserve: record => adminTransaction(async db => { await lockAdmissionPolicy(db, record.policy); return createAdmissionRepository(db).reserve(record) }),
  admit: record => adminTransaction(async db => { await lockAdmissionPolicy(db, record.policy); return createAdmissionRepository(db).admit(record) }),
  reject: id => adminTransaction(db => createAdmissionRepository(db).reject(id)),
  find: url => adminTransaction(db => createAdmissionRepository(db).find(url)),
}
export function uploadAdmittedVideo(source: VideoSource, body: Buffer, mime: VideoMime, actor: AdminActor, operationId?: string) {
  const policy = admissionPolicy()
  if (!policy) throw new Error('Video admission unavailable.')
  return createVideoAdmission(repository, sendVideoCommand, policy).upload(source, body, mime, actor, operationId)
}
/** No discovery cache is an authority. A policy/status change is read on every call. */
export async function resolveAdmittedVideo(url: string, id?: string, dbOverride?: DbExecutor) {
  const policy = admissionPolicy()
  if (!policy) throw new Error('Video admission unavailable.')
  const run = async (db: DbExecutor) => {
    const livePolicy = await lockAdmissionPolicy(db, policy)
    const record = await createAdmissionRepository(db).find(url)
    const source = record && videoSources().find(s => s.bucket === record.bucket && record.key.startsWith(s.prefix))
    if (!record || !source || !Array.isArray(livePolicy.sources)
      || !livePolicy.sources.some(s => s.bucket === source.bucket && s.prefix === source.prefix && s.baseUrl === source.baseUrl)
      || (id !== undefined && record.id !== id)) throw new Error('Video is not admitted.')
    return confirmAdmission(record, source, policy, sendVideoCommand)
  }
  return dbOverride ? run(dbOverride) : adminTransaction(run)
}
