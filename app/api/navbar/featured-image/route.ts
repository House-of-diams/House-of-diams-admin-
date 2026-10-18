import { handleImageUpload } from '@/lib/image-route'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'

export async function POST(request: Request) {
  return handleImageUpload(request, {
    bucket, maxBytes: 8 * 1024 * 1024, rasterWidth: 1800,
    buildPath: () => `navbar/featured/${crypto.randomUUID()}.webp`,
  })
}
