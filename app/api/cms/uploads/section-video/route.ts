import { selectedMixedVideo } from '@/lib/video-route'

// Short looping banner videos for home page sections and the product page banner (HOD-091).
// Uses the same authenticated, admitted, create-only upload as product videos, with a smaller size limit.
export async function POST(request: Request) {
  const response = await selectedMixedVideo(request, 'section')
  return response ?? Response.json({ error: 'Use the admin video uploader.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
}

export const runtime = 'nodejs'
