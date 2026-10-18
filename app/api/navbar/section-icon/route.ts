import { handleImageUpload } from '@/lib/image-route'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'

export async function POST(request: Request) {
  return handleImageUpload(request, {
    bucket, maxBytes: 1024 * 1024, rasterWidth: 512, allowSvg: true, svgOnly: true,
    buildPath: () => `navbar/sections/${crypto.randomUUID()}.svg`,
  })
}
