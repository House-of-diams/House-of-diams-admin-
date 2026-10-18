import { handleImageUpload } from '@/lib/image-route'

const bucket = process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod'

export async function POST(request: Request) {

  return handleImageUpload(request, {
    bucket,
    maxBytes: 8 * 1024 * 1024,
    rasterWidth: 1400,
    rasterHeight: 1750,
    rasterFit: 'cover',
    allowSvg: true,
    validateForm: (form) => {
      const kind = form.get('kind')
      const file = form.get('file')
      if (!(file instanceof File)) return 'Missing image file.'
      if (kind === 'icon') {
        if (file.type !== 'image/svg+xml') return 'Only SVG icons are allowed.'
        if (file.size > 512 * 1024) return 'Icons must be 512 KB or smaller.'
        return null
      }
      if (kind === 'image' && file.type !== 'image/svg+xml') return null
      return 'Invalid upload kind or image type.'
    },
    buildPath: (extension, form) =>
      `values/${form.get('kind') === 'icon' ? 'icons' : 'images'}/${crypto.randomUUID()}.${extension}`,
  })
}
