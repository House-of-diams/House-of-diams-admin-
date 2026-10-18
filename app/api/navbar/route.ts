import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { unstable_noStore as noStore } from 'next/cache'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import { loadNavbarBuilderData } from '@/lib/navbar-data'

export async function GET(request: Request) {
  const rds = await runCatalogRdsRoute(request, undefined); if (rds) return rds

  noStore()
  const access = await assertAdmin(request)
  if ('error' in access) return access.error
  try {
    const payload = await loadNavbarBuilderData(access.adminClient)
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load the navbar editor.' }, { status: 503 })
  }
}

/**
 * The original whole-navbar writer was replaced by the item-scoped editor.
 * Reject obsolete whole-navbar saves before authentication or any database work.
 * The current editor saves through PUT /api/navbar/[id] instead.
 */
export async function PUT() {
  return NextResponse.json(
    { error: 'This navbar editor session is outdated. Reload the page before saving.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const runtime = 'nodejs'
