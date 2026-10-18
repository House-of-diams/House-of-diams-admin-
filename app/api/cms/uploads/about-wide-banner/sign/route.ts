import { denyAwsImageSigning } from '@/lib/image-route'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'

export async function POST(request: Request) {
  const denied = await denyAwsImageSigning(request)
  if (denied) return denied
  const access = await assertAdmin(request)
  if ('error' in access) return access.error
  const body = await request.json().catch(() => null) as { contentType?: string; declaredSize?: number } | null
  if (body?.contentType !== 'image/webp' || !Number.isSafeInteger(body.declaredSize) || (body.declaredSize as number) < 1 || (body.declaredSize as number) > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'Prepared image is invalid or too large.' }, { status: 400 })
  }
  const path = `about/wide-banner/${crypto.randomUUID()}.webp`
  const { data, error } = await access.adminClient.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data?.token) return NextResponse.json({ error: 'Unable to prepare upload.' }, { status: 500 })
  return NextResponse.json({ bucket, path, token: data.token })
}
