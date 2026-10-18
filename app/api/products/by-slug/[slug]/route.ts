import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import { validateProductCustomDropdowns } from '@/lib/product-custom-dropdowns'
import { loadProductEditorItem } from '@/lib/product-editor-data'
import { validateProductMasterReferences } from '@/lib/product-master-validation'
import { productPayloadErrorMessage, productPayloadSchema, safeProductSaveError } from '@/lib/product-payload-validation'
import { prepareProductSavePayload, saveProductAtomically } from '@/lib/product-save'

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
  const rds = await runProductRdsRoute('read-slug', request, (await params).slug)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { slug } = await params
  const result = await loadProductEditorItem(access.adminClient, slug)
  if (result.status === 'not_found') {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  }
  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 500 })
  }
  return NextResponse.json({ item: result.item })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rds = await runProductRdsRoute('save-slug', request, (await params).slug)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { slug } = await params
  const { adminClient } = access
  const productIdResult = await getProductIdBySlug(adminClient, slug)

  if (productIdResult.error || !productIdResult.data?.id) {
    if (productIdResult.error) return productSaveFailure(productIdResult.error)
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 })
  }

  const id = productIdResult.data.id
  const parsedBody = productPayloadSchema.safeParse(await request.json().catch(() => null))
  if (!parsedBody.success) return NextResponse.json({ error: productPayloadErrorMessage(parsedBody.error) }, { status: 400 })
  const body = parsedBody.data
  const customDropdownError = body.custom_dropdowns_enabled ? validateProductCustomDropdowns(body.custom_dropdowns) : null
  if (customDropdownError) return NextResponse.json({ error: customDropdownError }, { status: 400 })

  const masterValidation = await validateProductMasterReferences(adminClient, body)
  if (!masterValidation.ok) {
    return NextResponse.json({ error: masterValidation.message }, { status: 400 })
  }

  const variantRows = body.metal_variants ?? []
  const resolvedMetalIds =
    variantRows.length > 0
      ? [...new Set(variantRows.map((entry) => entry.metal_id).filter(Boolean))]
      : (body.metal_ids ?? [])
  const defaultVariant =
    variantRows.find((entry) => entry.is_default) ??
    variantRows[0] ??
    null
  const resolvedBasePrice =
    defaultVariant && Number.isFinite(Number(defaultVariant.price))
      ? Number(defaultVariant.price)
      : body.base_price

  if (!Number.isFinite(resolvedBasePrice) || Number(resolvedBasePrice) <= 0) {
    return NextResponse.json({ error: 'Base price must be greater than 0. Add a price to the default metal option before saving.' }, { status: 400 })
  }

  const atomicPayload = prepareProductSavePayload(body, Number(resolvedBasePrice), resolvedMetalIds)
  const atomicResult = await saveProductAtomically(adminClient, {
    actorId: access.user.id,
    productId: id,
    payload: atomicPayload,
  })
  if (atomicResult.error) return productSaveFailure(atomicResult.error)
  return NextResponse.json(atomicResult.data, { headers: { 'Cache-Control': 'no-store' } })

}

export const runtime = 'nodejs'
