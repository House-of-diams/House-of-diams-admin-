import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import { saveNavbarItem } from '@/lib/navbar-save'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runCatalogRdsRoute(request, (await params).id); if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error
  const { id } = await params
  return saveNavbarItem(access, id, await request.json().catch(() => null))
}

export function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}

export const runtime = 'nodejs'
