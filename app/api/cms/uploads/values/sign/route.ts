import { denyAwsImageSigning } from '@/lib/image-route'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
export async function POST(request: Request) {
  const denied = await denyAwsImageSigning(request)
  if (denied) return denied
  const access = await assertAdmin(request)
  if ('error' in access) return access.error
  const body = await request.json().catch(() => null) as { contentType?: unknown; kind?: unknown; declaredSize?: unknown } | null
  if (body?.contentType === 'image/svg+xml') return NextResponse.json({ error: 'SVG uploads require server validation.' }, { status: 400 })
  const kind = body?.kind === 'image' ? 'image' : 'icon'
  if (kind === 'icon' && body?.contentType !== 'image/svg+xml') return NextResponse.json({ error: 'Only SVG icons are allowed.' }, { status: 400 })
  if (kind === 'image' && body?.contentType !== 'image/webp') return NextResponse.json({ error: 'Invalid prepared image type.' }, { status: 400 })
  if (kind === 'image' && (!Number.isSafeInteger(body?.declaredSize) || Number(body?.declaredSize) < 1 || Number(body?.declaredSize) > 8 * 1024 * 1024)) return NextResponse.json({ error: 'Image is too large.' }, { status: 400 })
  const path = kind === 'image' ? `values/images/${crypto.randomUUID()}.webp` : `values/icons/${crypto.randomUUID()}.svg`
  const { data, error } = await access.adminClient.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data?.token) return NextResponse.json({ error: 'Unable to prepare upload.' }, { status: 500 })
  return NextResponse.json({ bucket, path, token: data.token })
}
