import { runCatalogRdsRoute } from '@/lib/catalog-rds-handlers'
import { NextResponse } from 'next/server'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runCatalogRdsRoute(request, (await params).id)
}

export function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}

export const runtime = 'nodejs'
