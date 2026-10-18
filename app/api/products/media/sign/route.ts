import { denyAwsImageSigning } from '@/lib/image-route'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import { createPresignedProductImageUpload, isR2Configured } from '@/lib/r2'
import { productMediaSignSchema } from '@/lib/product-operations-validation'
import { isS3MediaConfigured } from '@/lib/s3-media'

export async function POST(request: Request) {
  const denied = await denyAwsImageSigning(request)
  if (denied) return denied
  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const input = productMediaSignSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: input.error.issues[0]?.message ?? 'Invalid direct image upload request.' }, { status: 400 })

  if (isS3MediaConfigured()) return NextResponse.json({ error: 'Use the authenticated AWS media upload endpoint.' }, { status: 503 })
  if (!isR2Configured()) return NextResponse.json({ error: 'Direct image uploads are temporarily unavailable.' }, { status: 503 })
  try {
    const signed = await createPresignedProductImageUpload(input.data)
    return NextResponse.json({ provider: 'r2', path: signed.url, url: signed.url, uploadUrl: signed.uploadUrl, contentType: input.data.contentType }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to prepare the direct image upload.' }, { status: 500 })
  }
}
