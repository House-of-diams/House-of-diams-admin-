import { handleImageUpload } from '@/lib/image-route'


export async function POST(request: Request) {
  return handleImageUpload(request, {
    maxBytes: 6 * 1024 * 1024, rasterWidth: 1200, allowSvg: true,
    buildPath: (extension) => `catalog/subcategories/${crypto.randomUUID()}.${extension}`,
  })
}
