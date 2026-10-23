import { uploadAwsImage } from '@/lib/image-transport'
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
  if (file.size > 5 * 1024 * 1024) return { error: 'File too large. Max size is 5MB.' } as const
  try {
    return { path: await uploadAwsImage(file, '/api/cms/uploads/couples', {}) } as const
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to upload image.' } as const
  }
}
