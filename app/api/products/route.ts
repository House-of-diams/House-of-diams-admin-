import { runProductRdsRoute } from '@/lib/product-rds-handlers'
import { NextResponse } from 'next/server'
import type {
  CatalogCategory,
  CatalogCertificate,
  CatalogGstSlab,
  CatalogMetal,
  CatalogMaterialValue,
  CatalogOption,
  CatalogRingCategory,
  CatalogRingCategorySize,
  CatalogStoneShape,
  CatalogStyle,
  CatalogSubcategory,
  ProductRecord,
} from '@/lib/product-catalog'
import { formatCategoryPath } from '@/lib/product-catalog'
import { safeProductSaveError } from '@/lib/product-payload-validation'

type RelatedNameRow = { name?: string | null } | Array<{ name?: string | null }> | null

async function loadCatalog(adminClient: any) {
  const [categoriesResult, subcategoriesResult, optionsResult, metalsResult, materialValuesResult, shapesResult, certificatesResult, ringCategoriesResult, ringCategorySizesResult, stylesResult, gstSlabsResult] = await Promise.all([
    adminClient.from('catalog_categories').select('*'),
    adminClient.from('catalog_subcategories').select('*'),
    adminClient.from('catalog_options').select('*'),
    adminClient.from('catalog_metals').select('*'),
    adminClient.from('catalog_material_values').select('*'),
    adminClient.from('catalog_stone_shapes').select('*'),
    adminClient.from('catalog_certificates').select('*'),
    adminClient.from('catalog_ring_categories').select('*'),
    adminClient.from('catalog_ring_category_sizes').select('*'),
    adminClient.from('catalog_styles').select('*'),
    adminClient.from('catalog_gst_slabs').select('*'),
  ])

  return {
    categories: (categoriesResult.data ?? []) as CatalogCategory[],
    subcategories: (subcategoriesResult.data ?? []) as CatalogSubcategory[],
    options: (optionsResult.data ?? []) as CatalogOption[],
    metals: (metalsResult.data ?? []) as CatalogMetal[],
    materialValues: materialValuesResult.error ? ([] as CatalogMaterialValue[]) : ((materialValuesResult.data ?? []) as CatalogMaterialValue[]),
    shapes: (shapesResult.data ?? []) as CatalogStoneShape[],
    certificates: certificatesResult.error ? ([] as CatalogCertificate[]) : ((certificatesResult.data ?? []) as CatalogCertificate[]),
    ringCategories: ringCategoriesResult.error ? ([] as CatalogRingCategory[]) : ((ringCategoriesResult.data ?? []) as CatalogRingCategory[]),
    ringCategorySizes: ringCategorySizesResult.error ? ([] as CatalogRingCategorySize[]) : ((ringCategorySizesResult.data ?? []) as CatalogRingCategorySize[]),
    styles: stylesResult.error ? ([] as CatalogStyle[]) : ((stylesResult.data ?? []) as CatalogStyle[]),
    gstSlabs: gstSlabsResult.error ? ([] as CatalogGstSlab[]) : ((gstSlabsResult.data ?? []) as CatalogGstSlab[]),
  }
}

export async function GET(request: Request) {
  return runProductRdsRoute('product-all', request)
}

export async function POST(request: Request) {
  return runProductRdsRoute('create', request)
}

export const runtime = 'nodejs'
