import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  return runCatalogRdsRoute(request, undefined)
}

export async function PUT() {
  return NextResponse.json(
    { error: 'This navbar editor session is outdated. Reload the page before saving.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const runtime = 'nodejs'
