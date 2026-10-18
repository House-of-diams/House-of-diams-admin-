import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdmin } from '@/lib/cms-auth'
import { loadInventoryItems } from '@/lib/inventory-data'

export async function GET(request: Request) {
  const rds = await runProductRdsRoute('inventory-list', request)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { searchParams } = new URL(request.url)
  const parsedQuery = z.string().max(200).safeParse(searchParams.get('q') ?? '')
  if (!parsedQuery.success) return NextResponse.json({ error: 'Search query is too long.' }, { status: 400 })
  try {
    const items = await loadInventoryItems(access.adminClient, parsedQuery.data)
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to load inventory.' }, { status: 503 })
  }
}

export const runtime = 'nodejs'
