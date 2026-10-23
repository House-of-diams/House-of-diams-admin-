import 'server-only'
import { readImageProvider } from './image-provider'
import { handleImageUpload } from './image-route'

/** The marker selects only the image branch; authority still comes from server mode + B1. */
export async function selectedMixedImage(request: Request, context: 'product' | 'bespoke' | 'about'): Promise<Response | null> {
  if (request.headers.get('x-admin-image-upload') !== '1') return null
  try { readImageProvider() }
  catch { return Response.json({ error: 'Image service unavailable.' }, { status: 503 }) }
  return handleImageUpload(request, {
    bucket: process.env.SUPABASE_COLLECTION_BUCKET ?? 'hod',
    maxBytes: (context === 'product' ? 25 : context === 'bespoke' ? 10 : 8) * 1024 * 1024,
    rasterWidth: context === 'about' ? 2400 : 2200,
    preserveAspectRatio: context === 'about',
    quality: context === 'about' ? 86 : 84,
    successStatus: context === 'about' ? 200 : 201,
    validateForm: form => {
      const kind = form.get('kind')
      if (kind !== 'image' && !(context === 'about' && kind === 'poster')) return 'Invalid image upload kind.'
      if (context === 'product' && !['products', 'hiphop'].includes(String(form.get('folder')))) return 'Invalid product media folder.'
      return null
    },
    buildPath: (extension, form) => context === 'product'
      ? `${form.get('folder')}/images/${crypto.randomUUID()}.${extension}`
      : context === 'bespoke' ? `bespoke/images/${crypto.randomUUID()}.${extension}`
        : `about/hero/${form.get('kind')}/${crypto.randomUUID()}.${extension}`,
  }, context === 'product' ? 'product' : 'content')
}

/** Old callers may still send bearer requests, but selected AWS images never write legacy storage. */
export function denyLegacyImageInAwsMode(): Response {
  try {
    readImageProvider()
    return Response.json({ error: 'Use the authenticated image upload protocol.' }, { status: 409 })
  } catch { return Response.json({ error: 'Image service unavailable.' }, { status: 503 }) }
}
