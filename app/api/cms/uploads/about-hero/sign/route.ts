import { denyAwsImageSigning } from '@/lib/image-route'
import { denyAwsVideoSigning } from '@/lib/video-route'
import { NextResponse } from 'next/server'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
const imageTypes = new Set(['image/webp'])
const videoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

export async function POST(request: Request) {
  const deniedVideo = await denyAwsVideoSigning(request)
  if (deniedVideo) return deniedVideo
  const denied = await denyAwsImageSigning(request)
  if (denied) return denied
  const { assertAdmin } = await import('@/lib/cms-auth')
  const access = await assertAdmin(request)
  if ('error' in access) return access.error
  const body = await request.json().catch(() => null) as { kind?: string; contentType?: string; declaredSize?: number } | null
  const kind = body?.kind ?? ''
  const type = body?.contentType ?? ''
  const size = body?.declaredSize
  if (!Number.isSafeInteger(size) || (size as number) < 1) return NextResponse.json({ error: 'Invalid file size.' }, { status: 400 })

  const isVideo = kind === 'video'
  if (!isVideo && kind !== 'image' && kind !== 'poster') return NextResponse.json({ error: 'Invalid upload kind.' }, { status: 400 })
  if (isVideo && (!videoTypes.has(type) || (size as number) > 100 * 1024 * 1024)) return NextResponse.json({ error: 'Use an MP4, WebM, or MOV video up to 100MB.' }, { status: 400 })
  if (!isVideo && (!imageTypes.has(type) || (size as number) > 8 * 1024 * 1024)) return NextResponse.json({ error: 'Prepared image is invalid or too large.' }, { status: 400 })

  const extension = isVideo ? (type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4') : 'webp'
  const path = `about/hero/${kind}/${crypto.randomUUID()}.${extension}`
  const { data, error } = await access.adminClient.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data?.token) return NextResponse.json({ error: 'Unable to prepare upload.' }, { status: 500 })
  return NextResponse.json({ bucket, path, token: data.token })
}
