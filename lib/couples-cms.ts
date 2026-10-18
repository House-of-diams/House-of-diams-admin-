import { tryUploadAwsImage } from '@/lib/image-transport'
import { cmsFetch } from '@/lib/cms-transport'

export type CoupleSection = {
  section_key: string
  eyebrow: string
  heading: string
  subtitle: string
}

export type CoupleItem = {
  clientId: string
  id?: number | string
  sort_order: number
  names: string
  location: string
  story: string
  product_name: string
  product_link: string
  product_detail: string
  image_path: string
}

type CouplesPayload = {
  section?: CoupleSection
  items?: Array<{
    id: number | string
    sort_order: number
    names: string
    location: string
    story: string
    product_name: string
    product_link: string
    product_detail: string
    image_path: string
  }>
  error?: string
}

export const defaultCoupleSection: CoupleSection = {
  section_key: 'home_couples',
  eyebrow: 'Love Stories',
  heading: 'Our Cute Couples',
  subtitle: 'Real couples. Real proposals. Real diamonds. Every ring tells a story.',
}

export function emptyCouple(sortOrder: number): CoupleItem {
  return {
    clientId: `draft-${Date.now()}`,
    sort_order: sortOrder,
    names: '',
    location: '',
    story: '',
    product_name: '',
    product_link: '',
    product_detail: '',
    image_path: '',
  }
}

export async function getAdminAccessToken() {
  const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function loadCouples() {



  const response = await cmsFetch('/api/cms/home/couples', {
    headers: {  },
  })
  const payload = (await response.json().catch(() => null)) as CouplesPayload | null

  if (!response.ok) {
    return { error: payload?.error ?? 'Unable to load couples.' } as const
  }

  return {
    section: payload?.section ?? defaultCoupleSection,
    items: (payload?.items ?? []).map((item) => ({
      clientId: `id-${item.id}`,
      id: item.id,
      sort_order: Number(item.sort_order ?? 0),
      names: item.names ?? '',
      location: item.location ?? '',
      story: item.story ?? '',
      product_name: item.product_name ?? '',
      product_link: item.product_link ?? '',
      product_detail: item.product_detail ?? '',
      image_path: item.image_path ?? '',
    })),
  } as const
}

export async function saveCouples(section: Omit<CoupleSection, 'section_key'>, items: CoupleItem[]) {



  const sortedItems = [...items].sort((a, b) => a.sort_order - b.sort_order || a.clientId.localeCompare(b.clientId))
  const response = await cmsFetch('/api/cms/home/couples', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',

    },
    body: JSON.stringify({
      section,
      items: sortedItems.map(({ sort_order, names, location, story, product_name, product_link, product_detail, image_path }) => ({
        sort_order,
        names,
        location,
        story,
        product_name,
        product_link,
        product_detail,
        image_path,
      })),
    }),
  })

  const payload = (await response.json().catch(() => null)) as CouplesPayload | null
  if (!response.ok) {
    return { error: payload?.error ?? 'Unable to save couples.' } as const
  }

  return { ok: true } as const
}

export async function uploadCoupleImage(file: File) {

    try {
      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/couples', {})
      if (awsPath) { return {path: awsPath} as const }
    } catch (error) { return {error: error instanceof Error ? error.message : 'Unable to upload image.'} as const }


  const token = await getAdminAccessToken()
  if (!token) return { error: 'You are not signed in.' } as const

  if (file.size > 5 * 1024 * 1024) return { error: 'File too large. Max size is 5MB.' } as const

  const { supabase } = await import('@/lib/supabase')
    try {
    const preparedFile = await prepareCoupleImage(file)
    const signResponse = await fetch('/api/cms/uploads/couples/sign', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: preparedFile.type, declaredSize: preparedFile.size }),
    })
    const signed = await signResponse.json().catch(() => null) as { bucket?: string; path?: string; token?: string; error?: string } | null
    if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.token) throw new Error(signed?.error ?? 'Unable to prepare upload.')
    const { error } = await supabase.storage.from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, preparedFile, { contentType: preparedFile.type })
    if (error) throw error
    return { path: signed.path } as const
  } catch {
    // Preserve the established server upload as an operational fallback.
  }

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/cms/uploads/couples', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: formData,
  })

  const payload = (await response.json().catch(() => null)) as { path?: string; error?: string } | null
  if (!response.ok || !payload?.path) {
    return { error: payload?.error ?? 'Unable to upload image.' } as const
  }

  return { path: payload.path } as const
}

async function prepareCoupleImage(file: File) {
  if (file.type === 'image/svg+xml') return file
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Invalid image type.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const width = Math.min(bitmap.width, 1600)
    const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!blob) throw new Error('Unable to optimize image.')
    return new File([blob], `${crypto.randomUUID()}.webp`, { type: 'image/webp' })
  } finally {
    bitmap.close()
  }
}
