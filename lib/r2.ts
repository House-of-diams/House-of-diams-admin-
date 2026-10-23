import 'server-only'

import { ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { readVideoProvider } from './video-provider'

type ProductMediaFolder = 'products' | 'hiphop' | 'bespoke'

const r2AccountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim() ?? ''
const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim() ?? ''
const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim() ?? ''
const r2Bucket = process.env.CLOUDFLARE_R2_BUCKET?.trim() ?? ''
const r2PublicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim() ?? ''
const r2VideoPrefix = process.env.CLOUDFLARE_R2_VIDEO_PREFIX?.trim() || 'products/videos'
const r2BespokeVideoPrefix = process.env.CLOUDFLARE_R2_BESPOKE_VIDEO_PREFIX?.trim() || 'bespoke/videos'

let client: S3Client | null = null

function requireR2Config() {
  if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket || !r2PublicBaseUrl) {
    throw new Error('Cloudflare R2 video upload is not configured completely.')
  }
}

export function isR2Configured() {
  return Boolean(r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket && r2PublicBaseUrl)
}

function getR2Client() {
  requireR2Config()
  if (client) return client

  client = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  })

  return client
}

function normalizePrefix(value: string) {
  return value.split('/').map((part) => part.trim()).filter(Boolean).join('/')
}

function joinPublicUrl(baseUrl: string, key: string) {
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const cleanKey = key.replace(/^\/+/, '')
  return `${cleanBase}/${cleanKey}`
}

function buildVideoObjectKey(folder: ProductMediaFolder, extension: string) {
  const prefix = normalizePrefix(
    folder === 'bespoke'
      ? r2BespokeVideoPrefix
      : folder === 'hiphop'
        ? `${r2VideoPrefix}/hiphop`
        : r2VideoPrefix,
  )

  return prefix ? `${prefix}/${crypto.randomUUID()}.${extension}` : `${crypto.randomUUID()}.${extension}`
}

function normalizeObjectSegment(value: string | null | undefined) {
  return (value || 'draft')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'draft'
}

export async function createPresignedProductImageUpload({
  folder,
  productKey,
  contentType,
  declaredSize,
}: {
  folder: 'products' | 'hiphop'
  productKey?: string | null
  contentType: 'image/webp'
  declaredSize: number
}) {
  const objectKey = `${folder}/${normalizeObjectSegment(productKey)}/images/${crypto.randomUUID()}.webp`
  const command = new PutObjectCommand({
    Bucket: r2Bucket,
    Key: objectKey,
    ContentType: contentType,
    ContentLength: declaredSize,
  })
  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 })

  return {
    key: objectKey,
    uploadUrl,
    url: joinPublicUrl(r2PublicBaseUrl, objectKey),
  }
}

export function inferVideoContentType(extension: string, fallback?: string | null) {
  const normalized = extension.trim().toLowerCase()
  if (normalized === 'mov') return 'video/quicktime'
  if (normalized === 'webm') return 'video/webm'
  if (normalized === 'mp4') return 'video/mp4'
  return fallback?.trim() || 'video/mp4'
}

export async function uploadProductVideoToR2({
  buffer,
  extension,
  folder,
  contentType,
}: {
  buffer: Buffer
  extension: string
  folder: ProductMediaFolder
  contentType?: string | null
}) {
  // Legacy R2 uploads are disabled; the verified S3/admission path is the only video route.
  throw new Error('Legacy video upload is disabled.')
  const safeExtension = extension.trim().toLowerCase() || 'mp4'
  const objectKey = buildVideoObjectKey(folder, safeExtension)

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: inferVideoContentType(safeExtension, contentType),
      IfNoneMatch: '*',
    }),
  )

  return {
    key: objectKey,
    url: joinPublicUrl(r2PublicBaseUrl, objectKey),
  }
}

export async function listProductVideosFromR2({
  folder,
  cursor,
  pageSize = 48,
}: {
  folder: 'products' | 'hiphop'
  cursor?: string | null
  pageSize?: number
}) {
  requireR2Config()
  const prefix = normalizePrefix(
    folder === 'hiphop' ? `${r2VideoPrefix}/hiphop` : r2VideoPrefix,
  )
  const result = await getR2Client().send(
    new ListObjectsV2Command({
      Bucket: r2Bucket,
      Prefix: prefix ? `${prefix}/` : undefined,
      ContinuationToken: cursor || undefined,
      MaxKeys: Math.min(Math.max(pageSize, 1), 100),
    }),
  )

  return {
    items: (result.Contents ?? [])
      .filter((item) => Boolean(item.Key))
      .map((item) => ({
        key: item.Key as string,
        url: joinPublicUrl(r2PublicBaseUrl, item.Key as string),
        size: item.Size ?? 0,
        lastModified: item.LastModified?.toISOString() ?? null,
      })),
    nextCursor: result.IsTruncated ? result.NextContinuationToken ?? null : null,
  }
}

type CentralVideoAsset = {
  key: string
  url: string
  size: number
  lastModified: string | null
}

const CENTRAL_VIDEO_CACHE_TTL_MS = 5 * 60 * 1000
let centralVideoCache: { items: CentralVideoAsset[]; loadedAt: number } | null = null
let centralVideoPending: Promise<CentralVideoAsset[]> | null = null

function isVideoObjectKey(key: string) {
  return /\.(mp4|mov|webm|m4v)$/i.test(key)
}

async function loadAllR2Videos() {
  requireR2Config()
  const items: CentralVideoAsset[] = []
  let continuationToken: string | undefined

  do {
    const result = await getR2Client().send(
      new ListObjectsV2Command({
        Bucket: r2Bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    )
    for (const item of result.Contents ?? []) {
      if (!item.Key || !isVideoObjectKey(item.Key)) continue
      items.push({
        key: item.Key,
        url: joinPublicUrl(r2PublicBaseUrl, item.Key),
        size: item.Size ?? 0,
        lastModified: item.LastModified?.toISOString() ?? null,
      })
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined
  } while (continuationToken)

  return items.sort((left, right) => {
    const leftTime = left.lastModified ? Date.parse(left.lastModified) : 0
    const rightTime = right.lastModified ? Date.parse(right.lastModified) : 0
    return rightTime - leftTime
  })
}

export async function getCentralVideoLibrary({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  if (!forceRefresh && centralVideoCache && Date.now() - centralVideoCache.loadedAt < CENTRAL_VIDEO_CACHE_TTL_MS) {
    return centralVideoCache.items
  }
  if (!forceRefresh && centralVideoPending) return centralVideoPending

  centralVideoPending = loadAllR2Videos()
    .then((items) => {
      centralVideoCache = { items, loadedAt: Date.now() }
      return items
    })
    .finally(() => {
      centralVideoPending = null
    })

  return centralVideoPending
}

export function invalidateCentralVideoLibrary() {
  centralVideoCache = null
}
