import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'collection-page',
    maxBytes: 30 * 1024 * 1024,
    width: 6400,
    // High-quality master: Next Image makes the small per-device copies from it.
    quality: 95,
    maxInputPixels: 64_000_000,
    allowSvg: true,
  })
}
