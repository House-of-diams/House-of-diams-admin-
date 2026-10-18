import 'server-only'
import type { DbExecutor } from '../query'
import type { Admission, AdmissionRepository } from '../../video-admission'

const projection = `admission_id AS id, operation_id AS "operationId", actor_id AS "actorId", actor_issuer AS "actorIssuer", actor_subject AS "actorSubject", bucket, object_key AS key,
  canonical_url AS url, sha256, byte_length AS size, mime, object_version AS version, policy, verifier, evidence, status`
export function createAdmissionRepository(db: DbExecutor): AdmissionRepository {
  return {
    async reserve(record) {
      const values = [record.id, record.operationId, record.actorId, record.bucket, record.key, record.url, record.sha256, record.size, record.mime, record.policy, record.verifier,record.actorIssuer,record.actorSubject]
      const result = await db.query<Admission>(`INSERT INTO admin_media.admissions
        (admission_id,operation_id,actor_id,bucket,object_key,canonical_url,sha256,byte_length,mime,policy,verifier,actor_issuer,actor_subject,evidence,status)
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::integer,$9,$10,$11,$12,$13,'new-upload-intent','pending')
        ON CONFLICT (operation_id) DO NOTHING RETURNING ${projection}`, values)
      if (result.rows.length === 1) return { record: result.rows[0], created: true }
      const found = await db.query<Admission>(`SELECT ${projection} FROM admin_media.admissions WHERE operation_id=$1::uuid`, [record.operationId])
      if (found.rows.length !== 1) throw new Error('Admission reservation failed.')
      return { record: found.rows[0], created: false }
    },
    async admit(record) {
      const result = await db.query<Admission>(`UPDATE admin_media.admissions SET status='admitted',object_version=$2,verified_at=clock_timestamp()
        WHERE admission_id=$1::uuid AND status='pending' AND sha256=$3 AND policy=$4 RETURNING ${projection}`, [record.id, record.version, record.sha256, record.policy])
      if (result.rows.length !== 1) throw new Error('Admission transition failed.')
      return result.rows[0]
    },
    async reject(id) { await db.query("UPDATE admin_media.admissions SET status='rejected' WHERE admission_id=$1::uuid AND status='pending'", [id]) },
    async find(url) {
      const result = await db.query<Admission>(`SELECT ${projection} FROM admin_media.admissions WHERE canonical_url=$1 FOR SHARE`, [url])
      if (result.rows.length > 1) throw new Error('Ambiguous admission.')
      return result.rows[0] ?? null
    },
  }
}
