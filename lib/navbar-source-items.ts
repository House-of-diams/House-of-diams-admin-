const expectedSourceKinds = {
  'Subcategory Options': 'subcategory_option',
  'Metal Swatches': 'metal',
  'Stone Shapes': 'stone_shape',
  'Ring Sizes': 'ring_size',
  Certificates: 'certificate',
  Styles: 'style',
} as const

export function filterNavbarSectionSourceItems<T extends { sourceKind: string; sourceItemId: string }>(type: string, sourceItems: T[]) {
  const expectedKind = expectedSourceKinds[type as keyof typeof expectedSourceKinds]
  return sourceItems.filter((entry) => Boolean(entry.sourceItemId) && entry.sourceKind === expectedKind)
}
