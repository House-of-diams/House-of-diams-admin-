import { handleImageUpload } from '@/lib/image-route'


export async function POST(request: Request) {
  return handleImageUpload(request, {
    maxBytes: 1024 * 1024, rasterWidth: 512, allowSvg: true, svgOnly: true,
    buildPath: () => `catalog/styles/${crypto.randomUUID()}.svg`,
  })
}
