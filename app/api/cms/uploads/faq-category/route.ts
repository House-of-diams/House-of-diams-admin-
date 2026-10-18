import { handleCmsImageUpload } from '@/lib/cms-image-upload-route'

export async function POST(request: Request) {
  return handleCmsImageUpload(request, {
    prefix: 'support/faq-categories',
    maxBytes: 5 * 1024 * 1024,
    width: 1200,
    allowSvg: true,
  })
}
