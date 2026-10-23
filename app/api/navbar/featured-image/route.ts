import { handleImageUpload } from '@/lib/image-route'


export async function POST(request: Request) {
  return handleImageUpload(request, {
    maxBytes: 8 * 1024 * 1024, rasterWidth: 1800,
    buildPath: () => `navbar/featured/${crypto.randomUUID()}.webp`,
  })
}
