import 'server-only'
import { createHash } from 'node:crypto'
import { HeadObjectCommand, PutObjectCommand, S3Client, type HeadObjectCommandOutput } from '@aws-sdk/client-s3'
import { deploymentProfile } from './deployment-profile'

const bucket = process.env.AWS_MEDIA_BUCKET?.trim()
const baseUrl = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL?.trim().replace(/\/+$/, '')
let client: S3Client | null = null

export function isS3MediaConfigured() {
  const expected = deploymentProfile().media
  return bucket === expected.bucket && baseUrl === expected.baseUrl
}

function getClient() {
  if (!isS3MediaConfigured()) throw new Error('AWS media storage is not configured.')
  return client ??= new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })
}

type Target = { bucket: string; baseUrl: string }
type Send = (command: PutObjectCommand | HeadObjectCommand) => Promise<Partial<HeadObjectCommandOutput>>

/** Injectable command boundary; constructing/importing this module never resolves credentials. */
export function createMediaUploader(send: Send) {
 return async (path: string, body: Buffer, contentType: string, target: Target, verify = true) => {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Invalid media key.')
  if (verify && (path.length > 512 || path.includes('//') || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(path))) throw new Error('Invalid image key.')
  if (verify && (!/\/[a-zA-Z0-9_.-]*[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webp|svg)$/.test(path) || !['image/webp', 'image/svg+xml'].includes(contentType))) throw new Error('Invalid image key.')
  if (!body.length) throw new Error('Empty media upload.')
  const checksum = createHash('sha256').update(body).digest('base64')
  await send(new PutObjectCommand({
    Bucket: target.bucket, Key: path, Body: body, ContentType: contentType,
    CacheControl: 'public, max-age=86400', ChecksumSHA256: checksum,
    IfNoneMatch: '*',
  }))
  const uploaded = await send(new HeadObjectCommand({ Bucket: target.bucket, Key: path, ...(verify ? { ChecksumMode: 'ENABLED' as const } : {}) }))
  if (uploaded.ContentLength !== body.length || (verify && (uploaded.ChecksumSHA256 !== checksum || uploaded.ContentType !== contentType))) throw new Error('AWS media upload verification failed.')
  return { path, url: `${target.baseUrl}/${path}` }
 }
}

export async function uploadMediaToS3(path: string, body: Buffer, contentType: string, target?: Target) {
  // Default legacy contract (including video) retains its original target/verification behavior.
  const selected = target ?? { bucket: bucket ?? '', baseUrl: baseUrl ?? '' }
  const send: Send = async command => {
    const selectedClient = target ? (client ??= new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })) : getClient()
    return command instanceof PutObjectCommand ? selectedClient.send(command) : selectedClient.send(command)
  }
  return createMediaUploader(send)(path, body, contentType, selected, Boolean(target))
}
