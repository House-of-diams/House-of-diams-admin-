import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'offers',
    maxBytes: 12 * 1024 * 1024,
    width: 3200,
    quality: 90,
    maxInputPixels: 64_000_000,
  })
}
