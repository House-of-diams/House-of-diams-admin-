import { selectedMixedImage } from '@/lib/image-mixed-route'
import { NextResponse } from 'next/server'

const maxFileSize = 10 * 1024 * 1024
export async function POST(request: Request) {
  const selectedImage = await selectedMixedImage(request, 'bespoke')
  if (selectedImage) return selectedImage
  // Legacy (non-AWS) upload protocols no longer exist.
  return NextResponse.json({ error: 'Use the authenticated upload protocol.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
}
