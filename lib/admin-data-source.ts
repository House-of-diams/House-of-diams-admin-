export type AdminDataGroup = 'products' | 'catalog' | 'cms' | 'operations'
export type AdminPageDataGroup = AdminDataGroup | 'demo' | 'local' | 'unknown'

export function adminPageDataGroup(pathname: string): AdminPageDataGroup {
  const section = pathname.split('/')[2]
  if (pathname !== '/dashboard' && !pathname.startsWith('/dashboard/')) return 'unknown'
  if (['products', 'collection-products', 'inventory'].includes(section)) return 'products'
  if (['catalog', 'navbar-builder'].includes(section)) return 'catalog'
  if (['cms', 'bespoke'].includes(section)) return 'cms'
  if (['media', 'crm'].includes(section)) return 'demo'
  if (section === 'search') return 'local'
  if (!section || ['orders', 'customers', 'enquiries', 'notifications', 'coupons', 'settings'].includes(section)) return 'operations'
  return 'unknown'
}

export function isAdminDataGroup(value: string | null): value is AdminDataGroup {
  return value !== null && ['products', 'catalog', 'cms', 'operations'].includes(value)
}

export function dataSourcePresentation(source: string, checked: boolean) {
  if (source === 'supabase') return { text: 'Supabase', tone: 'legacy' as const }
  if (source === 'rds' && checked) return { text: 'RDS read verified', tone: 'verified' as const }
  if (source === 'rds') return { text: 'RDS read unavailable', tone: 'error' as const }
  return { text: 'Data source unavailable', tone: 'error' as const }
}
