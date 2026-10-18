import { readImageProvider } from '@/lib/image-provider'
export const dynamic = 'force-dynamic'
export async function GET() {
  try { return Response.json({ provider: readImageProvider() }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: 'Image service unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
}
