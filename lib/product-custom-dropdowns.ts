
export type ProductCustomDropdownOption = {
  id: string
  label: string
  value: string
  is_enabled: boolean
  display_order: number
}

export type ProductCustomDropdown = {
  id: string
  name: string
  label: string
  is_enabled: boolean
  is_required: boolean
  display_order: number
  options: ProductCustomDropdownOption[]
}

function hasDropdownContent(group: ProductCustomDropdown) {
  return Boolean(
    group.name.trim() ||
    group.label.trim() ||
    group.options.some((option) => option.label.trim() || option.value.trim())
  )
}

function normalizedKey(label: string, fallback: string) {
  return label
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback
}

function uniqueKey(base: string, used: Set<string>) {
  let candidate = base
  let suffix = 2
  while (used.has(candidate.toLowerCase())) candidate = `${base}_${suffix++}`
  used.add(candidate.toLowerCase())
  return candidate
}

export function normalizeProductCustomDropdowns(groups: ProductCustomDropdown[]) {
  const contentGroups = groups
    .filter(hasDropdownContent)
    .map((group) => ({
      ...group,
      name: group.name.trim(),
      label: group.label.trim(),
      options: group.options
        .filter((option) => option.label.trim() || option.value.trim())
        .map((option) => ({
          ...option,
          label: option.label.trim(),
          value: option.value.trim(),
        })),
    }))

  // Reserve stored identifiers first so newly generated ones can never replace or
  // collide with the stable values used by existing carts and orders.
  const usedNames = new Set(contentGroups.map((group) => group.name.toLowerCase()).filter(Boolean))
  return contentGroups.map((group) => {
    const name = group.name || uniqueKey(normalizedKey(group.label, 'dropdown'), usedNames)
    const usedValues = new Set(group.options.map((option) => option.value.toLowerCase()).filter(Boolean))
    const options = group.options.map((option) => ({
      ...option,
      value: option.value || uniqueKey(normalizedKey(option.label, 'option'), usedValues),
    }))
    return { ...group, name, options }
  })
}

export function validateProductCustomDropdowns(groups: ProductCustomDropdown[]) {
  const names = new Set<string>()
  const enabledGroups = normalizeProductCustomDropdowns(groups).filter((group) => group.is_enabled)
  if (!enabledGroups.length) return 'Add at least one enabled custom dropdown, or disable custom product dropdowns.'

  for (const group of enabledGroups) {
    const name = group.name.trim().toLowerCase()
    if (!group.label.trim()) return 'Every enabled dropdown needs a customer label.'
    if (names.has(name)) return 'Each enabled dropdown needs a unique customer label.'
    names.add(name)
    const values = new Set<string>()
    const enabled = group.options.filter((option) => option.is_enabled)
    if (!enabled.length) return `“${group.label.trim()}” needs at least one enabled option.`
    for (const option of enabled) {
      const value = option.value.trim().toLowerCase()
      if (!option.label.trim()) return `Every enabled option in “${group.label.trim()}” needs a customer-visible label.`
      if (values.has(value)) return `Each enabled option in “${group.label.trim()}” needs a unique label.`
      values.add(value)
    }
  }
  return null
}

