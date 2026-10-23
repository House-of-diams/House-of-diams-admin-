import { selectedMixedImage } from '@/lib/image-mixed-route'
import { selectedMixedVideo } from '@/lib/video-route'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const selectedImage = await selectedMixedImage(request, 'about')
  if (selectedImage) return selectedImage
  const selectedVideo = await selectedMixedVideo(request, 'about')
  if (selectedVideo) return selectedVideo
  // Legacy (non-AWS) upload protocols no longer exist.
  return NextResponse.json({ error: 'Use the authenticated upload protocol.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } })
}
