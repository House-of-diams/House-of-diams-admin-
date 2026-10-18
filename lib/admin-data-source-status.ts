import 'server-only'
import type { AdminDataGroup } from './admin-data-source'
import { isAdminDataGroup } from './admin-data-source'

// Fixed representative reads only. Never interpolate a requested identifier.
export const adminDataReadProbes: Record<AdminDataGroup, string> = {
  products: 'SELECT 1 FROM public.products LIMIT 1',
  catalog: 'SELECT 1 FROM public.navbar_items LIMIT 1',
  cms: 'SELECT 1 FROM public.about_hero LIMIT 1',
  operations: 'SELECT 1 FROM public.site_settings LIMIT 1',
}

export function createAdminDataSourceStatus(deps: {
  authorized: () => Promise<boolean>
  provider: (group: AdminDataGroup) => 'supabase' | 'rds'
  read: (sql: string) => Promise<void>
}) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie' }
    let source = 'unknown'
    try {
      if (!await deps.authorized()) return Response.json({ source, checked: false }, { status: 401, headers })
      const group = new URL(request.url).searchParams.get('group')
      if (!isAdminDataGroup(group)) return Response.json({ source, checked: false }, { status: 400, headers })
      source = deps.provider(group)
      if (source === 'supabase') return Response.json({ source, checked: false, group }, { headers })
      await deps.read(adminDataReadProbes[group])
      return Response.json({ source, checked: true, group }, { headers })
    } catch {
      return Response.json({ source, checked: false }, { status: 503, headers })
    }
  }
}
