import { handleImageUpload } from '@/lib/image-route'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'

export async function POST(request: Request) {
  return handleImageUpload(request, {
    bucket, maxBytes: 6 * 1024 * 1024, rasterWidth: 1200, allowSvg: true,
    buildPath: (extension) => `catalog/subcategories/${crypto.randomUUID()}.${extension}`,
  })
}
