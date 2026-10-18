const MAX_SUFFIX_ATTEMPTS = 10_000

export function buildProductSlugBase(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  if (!base) throw new Error('Product name must contain characters that can form a public URL slug.')
  return base
}

export function getRetiredProductSlug(sourcePath: string) {
  const pathname = sourcePath.split('?', 1)[0]
  return pathname.startsWith('/shop/') ? pathname.slice('/shop/'.length) : null
}

export function selectAvailableProductSlug(base: string, unavailableSlugs: Iterable<string>) {
  const unavailable = new Set(unavailableSlugs)
  for (let suffix = 1; suffix <= MAX_SUFFIX_ATTEMPTS; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`
    if (!unavailable.has(candidate)) return candidate
  }
  throw new Error(`Unable to allocate a unique product slug for "${base}".`)
}
