import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import {
  loadProductMetalVariantBundle,
} from '@/lib/product-metal-variants'
import { safeProductSaveError } from '@/lib/product-payload-validation'

function productSaveFailure(error: { code?: string | null } | null | undefined) {
  console.error('Product save failed.', { code: error?.code })
  const safe = safeProductSaveError(error)
  return NextResponse.json({ error: safe.message }, { status: safe.status })
}
function isMissingRelation(error: { message?: string | null } | null | undefined, table: string) {
  return (
    error?.message?.includes(`relation "${table}" does not exist`) ||
    error?.message?.includes(`Could not find the table 'public.${table}' in the schema cache`)
  ) ?? false
}

function isPositivePrice(value: unknown) {
  const price = Number(value)
  return Number.isFinite(price) && price > 0
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runProductRdsRoute('read-id', request, (await params).id)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runProductRdsRoute('save-id', request, (await params).id)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runProductRdsRoute('single-delete', request, (await params).id)
}

export const runtime = 'nodejs'
