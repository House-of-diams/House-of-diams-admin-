import { authorizeProductRequest } from '@/lib/product-session-runtime'
import { ProductSessionError } from '@/lib/product-session-error'
import { readVideoProvider } from '@/lib/video-provider'
import { resolveAdmittedVideo } from '@/lib/video-admission-runtime'

export async function POST(request: Request) {
  try {
    await authorizeProductRequest(request, true)
    if (readVideoProvider() !== 'aws') throw new Error('Unavailable')
    const reader = request.body?.getReader()
    if (!reader) throw new Error('Invalid selection')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > 4096) { await reader.cancel(); throw new Error('Invalid selection') }
        chunks.push(part.value)
      }
    } finally { reader.releaseLock() }
    const text = Buffer.concat(chunks).toString('utf8')
    const body = JSON.parse(text)
    if (typeof body.url !== 'string' || typeof body.admissionId !== 'string' || Object.keys(body).some(k => !['url','admissionId'].includes(k))) throw new Error('Invalid selection')
    const record = await resolveAdmittedVideo(body.url, body.admissionId)
    return Response.json({ url: record.url, admissionId: record.id }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json({ error: 'Video selection unavailable. Refresh the library.' }, { status: error instanceof ProductSessionError ? error.status : 409, headers: { 'Cache-Control': 'no-store' } })
  }
}
