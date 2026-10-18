import { denyAwsImageSigning } from '@/lib/image-route'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'
export async function POST(request: Request) {
  const denied = await denyAwsImageSigning(request)
  if (denied) return denied
  const access = await assertAdmin(request); if ('error' in access) return access.error
  const body = await request.json().catch(() => null) as { contentType?: unknown } | null
  const declaredSize = (body as { declaredSize?: unknown } | null)?.declaredSize
  if (typeof declaredSize !== 'number' || !Number.isSafeInteger(declaredSize) || declaredSize < 1 || declaredSize > 5 * 1024 * 1024) return NextResponse.json({ error: 'Invalid prepared image size.' }, { status: 400 })
  if (body?.contentType !== 'image/webp') return NextResponse.json({ error: 'Invalid Discover Shapes image type.' }, { status: 400 })
  const path = `home/discover-shapes/${crypto.randomUUID()}.webp`
  const { data, error } = await access.adminClient.storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data?.token) return NextResponse.json({ error: 'Unable to prepare upload.' }, { status: 500 })
  return NextResponse.json({ bucket, path, token: data.token })
}
