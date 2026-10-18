import { denyAwsImageSigning } from '@/lib/image-route'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
const allowedMimeTypes = new Set(['image/webp', 'image/svg+xml'])

export async function POST(request: Request) {
  const denied = await denyAwsImageSigning(request)
  if (denied) return denied
  const access = await assertAdmin(request)
  if ('error' in access) return access.error
  const body = await request.json().catch(() => null) as { contentType?: unknown } | null
  if (body?.contentType === 'image/svg+xml') return NextResponse.json({ error: 'SVG uploads require server validation.' }, { status: 400 })
  const declaredSize = (body as { declaredSize?: unknown } | null)?.declaredSize
  if (typeof declaredSize !== 'number' || !Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > 5 * 1024 * 1024) return NextResponse.json({ error: 'Invalid prepared image size.' }, { status: 400 })
  const contentType = typeof body?.contentType === 'string' ? body.contentType : ''
  if (!allowedMimeTypes.has(contentType)) {
    return NextResponse.json({ error: 'Invalid direct couple image upload type.' }, { status: 400 })
  }
  const extension = contentType === 'image/svg+xml' ? 'svg' : 'webp'
  const path = `couples/${crypto.randomUUID()}.${extension}`
  const { data, error } = await access.adminClient.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data?.token) {
    return NextResponse.json({ error: 'Unable to prepare upload.' }, { status: 500 })
  }
  const url = access.adminClient.storage.from(bucket).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ bucket, path, token: data.token, url })
}
