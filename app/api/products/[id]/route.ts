import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import { assertAdmin } from '@/lib/cms-auth'
import type { ProductRecord } from '@/lib/product-catalog'
import { loadProductLinkSelections } from '@/lib/product-catalog-links'
import {
  loadProductMetalVariantBundle,
} from '@/lib/product-metal-variants'
import { loadProductFaqItems } from '@/lib/product-faqs'
import { loadProductCustomDropdowns, validateProductCustomDropdowns } from '@/lib/product-custom-dropdowns'
import { validateProductMasterReferences } from '@/lib/product-master-validation'
import { productPayloadErrorMessage, productPayloadSchema, safeProductSaveError } from '@/lib/product-payload-validation'
import { prepareProductSavePayload, saveProductAtomically } from '@/lib/product-save'

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
  const rds = await runProductRdsRoute('read-id', request, (await params).id)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { id } = await params
  const { adminClient } = access

  const [productResult, metalsResult, materialValuesResult, purityPricesResult, metalMediaResult, linkSelections, metalVariantBundle, faqItems, customDropdowns] = await Promise.all([
    adminClient.from('products').select('*').eq('id', id).single(),
    adminClient.from('product_metal_selections').select('metal_id').eq('product_id', id).order('sort_order', { ascending: true }),
    adminClient.from('product_material_value_selections').select('material_value_id').eq('product_id', id).order('sort_order', { ascending: true }),
    adminClient.from('product_purity_prices').select('*').eq('product_id', id).order('sort_order', { ascending: true }),
    adminClient.from('product_metal_media').select('*').eq('product_id', id),
    loadProductLinkSelections(adminClient, id),
    loadProductMetalVariantBundle(adminClient, id),
    loadProductFaqItems(adminClient, id),
    loadProductCustomDropdowns(adminClient, id),
  ])

  if (productResult.error) return NextResponse.json({ error: productResult.error.message }, { status: 500 })
  if (customDropdowns.error) return NextResponse.json({ error: customDropdowns.error }, { status: 500 })

  const shapeResult = await adminClient.from('product_stone_shapes').select('shape_id').eq('product_id', id)
  const shapeIds = shapeResult.error && isMissingRelation(shapeResult.error, 'product_stone_shapes')
    ? []
    : (shapeResult.data ?? []).map((item) => item.shape_id)

  return NextResponse.json({
    item: {
      ...(productResult.data as ProductRecord),
      metal_ids: (metalsResult.data ?? []).map((item) => item.metal_id),
      linked_subcategory_ids: linkSelections.linkedSubcategoryIds,
      linked_option_ids: linkSelections.linkedOptionIds,
      material_value_ids:
        materialValuesResult.error && isMissingRelation(materialValuesResult.error, 'product_material_value_selections')
          ? []
          : (materialValuesResult.data ?? []).map((item) => item.material_value_id),
      shape_ids: shapeIds,
      purity_prices: purityPricesResult.error && isMissingRelation(purityPricesResult.error, 'product_purity_prices') ? [] : (purityPricesResult.data ?? []),
      metal_media: metalMediaResult.error && isMissingRelation(metalMediaResult.error, 'product_metal_media') ? [] : (metalMediaResult.data ?? []),
      metal_variants: metalVariantBundle.metalVariants,
      default_variant_media_items: metalVariantBundle.defaultVariantMediaItems,
      faq_items: faqItems,
      custom_dropdowns: customDropdowns.data ?? [],
    },
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runProductRdsRoute('save-id', request, (await params).id)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { id } = await params
  const { adminClient } = access
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

  if (!isPositivePrice(resolvedBasePrice)) {
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rds = await runProductRdsRoute('single-delete', request, (await params).id)
  if (rds) return rds

  const access = await assertAdmin(request)
  if ('error' in access) return access.error

  const { id } = await params
  const { error } = await access.adminClient.from('products').delete().eq('id', id)
  if (error) {
    const blockedByReservation = error.code === '23503' && error.message.includes('inventory_reservations')
    return NextResponse.json(
      {
        error: blockedByReservation
          ? 'This product has active inventory reservations. Apply the product reservation deletion migration, then try again.'
          : error.message,
      },
      { status: blockedByReservation ? 409 : 500 },
    )
  }
  return NextResponse.json({ ok: true })
}

export const runtime = 'nodejs'
