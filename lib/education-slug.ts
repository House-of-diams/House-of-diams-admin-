type EducationSlugClient = {
  from: (table: 'education_posts') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: { id: number } | null; error: { message?: string } | null }>
      }
    }
  }
}

export function createEducationSlug(title: string) {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return slug || `education-${Date.now()}`
}

export function isCleanEducationSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}

export async function createUniqueEducationSlug(
  adminClient: EducationSlugClient,
  title: string,
  currentPostId?: number
) {
  const baseSlug = createEducationSlug(title)
  let slug = baseSlug
  let suffix = 2

  while (true) {
    const { data, error } = await adminClient
      .from('education_posts')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw new Error(error.message ?? 'Unable to validate education URL.')
    if (!data || data.id === currentPostId) return slug

    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }
}
