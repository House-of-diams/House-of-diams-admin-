import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { safeProductSaveError } from '@/lib/product-payload-validation'

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
