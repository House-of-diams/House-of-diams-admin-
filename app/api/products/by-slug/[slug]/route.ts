import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { safeProductSaveError } from '@/lib/product-payload-validation'

function productSaveFailure(error: { code?: string | null } | null | undefined) {
  console.error('Product save failed.', { code: error?.code })
  const safe = safeProductSaveError(error)
  return NextResponse.json({ error: safe.message }, { status: safe.status })
}
async function getProductIdBySlug(adminClient: any, slug: string) {
  const slugResult = await adminClient.from('products').select('id').eq('slug', slug).maybeSingle()
  if (slugResult.data?.id || slugResult.error) return slugResult
  return adminClient.from('products').select('id').eq('id', slug).maybeSingle()
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return runProductRdsRoute('read-slug', request, (await params).slug)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return runProductRdsRoute('save-slug', request, (await params).slug)
}

export const runtime = 'nodejs'
