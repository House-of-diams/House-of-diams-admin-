import 'server-only'
import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, type HeadObjectCommandOutput, type ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import type { VideoSource } from './video-provider'
import { productVideoContentsMatch } from './product-operations-validation'

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const videoTypes = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' } as const
export type VideoMime = keyof typeof videoTypes
export type VideoAsset = { key: string; url: string; size: number; lastModified: string | null; contentType: string; extension: string; verification: 'unknown' | 'admitted'; admissionId?: string }
type Command = PutObjectCommand | HeadObjectCommand | ListObjectsV2Command
export type VideoSend = (command: Command) => Promise<Partial<HeadObjectCommandOutput & ListObjectsV2CommandOutput>>
let client: S3Client | undefined
export const sendVideoCommand: VideoSend = async command => {
  client ??= new S3Client({ region: process.env.AWS_REGION || 'us-east-1' })
  if (command instanceof PutObjectCommand) return client.send(command)
  if (command instanceof HeadObjectCommand) return client.send(command)
  return client.send(command)
}
export function videoUrl(source: VideoSource, key: string) {
  if (!key.startsWith(source.prefix) || key.length > 1024 || /[\u0000-\u001f\u007f\\]/.test(key) || key.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Invalid video key.')
  return `${source.baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
}
export function createVideoStorage(dispatch: VideoSend = sendVideoCommand) {
  return {
    async upload(source: VideoSource, body: Buffer, mime: VideoMime, uuid = crypto.randomUUID()) {
      if (!Object.hasOwn(videoTypes, mime) || !body.length || body.length > MAX_VIDEO_BYTES || !productVideoContentsMatch(mime, body)) throw new Error('Invalid video.')
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid)) throw new Error('Invalid video key.')
      const key = `${source.prefix}${uuid}.${videoTypes[mime]}`, url = videoUrl(source, key)
      const checksum = createHash('sha256').update(body).digest('base64')
      await dispatch(new PutObjectCommand({ Bucket: source.bucket, Key: key, Body: body, ContentType: mime, ContentLength: body.length, CacheControl: 'public, max-age=86400', ChecksumSHA256: checksum, IfNoneMatch: '*' }))
      const head = await dispatch(new HeadObjectCommand({ Bucket: source.bucket, Key: key, ChecksumMode: 'ENABLED' }))
      if (head.ContentLength !== body.length || head.ContentType !== mime || head.ChecksumSHA256 !== checksum) throw new Error('Video verification failed.')
      return { key, url }
    },
    async list(sources: VideoSource[]) {
      const found = new Map<string, VideoAsset>()
      let pages = 0, scanned = 0
      for (const source of sources) {
        let token: string | undefined
        const tokens = new Set<string>()
        do {
          if (++pages > 200) throw new Error('Video inventory exceeds listing budget.')
          const result = await dispatch(new ListObjectsV2Command({ Bucket: source.bucket, Prefix: source.prefix, ContinuationToken: token, MaxKeys: 1000 }))
          for (const item of result.Contents ?? []) {
            if (++scanned > 100000) throw new Error('Video inventory exceeds listing budget.')
            const key = item.Key, extension = key?.match(/\.(mp4|mov|webm|m4v)$/i)?.[1].toLowerCase()
            if (!key || !extension) continue
            const url = videoUrl(source, key)
            const size = item.Size ?? 0
            if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid video inventory.')
            // List is discovery, including historical objects and failed-Head orphans.
            // It contains no durable approval evidence, even on the uploading instance.
            const asset: VideoAsset = { key, url, size, lastModified: item.LastModified?.toISOString() ?? null, extension, verification: 'unknown', contentType: extension === 'mov' ? 'video/quicktime' : extension === 'webm' ? 'video/webm' : extension === 'm4v' ? 'video/x-m4v' : 'video/mp4' }
            const old = found.get(url)
            if (!old || (asset.lastModified ?? '') > (old.lastModified ?? '')) found.set(url, asset)
          }
          token = result.IsTruncated ? result.NextContinuationToken : undefined
          if (result.IsTruncated && (!token || tokens.has(token))) throw new Error('Invalid video pagination.')
          if (token) tokens.add(token)
        } while (token)
      }
      return [...found.values()].sort((a, b) => (Date.parse(b.lastModified ?? '') || 0) - (Date.parse(a.lastModified ?? '') || 0) || a.url.localeCompare(b.url))
    },
  }
}
