import { NextResponse } from 'next/server'
import { z } from 'zod'
import { handleImageUpload } from '@/lib/image-route'
import { HOVER_FRAME_COUNT } from '@/lib/product-media-extras'

const frameFields = z.object({ version: z.coerce.number().int().min(1).max(1_000_000), index: z.coerce.number().int().min(0).max(HOVER_FRAME_COUNT - 1) })
const readFields = (form: FormData) => frameFields.safeParse({ version: form.get('version'), index: form.get('index') })

// One hover-view frame per request. The server re-encodes it (type check, size limit, WebP) before storing it,
// under a folder that includes the product and the version, so a new upload never overwrites a live set.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id)
  if (!id.success) return NextResponse.json({ error: 'Invalid product ID.' }, { status: 400 })
  return handleImageUpload(request, {
    maxBytes: 3 * 1024 * 1024,
    rasterWidth: 1000,
    preserveAspectRatio: true,
    quality: 82,
    validateForm: form => (readFields(form).success ? null : 'A valid frame number and version are required.'),
    buildPath: (_extension, form) => {
      const fields = readFields(form)
      if (!fields.success) throw new Error('Invalid frame fields.')
      return `products/hover/${id.data}/v${fields.data.version}/${String(fields.data.index).padStart(2, '0')}.webp`
    },
  }, 'product')
}

export const runtime = 'nodejs'
