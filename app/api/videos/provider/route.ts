import { createHash } from 'node:crypto'
import { readVideoProvider, videoSources, videoNamespace, legacyVideoNamespace } from '@/lib/video-provider'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export async function GET() {
  try {
    const provider = readVideoProvider()
    const namespace = createHash('sha256').update(provider === 'aws' ? videoNamespace(videoSources()) : legacyVideoNamespace()).digest('hex')
    return Response.json({ provider, namespace }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Video service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
