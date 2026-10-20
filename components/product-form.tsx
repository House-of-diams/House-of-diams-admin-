'use client'

import { tryUploadAwsImage } from '@/lib/image-transport'
import { resolveStoredImage } from '@/lib/image-reference'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Plus, Trash2, Video, X } from 'lucide-react'
import { productFetch } from '@/lib/product-transport'
import { useToast } from '@/hooks/use-toast'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  ProductContentRule,
  CatalogStyle,
  CatalogSubcategory,
  ProductDetailSection,
  ProductFaqItem,
  ProductKeyValue,
  ProductMetalMedia,
  ProductMetalVariant,
  ProductPurityPrice,
  ProductVariantMediaItem,
} from '@/lib/product-catalog'
import { formatCategoryPath } from '@/lib/product-catalog'
import { buildCombinedMetalDisplayLabel } from '@/lib/product-metal-variants'
import { ProductAttributesStep } from '@/components/product-form/ProductAttributesStep'
import { ProductBasicInfoCard } from '@/components/product-form/ProductBasicInfoCard'
import { ProductCategoryCard } from '@/components/product-form/ProductCategoryCard'
import { ProductExperienceCard } from '@/components/product-form/ProductExperienceCard'
import { ProductLaneRuleCards } from '@/components/product-form/ProductLaneRuleCards'
import { ProductMetalOptionsCard } from '@/components/product-form/ProductMetalOptionsCard'
import { ProductPricingSummaryCard } from '@/components/product-form/ProductPricingSummaryCard'
import { FormField } from '@/components/product-form/ProductFormControls'
import { ProductContentStep } from '@/components/product-form/ProductContentStep'
import { ProductDetailsStep } from '@/components/product-form/ProductDetailsStep'
import { VideoLibraryDialog } from '@/components/product-form/VideoLibraryDialog'
import { tryUploadAwsVideo, invalidateClientVideoLibrary } from '@/lib/video-transport'
import { ProductFormStepActions, ProductFormStepBar } from '@/components/product-form/ProductFormStepNavigation'
import { ProductFormHeader, ProductFormRedirectOverlay } from '@/components/product-form/ProductFormChrome'
import { ProductFormLoadingShell, ProductFormSkeleton } from '@/components/product-form/ProductFormLoadingStates'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { deleteCachedQueryData, fetchCachedQuery, getCachedQueryData, setCachedQueryData } from '@/lib/query-cache'
import type { ProductCustomDropdown } from '@/lib/product-custom-dropdowns'
import { validateProductCustomDropdowns } from '@/lib/product-custom-dropdowns'
import {
  serializeProductCustomDropdowns,
  serializeProductFaqItems,
  serializeProductMetalMedia,
  serializeProductMetalVariants,
  serializeProductPurityPrices,
  serializeProductVariantMediaItems,
} from '@/lib/product-save-payload'
import {
  getProductEditorCacheKey,
  normalizeProductEditorItem,
  type ProductEditorItem,
} from '@/lib/product-editor'

export type BootstrapPayload = {
  categories?: CatalogCategory[]
  subcategories?: CatalogSubcategory[]
  options?: CatalogOption[]
  metals?: CatalogMetal[]
  materialValues?: CatalogMaterialValue[]
  stoneShapes?: CatalogStoneShape[]
  gstSlabs?: CatalogGstSlab[]
  ringCategories?: CatalogRingCategory[]
  ringCategorySizes?: CatalogRingCategorySize[]
  certificates?: CatalogCertificate[]
  styles?: CatalogStyle[]
  productContentRules?: ProductContentRule[]
}

function applyBootstrapPayload(
  payload: BootstrapPayload | null | undefined,
  setters: {
    setCategories: Dispatch<SetStateAction<CatalogCategory[]>>
    setSubcategories: Dispatch<SetStateAction<CatalogSubcategory[]>>
    setOptions: Dispatch<SetStateAction<CatalogOption[]>>
    setMetals: Dispatch<SetStateAction<CatalogMetal[]>>
    setMaterialValues: Dispatch<SetStateAction<CatalogMaterialValue[]>>
    setStoneShapes: Dispatch<SetStateAction<CatalogStoneShape[]>>
    setGstSlabs: Dispatch<SetStateAction<CatalogGstSlab[]>>
    setRingCategories: Dispatch<SetStateAction<CatalogRingCategory[]>>
    setRingCategorySizes: Dispatch<SetStateAction<CatalogRingCategorySize[]>>
    setCertificates: Dispatch<SetStateAction<CatalogCertificate[]>>
    setStyles: Dispatch<SetStateAction<CatalogStyle[]>>
    setShippingRules: Dispatch<SetStateAction<ProductContentRule[]>>
    setCareWarrantyRules: Dispatch<SetStateAction<ProductContentRule[]>>
  }
) {
  if (!payload) return

  if (payload.categories) setters.setCategories(payload.categories)
  if (payload.subcategories) setters.setSubcategories(payload.subcategories)
  if (payload.options) setters.setOptions(payload.options)
  if (payload.metals) setters.setMetals(payload.metals)
  if (payload.materialValues) setters.setMaterialValues(payload.materialValues)
  if (payload.stoneShapes) setters.setStoneShapes(payload.stoneShapes)
  if (payload.gstSlabs) setters.setGstSlabs(payload.gstSlabs)
  if (payload.ringCategories) setters.setRingCategories(payload.ringCategories)
  if (payload.ringCategorySizes) setters.setRingCategorySizes(payload.ringCategorySizes)
  if (payload.certificates) setters.setCertificates(payload.certificates)
  if (payload.styles) setters.setStyles(payload.styles)
  if (payload.productContentRules) {
    setters.setShippingRules(payload.productContentRules.filter((item) => item.kind === 'shipping'))
    setters.setCareWarrantyRules(payload.productContentRules.filter((item) => item.kind === 'care_warranty'))
  }
}

function applyProductPayload(
  item: ProductEditorItem | null | undefined,
  setters: {
    setName: Dispatch<SetStateAction<string>>
    setSku: Dispatch<SetStateAction<string>>
    setProductLane: Dispatch<SetStateAction<'standard' | 'hiphop' | 'collection'>>
    setDetailTemplate: Dispatch<SetStateAction<'standard' | 'hiphop'>>
    setFeatured: Dispatch<SetStateAction<boolean>>
    setBasePrice: Dispatch<SetStateAction<string>>
    setDiscountPrice: Dispatch<SetStateAction<string>>
    setGstSlabId: Dispatch<SetStateAction<string>>
    setStockQuantity: Dispatch<SetStateAction<string>>
    setAllowCheckout: Dispatch<SetStateAction<boolean>>
    setDescription: Dispatch<SetStateAction<string>>
    setTagLine: Dispatch<SetStateAction<string>>
    setSeoTitle: Dispatch<SetStateAction<string>>
    setSeoDescription: Dispatch<SetStateAction<string>>
    setH1Title: Dispatch<SetStateAction<string>>
    setMainCategoryId: Dispatch<SetStateAction<string>>
    setSubcategoryId: Dispatch<SetStateAction<string>>
    setOptionId: Dispatch<SetStateAction<string>>
    setLinkedSubcategoryIds: Dispatch<SetStateAction<string[]>>
    setLinkedOptionIds: Dispatch<SetStateAction<string[]>>
    setStyleId: Dispatch<SetStateAction<string>>
    setSelectedMetalIds: Dispatch<SetStateAction<string[]>>
    setSelectedPurities: Dispatch<SetStateAction<string[]>>
    setPurityPrices: Dispatch<SetStateAction<ProductPurityPrice[]>>
    setDefaultPurityPriceId: Dispatch<SetStateAction<string>>
    setMetalMedia: Dispatch<SetStateAction<ProductMetalMedia[]>>
    setMetalVariants: Dispatch<SetStateAction<ProductMetalVariant[]>>
    setDefaultVariantMediaItems: Dispatch<SetStateAction<ProductVariantMediaItem[]>>
    setSelectedCertificateIds: Dispatch<SetStateAction<string[]>>
    setRingSizesEnabled: Dispatch<SetStateAction<boolean>>
    setRingCategoryId: Dispatch<SetStateAction<string>>
    setFitLabel: Dispatch<SetStateAction<string>>
    setFitOptions: Dispatch<SetStateAction<string[]>>
    setFitEnabled: Dispatch<SetStateAction<boolean>>
    setGemstoneLabel: Dispatch<SetStateAction<string>>
    setGemstoneValues: Dispatch<SetStateAction<string[]>>
    setSelectedMaterialValueIds: Dispatch<SetStateAction<string[]>>
    setShapesEnabled: Dispatch<SetStateAction<boolean>>
    setSelectedShapeIds: Dispatch<SetStateAction<string[]>>
    setEngravingEnabled: Dispatch<SetStateAction<boolean>>
    setEngravingLabel: Dispatch<SetStateAction<string>>
    setShippingEnabled: Dispatch<SetStateAction<boolean>>
    setCareWarrantyEnabled: Dispatch<SetStateAction<boolean>>
    setShippingOverrideEnabled: Dispatch<SetStateAction<boolean>>
    setCareWarrantyOverrideEnabled: Dispatch<SetStateAction<boolean>>
    setShippingRuleId: Dispatch<SetStateAction<string>>
    setCareWarrantyRuleId: Dispatch<SetStateAction<string>>
    setShippingTitleOverride: Dispatch<SetStateAction<string>>
    setShippingBodyOverride: Dispatch<SetStateAction<string>>
    setCareWarrantyTitleOverride: Dispatch<SetStateAction<string>>
    setCareWarrantyBodyOverride: Dispatch<SetStateAction<string>>
    setFeatures: Dispatch<SetStateAction<string[]>>
    setSpecifications: Dispatch<SetStateAction<ProductKeyValue[]>>
    setProductDetails: Dispatch<SetStateAction<ProductKeyValue[]>>
    setDetailSections: Dispatch<SetStateAction<ProductDetailSection[]>>
    setFaqItems: Dispatch<SetStateAction<ProductFaqItem[]>>
    setImagePaths: Dispatch<SetStateAction<(string | null)[]>>
    setImageSlots: Dispatch<SetStateAction<string[]>>
    setImageAlts: Dispatch<SetStateAction<string[]>>
    setVideoPath: Dispatch<SetStateAction<string | null>>
    setModel3dUrl: Dispatch<SetStateAction<string>>
    setShowImageSlots: Dispatch<SetStateAction<boolean[]>>
    setShowVideo: Dispatch<SetStateAction<boolean>>
    setCustomOrderEnabled: Dispatch<SetStateAction<boolean>>
    setReadyToShip: Dispatch<SetStateAction<boolean>>
    setHiphopBadges: Dispatch<SetStateAction<string[]>>
    setChainLengthOptions: Dispatch<SetStateAction<string[]>>
    setHiphopCaratLabel: Dispatch<SetStateAction<string>>
    setHiphopCaratValues: Dispatch<SetStateAction<string[]>>
    setGramWeightLabel: Dispatch<SetStateAction<string>>
    setGramWeightValue: Dispatch<SetStateAction<string>>
    setCustomDropdownsEnabled: Dispatch<SetStateAction<boolean>>
    setCustomDropdowns: Dispatch<SetStateAction<ProductCustomDropdown[]>>
  }
) {
  if (!item) return
  const normalized = normalizeProductEditorItem(item)

  setters.setName(normalized.name)
  setters.setSku(normalized.sku)
  setters.setProductLane(normalized.productLane)
  setters.setDetailTemplate(normalized.detailTemplate)
  setters.setFeatured(normalized.featured)
  setters.setBasePrice(normalized.basePrice)
  setters.setDiscountPrice(normalized.discountPrice)
  setters.setGstSlabId(normalized.gstSlabId)
  setters.setStockQuantity(normalized.stockQuantity)
  setters.setAllowCheckout(normalized.allowCheckout)
  setters.setDescription(normalized.description)
  setters.setTagLine(normalized.tagLine)
  setters.setSeoTitle(normalized.seoTitle)
  setters.setSeoDescription(normalized.seoDescription)
  setters.setH1Title(normalized.h1Title)
  setters.setMainCategoryId(normalized.mainCategoryId)
  setters.setSubcategoryId(normalized.subcategoryId)
  setters.setOptionId(normalized.optionId)
  setters.setLinkedSubcategoryIds(normalized.linkedSubcategoryIds)
  setters.setLinkedOptionIds(normalized.linkedOptionIds)
  setters.setStyleId(normalized.styleId)
  setters.setSelectedMetalIds(normalized.selectedMetalIds)
  setters.setSelectedPurities(normalized.selectedPurities)
  setters.setPurityPrices(normalized.purityPrices)
  setters.setDefaultPurityPriceId(normalized.defaultPurityPriceId)
  setters.setMetalMedia(normalized.metalMedia)
  setters.setMetalVariants(normalized.metalVariants)
  setters.setDefaultVariantMediaItems(normalized.defaultVariantMediaItems)
  setters.setSelectedCertificateIds(normalized.selectedCertificateIds)
  setters.setRingSizesEnabled(normalized.ringSizesEnabled)
  setters.setRingCategoryId(normalized.ringCategoryId)
  setters.setFitLabel(normalized.fitLabel)
  setters.setFitOptions(normalized.fitOptions)
  setters.setFitEnabled(normalized.fitEnabled)
  setters.setGemstoneLabel(normalized.gemstoneLabel)
  setters.setGemstoneValues(normalized.gemstoneValues)
  setters.setSelectedMaterialValueIds(normalized.selectedMaterialValueIds)
  setters.setShapesEnabled(normalized.shapesEnabled)
  setters.setSelectedShapeIds(normalized.selectedShapeIds)
  setters.setEngravingEnabled(normalized.engravingEnabled)
  setters.setEngravingLabel(normalized.engravingLabel)
  setters.setCustomDropdownsEnabled(normalized.customDropdownsEnabled)
  setters.setCustomDropdowns(normalized.customDropdowns)
  setters.setShippingEnabled(normalized.shippingEnabled)
  setters.setCareWarrantyEnabled(normalized.careWarrantyEnabled)
  setters.setShippingOverrideEnabled(normalized.shippingOverrideEnabled)
  setters.setCareWarrantyOverrideEnabled(normalized.careWarrantyOverrideEnabled)
  setters.setShippingRuleId(normalized.shippingRuleId)
  setters.setCareWarrantyRuleId(normalized.careWarrantyRuleId)
  setters.setShippingTitleOverride(normalized.shippingTitleOverride)
  setters.setShippingBodyOverride(normalized.shippingBodyOverride)
  setters.setCareWarrantyTitleOverride(normalized.careWarrantyTitleOverride)
  setters.setCareWarrantyBodyOverride(normalized.careWarrantyBodyOverride)
  setters.setFeatures(normalized.features)
  setters.setSpecifications(normalized.specifications)
  setters.setProductDetails(normalized.productDetails)
  setters.setDetailSections(normalized.detailSections)
  setters.setFaqItems(normalized.faqItems)
  setters.setImagePaths(normalized.imagePaths)
  setters.setImageSlots(normalized.imageSlots)
  setters.setImageAlts(normalized.imageAlts)
  setters.setVideoPath(normalized.videoPath)
  setters.setModel3dUrl(normalized.model3dUrl)
  setters.setShowImageSlots(normalized.showImageSlots)
  setters.setShowVideo(normalized.showVideo)
  setters.setCustomOrderEnabled(normalized.customOrderEnabled)
  setters.setReadyToShip(normalized.readyToShip)
  setters.setHiphopBadges(normalized.hiphopBadges)
  setters.setChainLengthOptions(normalized.chainLengthOptions)
  setters.setHiphopCaratLabel(normalized.hiphopCaratLabel)
  setters.setHiphopCaratValues(normalized.hiphopCaratValues)
  setters.setGramWeightLabel(normalized.gramWeightLabel)
  setters.setGramWeightValue(normalized.gramWeightValue)
}

const emptyRow = (): ProductKeyValue => ({ key: '', value: '' })
const emptySection = (): ProductDetailSection => ({
  id: `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  rows: [emptyRow()],
  visible: true,
})
const collectionBucket = process.env.NEXT_PUBLIC_SUPABASE_COLLECTION_BUCKET || 'hod'

export type ProductFormStepId = 'basics' | 'pricing' | 'attributes' | 'content' | 'details' | 'media'

const PRODUCT_FORM_STEPS: { id: ProductFormStepId; label: string; description: string }[] = [
  { id: 'basics', label: 'Basics', description: 'Core info, category, and template setup.' },
  { id: 'pricing', label: 'Pricing', description: 'Choose metal options, then set their prices, media, GST and discounts.' },
  { id: 'attributes', label: 'Attributes', description: 'Metals, filters, sizing, engraving, and storefront options.' },
  { id: 'content', label: 'Content', description: 'Description, highlights, and policy content.' },
  { id: 'details', label: 'Details', description: 'Specifications and detailed content sections.' },
  { id: 'media', label: 'Media', description: 'Images, video, and final review before save.' },
]
const CATALOG_BOOTSTRAP_CACHE_TTL_MS = 10 * 60 * 1000
const PRODUCT_EDIT_CACHE_TTL_MS = 2 * 60 * 1000
type CatalogBootstrapScope = 'basics' | 'pricing' | 'attributes' | 'content'

function productFormDebug(label: string, startedAt: number) {
  if (process.env.NODE_ENV !== 'development') return
  console.info(`[ProductForm] ${label}: ${Math.round(performance.now() - startedAt)}ms`)
}

async function getAccessToken() {
  const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function authedFetch(url: string, options: RequestInit = {}) {
  if (url.startsWith('/api/catalog/bootstrap')) return productFetch(url.replace('/api/catalog/bootstrap', '/api/products/bootstrap'), options)
  if (url.startsWith('/api/products/') && !url.startsWith('/api/products/media') && !url.startsWith('/api/products/videos')) return productFetch(url, options)
  if (url === '/api/products') return productFetch(url, options)
  const token = await getAccessToken()
  const headers = new Headers(options.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (!(options.body instanceof FormData)) headers.set('content-type', 'application/json')
  return fetch(url, { ...options, headers })
}

function toggleInArray(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
}

function sanitizeRows(rows: ProductKeyValue[]) {
  return rows.filter((row) => row.key.trim() && row.value.trim())
}

function sanitizeSections(sections: ProductDetailSection[]) {
  return sections
    .map((section) => ({
      ...section,
      title: section.title.trim(),
      rows: sanitizeRows(section.rows),
    }))
    .filter((section) => section.title && section.rows.length > 0)
}

function toStoragePreviewUrl(path: string | null | undefined) {
  return resolveStoredImage(path, collectionBucket) ?? ''
}

function isHipHopCategory(category?: CatalogCategory | null) {
  const source = `${category?.code ?? ''} ${category?.slug ?? ''} ${category?.name ?? ''}`.toLowerCase()
  return source.includes('hip')
}

type ProductFormProps = {
  productId?: number | string
  productSlug?: string
  forcedTemplate?: 'standard' | 'hiphop'
  forcedLane?: 'standard' | 'hiphop' | 'collection'
  forceHipHopCategory?: boolean
  backHref?: string
  pageTitle?: string
  pageDescription?: string
  initialBasicsBootstrap?: BootstrapPayload
  initialProduct?: ProductEditorItem
}

function matchesProduct(item: ProductEditorItem | null | undefined, id?: number | string, slug?: string) {
  const relations: (keyof ProductEditorItem)[] = ['metal_ids', 'material_value_ids', 'shape_ids', 'linked_subcategory_ids', 'linked_option_ids', 'purity_prices', 'metal_media', 'metal_variants', 'default_variant_media_items', 'faq_items', 'custom_dropdowns']
  return Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.sku === 'string'
    && relations.every(field => Array.isArray(item[field]))
    && item.metal_variants!.every(variant => Array.isArray(variant.media_items))
    && (slug ? item.slug === slug : id != null && item.id.toLowerCase() === String(id).toLowerCase()))
}

const bootstrapFields: Record<CatalogBootstrapScope, (keyof BootstrapPayload)[]> = {
  basics: ['categories', 'subcategories', 'options', 'styles'],
  pricing: ['metals', 'certificates', 'gstSlabs'],
  attributes: ['metals', 'certificates', 'materialValues', 'stoneShapes', 'ringCategories', 'ringCategorySizes'],
  content: ['productContentRules'],
}
function validBootstrap(payload: BootstrapPayload | null | undefined, scope: CatalogBootstrapScope): payload is BootstrapPayload {
  return Boolean(payload && bootstrapFields[scope].every(field => Array.isArray(payload[field])))
}

export function ProductForm(props: ProductFormProps) {
  // Navigation between existing records must never reuse the previous record's state.
  return <ProductFormEditor key={props.productSlug ? `slug:${props.productSlug}` : `id:${props.productId ?? 'new'}`} {...props} />
}

function ProductFormEditor({
  productId,
  productSlug,
  forcedTemplate,
  forcedLane,
  forceHipHopCategory = false,
  backHref = '/dashboard/products',
  pageTitle,
  pageDescription,
  initialBasicsBootstrap,
  initialProduct,
}: ProductFormProps) {
  const { toast } = useToast()
  const router = useRouter()
  const productLookupUrl = productSlug
    ? `/api/products/by-slug/${encodeURIComponent(productSlug)}`
    : productId
      ? `/api/products/${productId}`
      : null
  const productCacheKey = productLookupUrl ? getProductEditorCacheKey(productLookupUrl) : null
  const matchingInitial = matchesProduct(initialProduct, productId, productSlug) ? initialProduct : undefined
  const initialProductState = normalizeProductEditorItem(matchingInitial)
  const [loading, setLoading] = useState(() => {
    if (matchingInitial) return false
    if (!productCacheKey) return !initialBasicsBootstrap
    return !getCachedQueryData<ProductEditorItem>(productCacheKey, PRODUCT_EDIT_CACHE_TTL_MS)
  })
  const [productHydrated, setProductHydrated] = useState(() => Boolean(matchingInitial) || !productLookupUrl)
  const [loadError, setLoadError] = useState('')
  const loadVersion = useRef(0)
  const verifiedProduct = useRef(Boolean(matchingInitial) || !productLookupUrl)
  const [saving, setSaving] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [categories, setCategories] = useState<CatalogCategory[]>(initialBasicsBootstrap?.categories ?? [])
  const [subcategories, setSubcategories] = useState<CatalogSubcategory[]>(initialBasicsBootstrap?.subcategories ?? [])
  const [options, setOptions] = useState<CatalogOption[]>(initialBasicsBootstrap?.options ?? [])
  const [metals, setMetals] = useState<CatalogMetal[]>([])
  const [materialValues, setMaterialValues] = useState<CatalogMaterialValue[]>([])
  const [stoneShapes, setStoneShapes] = useState<CatalogStoneShape[]>([])
  const [gstSlabs, setGstSlabs] = useState<CatalogGstSlab[]>([])
  const [ringCategories, setRingCategories] = useState<CatalogRingCategory[]>([])
  const [ringCategorySizes, setRingCategorySizes] = useState<CatalogRingCategorySize[]>([])
  const [certificates, setCertificates] = useState<CatalogCertificate[]>([])
  const [styles, setStyles] = useState<CatalogStyle[]>(initialBasicsBootstrap?.styles ?? [])
  const [shippingRules, setShippingRules] = useState<ProductContentRule[]>([])
  const [careWarrantyRules, setCareWarrantyRules] = useState<ProductContentRule[]>([])
  const [activeStep, setActiveStep] = useState<ProductFormStepId>('basics')
  const [name, setName] = useState(initialProductState.name)
  const [sku, setSku] = useState(initialProductState.sku)
  const [productLane, setProductLane] = useState<'standard' | 'hiphop' | 'collection'>(forcedLane ?? initialProductState.productLane)
  const [detailTemplate, setDetailTemplate] = useState<'standard' | 'hiphop'>(forcedTemplate ?? initialProductState.detailTemplate)
  const [featured, setFeatured] = useState(initialProductState.featured)
  const [basePrice, setBasePrice] = useState(initialProductState.basePrice)
  const [discountPrice, setDiscountPrice] = useState(initialProductState.discountPrice)
  const [gstSlabId, setGstSlabId] = useState(initialProductState.gstSlabId)
  const [stockQuantity, setStockQuantity] = useState(initialProductState.stockQuantity)
  const [allowCheckout, setAllowCheckout] = useState(initialProductState.allowCheckout)
  const [description, setDescription] = useState(initialProductState.description)
  const [tagLine, setTagLine] = useState(initialProductState.tagLine)
  const [seoTitle, setSeoTitle] = useState(initialProductState.seoTitle)
  const [seoDescription, setSeoDescription] = useState(initialProductState.seoDescription)
  const [h1Title, setH1Title] = useState(initialProductState.h1Title)
  const [mainCategoryId, setMainCategoryId] = useState(initialProductState.mainCategoryId)
  const [subcategoryId, setSubcategoryId] = useState(initialProductState.subcategoryId)
  const [optionId, setOptionId] = useState(initialProductState.optionId)
  const [linkedSubcategoryIds, setLinkedSubcategoryIds] = useState<string[]>(initialProductState.linkedSubcategoryIds)
  const [linkedOptionIds, setLinkedOptionIds] = useState<string[]>(initialProductState.linkedOptionIds)
  const [styleId, setStyleId] = useState(initialProductState.styleId)
  const [selectedMetalIds, setSelectedMetalIds] = useState<string[]>(initialProductState.selectedMetalIds)
  const [selectedPurities, setSelectedPurities] = useState<string[]>(initialProductState.selectedPurities)
  const [purityPrices, setPurityPrices] = useState<ProductPurityPrice[]>(initialProductState.purityPrices)
  const [defaultPurityPriceId, setDefaultPurityPriceId] = useState(initialProductState.defaultPurityPriceId)
  const [metalMedia, setMetalMedia] = useState<ProductMetalMedia[]>(initialProductState.metalMedia)
  const [metalVariants, setMetalVariants] = useState<ProductMetalVariant[]>(initialProductState.metalVariants)
  const [defaultVariantMediaItems, setDefaultVariantMediaItems] = useState<ProductVariantMediaItem[]>(initialProductState.defaultVariantMediaItems)
  const [selectedCertificateIds, setSelectedCertificateIds] = useState<string[]>(initialProductState.selectedCertificateIds)
  const [ringSizesEnabled, setRingSizesEnabled] = useState(initialProductState.ringSizesEnabled)
  const [ringCategoryId, setRingCategoryId] = useState(initialProductState.ringCategoryId)
  const [fitLabel, setFitLabel] = useState(initialProductState.fitLabel)
  const [fitOptions, setFitOptions] = useState<string[]>(initialProductState.fitOptions)
  const [fitInput, setFitInput] = useState('')
  const [fitEnabled, setFitEnabled] = useState(initialProductState.fitEnabled)
  const [gemstoneLabel, setGemstoneLabel] = useState(initialProductState.gemstoneLabel)
  const [gemstoneValues, setGemstoneValues] = useState<string[]>(initialProductState.gemstoneValues)
  const [selectedMaterialValueIds, setSelectedMaterialValueIds] = useState<string[]>(initialProductState.selectedMaterialValueIds)
  const [shapesEnabled, setShapesEnabled] = useState(initialProductState.shapesEnabled)
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>(initialProductState.selectedShapeIds)
  const [engravingEnabled, setEngravingEnabled] = useState(initialProductState.engravingEnabled)
  const [engravingLabel, setEngravingLabel] = useState(initialProductState.engravingLabel)
  const [customDropdownsEnabled, setCustomDropdownsEnabled] = useState(initialProductState.customDropdownsEnabled)
  const [customDropdowns, setCustomDropdowns] = useState<ProductCustomDropdown[]>(initialProductState.customDropdowns)
  const [shippingEnabled, setShippingEnabled] = useState(initialProductState.shippingEnabled)
  const [careWarrantyEnabled, setCareWarrantyEnabled] = useState(initialProductState.careWarrantyEnabled)
  const [shippingOverrideEnabled, setShippingOverrideEnabled] = useState(initialProductState.shippingOverrideEnabled)
  const [careWarrantyOverrideEnabled, setCareWarrantyOverrideEnabled] = useState(initialProductState.careWarrantyOverrideEnabled)
  const [shippingRuleId, setShippingRuleId] = useState(initialProductState.shippingRuleId)
  const [careWarrantyRuleId, setCareWarrantyRuleId] = useState(initialProductState.careWarrantyRuleId)
  const [shippingTitleOverride, setShippingTitleOverride] = useState(initialProductState.shippingTitleOverride)
  const [shippingBodyOverride, setShippingBodyOverride] = useState(initialProductState.shippingBodyOverride)
  const [careWarrantyTitleOverride, setCareWarrantyTitleOverride] = useState(initialProductState.careWarrantyTitleOverride)
  const [careWarrantyBodyOverride, setCareWarrantyBodyOverride] = useState(initialProductState.careWarrantyBodyOverride)
  const [features, setFeatures] = useState<string[]>(initialProductState.features)
  const [featureInput, setFeatureInput] = useState('')
  const [specifications, setSpecifications] = useState<ProductKeyValue[]>(initialProductState.specifications)
  const [productDetails, setProductDetails] = useState<ProductKeyValue[]>(initialProductState.productDetails)
  const [detailSections, setDetailSections] = useState<ProductDetailSection[]>(initialProductState.detailSections)
  const [faqItems, setFaqItems] = useState<ProductFaqItem[]>(initialProductState.faqItems)
  const [loadedBootstrapScopes, setLoadedBootstrapScopes] = useState<Set<CatalogBootstrapScope>>(() => new Set(validBootstrap(initialBasicsBootstrap, 'basics') ? ['basics'] : []))
  const [, setImageSlots] = useState<string[]>(initialProductState.imageSlots)
  const [imagePaths, setImagePaths] = useState<(string | null)[]>(initialProductState.imagePaths)
  const [imageAlts, setImageAlts] = useState<string[]>(initialProductState.imageAlts)
  const [videoPath, setVideoPath] = useState<string | null>(initialProductState.videoPath)
  const [model3dUrl, setModel3dUrl] = useState(initialProductState.model3dUrl)
  const [showImageSlots, setShowImageSlots] = useState(initialProductState.showImageSlots)
  const [showVideo, setShowVideo] = useState(initialProductState.showVideo)
  const [activeMetalMediaId, setActiveMetalMediaId] = useState('')
  const [activeVariantMediaKey, setActiveVariantMediaKey] = useState<string>('default')
  const [activeVariantMediaIndex, setActiveVariantMediaIndex] = useState<number | null>(null)
  const [uploadingSlots, setUploadingSlots] = useState<Record<string, boolean>>({})
  const [deleteVariantMediaTarget, setDeleteVariantMediaTarget] = useState<{
    metalId: string | null
    itemIndex: number
    label: string
  } | null>(null)
  const [videoLibraryTarget, setVideoLibraryTarget] = useState<{
    metalId: string | null
    itemIndex: number
  } | null>(null)
  const [customOrderEnabled, setCustomOrderEnabled] = useState(initialProductState.customOrderEnabled)
  const [readyToShip, setReadyToShip] = useState(initialProductState.readyToShip)
  const [hiphopBadges, setHiphopBadges] = useState<string[]>(initialProductState.hiphopBadges)
  const [hiphopBadgeInput, setHiphopBadgeInput] = useState('')
  const [chainLengthOptions, setChainLengthOptions] = useState<string[]>(initialProductState.chainLengthOptions)
  const [chainLengthInput, setChainLengthInput] = useState('')
  const [hiphopCaratLabel, setHiphopCaratLabel] = useState(initialProductState.hiphopCaratLabel)
  const [hiphopCaratValues, setHiphopCaratValues] = useState<string[]>(initialProductState.hiphopCaratValues)
  const [hiphopCaratInput, setHiphopCaratInput] = useState('')
  const [gramWeightLabel, setGramWeightLabel] = useState(initialProductState.gramWeightLabel)
  const [gramWeightValue, setGramWeightValue] = useState(initialProductState.gramWeightValue)

  const applyBootstrap = (payload: BootstrapPayload | null | undefined) =>
    applyBootstrapPayload(payload, {
      setCategories,
      setSubcategories,
      setOptions,
      setMetals,
      setMaterialValues,
      setStoneShapes,
      setGstSlabs,
      setRingCategories,
      setRingCategorySizes,
      setCertificates,
      setStyles,
      setShippingRules,
      setCareWarrantyRules,
    })

  // HOD-054: revision of the product as this editor loaded it; the save sends it back.
  const editorRevision = useRef<string | null>(null)
  const applyProduct = (item: ProductEditorItem | null | undefined) => {
    editorRevision.current = item?.revision ?? null
    return applyProductPayload(item, {
      setName,
      setSku,
      setProductLane,
      setDetailTemplate,
      setFeatured,
      setBasePrice,
      setDiscountPrice,
      setGstSlabId,
      setStockQuantity,
      setAllowCheckout,
      setDescription,
      setTagLine,
      setSeoTitle,
      setSeoDescription,
      setH1Title,
      setMainCategoryId,
      setSubcategoryId,
      setOptionId,
      setLinkedSubcategoryIds,
      setLinkedOptionIds,
      setStyleId,
      setSelectedMetalIds,
      setSelectedPurities,
      setPurityPrices,
      setDefaultPurityPriceId,
      setMetalMedia,
      setMetalVariants,
      setDefaultVariantMediaItems,
      setSelectedCertificateIds,
      setRingSizesEnabled,
      setRingCategoryId,
      setFitLabel,
      setFitOptions,
    setFitEnabled,
    setGemstoneLabel,
    setGemstoneValues,
    setSelectedMaterialValueIds,
    setShapesEnabled,
      setSelectedShapeIds,
      setEngravingEnabled,
      setEngravingLabel,
      setShippingEnabled,
      setCareWarrantyEnabled,
      setShippingOverrideEnabled,
      setCareWarrantyOverrideEnabled,
      setShippingRuleId,
      setCareWarrantyRuleId,
      setShippingTitleOverride,
      setShippingBodyOverride,
      setCareWarrantyTitleOverride,
      setCareWarrantyBodyOverride,
      setFeatures,
      setSpecifications,
      setProductDetails,
      setDetailSections,
      setFaqItems,
      setImagePaths,
      setImageSlots,
      setImageAlts,
      setVideoPath,
      setModel3dUrl,
      setShowImageSlots,
      setShowVideo,
      setCustomOrderEnabled,
      setReadyToShip,
      setHiphopBadges,
      setChainLengthOptions,
      setHiphopCaratLabel,
      setHiphopCaratValues,
      setGramWeightLabel,
      setGramWeightValue,
      setCustomDropdownsEnabled,
      setCustomDropdowns,
    })
  }

  const markBootstrapScopeLoaded = (scope: CatalogBootstrapScope) => {
    setLoadedBootstrapScopes((current) => new Set(current).add(scope))
  }

  const loadBootstrapScope = async (scope: CatalogBootstrapScope) => {
    const startedAt = performance.now()
    if (scope === 'basics' && validBootstrap(initialBasicsBootstrap, scope)) {
      setCachedQueryData(`catalog-bootstrap:${scope}`, initialBasicsBootstrap)
      applyBootstrap(initialBasicsBootstrap)
      markBootstrapScopeLoaded(scope)
      productFormDebug(`catalog ${scope} hydrated`, startedAt)
      return initialBasicsBootstrap
    }

    const payload = await fetchCachedQuery<BootstrapPayload>({
      key: `catalog-bootstrap:${scope}`,
      staleTimeMs: CATALOG_BOOTSTRAP_CACHE_TTL_MS,
      fetcher: async () => {
        const response = await authedFetch(`/api/catalog/bootstrap?scope=${scope}`)
        const payload = (await response.json().catch(() => null)) as BootstrapPayload | null
        productFormDebug(`catalog ${scope} fetched`, startedAt)
        if (!response.ok || !validBootstrap(payload, scope)) throw new Error('Unable to load product choices. Please retry.')
        return payload
      },
    })
    if (validBootstrap(payload, scope)) {
      applyBootstrap(payload)
      markBootstrapScopeLoaded(scope)
      productFormDebug(`catalog ${scope} applied`, startedAt)
    }
    if (!validBootstrap(payload, scope)) throw new Error('Unable to load product choices. Please retry.')
    return payload
  }

  const loadData = async () => {
    const version = ++loadVersion.current
    setLoadError('')
    setLoading(true)
    try {
      if (matchingInitial && !verifiedProduct.current) {
        if (productCacheKey) setCachedQueryData(productCacheKey, matchingInitial)
        applyProduct(matchingInitial)
        verifiedProduct.current = true
        setProductHydrated(true)
      }
      if (verifiedProduct.current && productLookupUrl) {
        // A retry of failed reference loading preserves hydrated fields and edits.
        await loadBootstrapScope('basics')
        return
      }

      if (!productLookupUrl && validBootstrap(initialBasicsBootstrap, 'basics')) {
        setProductHydrated(true)
        setLoading(false)
        return
      }

      const cachedProduct = productCacheKey
        ? getCachedQueryData<ProductEditorItem>(productCacheKey, PRODUCT_EDIT_CACHE_TTL_MS)
        : null
      const loadStartedAt = performance.now()
      const bootstrapPromise = loadBootstrapScope('basics')

      if (matchesProduct(cachedProduct, productId, productSlug)) {
        await bootstrapPromise
        if (version !== loadVersion.current) return
        applyProduct(cachedProduct)
        verifiedProduct.current = true
        setProductHydrated(true)
        productFormDebug('total loadData', loadStartedAt)
        return
      }

      const productPromise = productLookupUrl && productCacheKey
        ? (() => {
            const startedAt = performance.now()
            return fetchCachedQuery<ProductEditorItem>({
              key: productCacheKey,
              staleTimeMs: PRODUCT_EDIT_CACHE_TTL_MS,
              fetcher: async () => {
                const response = await authedFetch(productLookupUrl)
                const payload = (await response.json().catch(() => null)) as { item?: ProductEditorItem } | null
                productFormDebug('product fetched', startedAt)
                if (!response.ok || !matchesProduct(payload?.item, productId, productSlug)) throw new Error('Unable to load this product. Please retry.')
                return payload!.item!
              },
            })
          })()
        : Promise.resolve(null)

      const [, productItem] = await Promise.all([bootstrapPromise, productPromise])
      if (version !== loadVersion.current) return
      if (productLookupUrl && !matchesProduct(productItem, productId, productSlug)) throw new Error('Unable to load this product. Please retry.')
      if (productItem) applyProduct(productItem)
      verifiedProduct.current = true
      setProductHydrated(true)
      productFormDebug('total loadData', loadStartedAt)
    } catch (error) {
      if (version === loadVersion.current) {
        if (!verifiedProduct.current && productCacheKey) deleteCachedQueryData(productCacheKey)
        setLoadError(error instanceof Error ? error.message : 'Unable to load this product. Please retry.')
      }
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }

  useEffect(() => {
    const generation = loadVersion
    let active = true
    void Promise.resolve().then(() => { if (active) return loadData() })
    return () => { active = false; generation.current++ }
  }, [productId, productSlug, initialProduct, initialBasicsBootstrap])

  useEffect(() => {
    const requiredScopesByStep: Partial<Record<ProductFormStepId, CatalogBootstrapScope[]>> = {
      basics: ['basics'],
      pricing: ['pricing'],
      attributes: ['pricing', 'attributes'],
      content: ['content'],
      media: ['pricing'],
    }
    const scopes = requiredScopesByStep[activeStep] ?? []
    const missingScopes = scopes.filter((scope) => !loadedBootstrapScopes.has(scope))
    if (missingScopes.length < 1) return

    void Promise.all(missingScopes.map((scope) => loadBootstrapScope(scope))).catch(() => {})
  }, [activeStep, loadedBootstrapScopes])

  useEffect(() => {
    // Keep the initial editor light, but warm the next likely scopes once it is usable.
    const schedule = window.requestIdleCallback ?? ((callback: IdleRequestCallback) => window.setTimeout(callback, 1) as unknown as number)
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const handle = schedule(() => {
      void loadBootstrapScope('pricing').then(() => loadBootstrapScope('attributes')).catch(() => {})
      void loadBootstrapScope('content').catch(() => {})
      router.prefetch(backHref)
    })
    return () => cancel(handle)
  }, [])

  const prepareDirectImageUpload = async (file: File) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) {
      throw new Error('Unsupported image type.')
    }

    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, 2200 / bitmap.width)
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image processing is unavailable.')
      context.drawImage(bitmap, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
      if (!blob) throw new Error('Unable to prepare image for upload.')
      return new File([blob], `${crypto.randomUUID()}.webp`, { type: 'image/webp' })
    } finally {
      bitmap.close()
    }
  }

  const uploadImageDirectly = async (file: File, folder: 'products' | 'hiphop') => {
    const preparedFile = await prepareDirectImageUpload(file)
    const signResponse = await authedFetch('/api/products/media/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folder,
        contentType: preparedFile.type,
        declaredSize: preparedFile.size,
        productKey: productId || productSlug || 'draft',
      }),
    })
    const signed = await signResponse.json().catch(() => null)
    if (!signResponse.ok || !signed?.path) {
      throw new Error(signed?.error ?? 'Unable to prepare direct image upload.')
    }

    if (signed.provider !== 'r2' || !signed.uploadUrl) throw new Error('Direct upload credentials were not returned.')
    const uploadResponse = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': preparedFile.type },
      body: preparedFile,
    })
    if (!uploadResponse.ok) throw new Error('Cloudflare image upload failed.')
    return { path: signed.url as string, provider: 'r2' as const }
  }

  const uploadMediaThroughServer = async (file: File, kind: 'image' | 'video', folder: 'products' | 'hiphop') => {
    const body = new FormData()
    body.append('file', file)
    body.append('kind', kind)
    body.append('folder', folder)

    const response = await authedFetch('/api/products/media', {
      method: 'POST',
      body,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.path) {
      throw new Error(payload?.error ?? `Unable to upload ${kind}.`)
    }
    if (kind === 'video') invalidateClientVideoLibrary()

    return {
      path: payload.path as string,
      provider: payload.provider === 's3' ? 's3' as const : payload.provider === 'r2' ? 'r2' as const : 'supabase' as const,
    }
  }

  const uploadMedia = async (file: File, kind: 'image' | 'video', folder: 'products' | 'hiphop') => {
    if (kind === 'video') {
      const awsPath = await tryUploadAwsVideo(file, '/api/products/media', { kind, folder })
      if (awsPath) return { path: awsPath, provider: 's3' as const }
    }
    if (kind === 'image') {

      const awsPath = await tryUploadAwsImage(file, '/api/products/media', {kind, folder})
      if (awsPath) { return {path: awsPath, provider: 's3' as const} }

    }

    if (kind === 'image') {
      if (process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL) return uploadMediaThroughServer(file, kind, folder)
      try {
        return await uploadImageDirectly(file, folder)
      } catch {
        return uploadMediaThroughServer(file, kind, folder)
      }
    }

    return uploadMediaThroughServer(file, kind, folder)
  }

  const mainCategory = categories.find((item) => item.id === mainCategoryId)
  const effectiveProductLane = forcedLane ?? productLane
  const isLockedLaneProduct = effectiveProductLane === 'hiphop' || effectiveProductLane === 'collection'
  const isHiphopProduct = detailTemplate === 'hiphop' || isHipHopCategory(mainCategory)
  const isCollectionProduct = effectiveProductLane === 'collection'
  const activeStepIndex = PRODUCT_FORM_STEPS.findIndex((step) => step.id === activeStep)
  const isFirstStep = activeStepIndex <= 0
  const isLastStep = activeStepIndex === PRODUCT_FORM_STEPS.length - 1
  const categorySubcategories = useMemo(
    () => subcategories.filter((item) => item.category_id === mainCategoryId),
    [subcategories, mainCategoryId]
  )
  const selectedStyle = styles.find((item) => item.id === styleId)
  const selectedSubcategory = subcategories.find((item) => item.id === subcategoryId)
  const subcategoryOptions = useMemo(
    () => options.filter((item) => item.subcategory_id === subcategoryId),
    [options, subcategoryId]
  )
  const linkedSubcategoryCandidates = useMemo(
    () => categorySubcategories.filter((item) => item.id !== subcategoryId),
    [categorySubcategories, subcategoryId]
  )
  const selectedSubcategoryPoolIds = useMemo(
    () => [subcategoryId, ...linkedSubcategoryIds].filter(Boolean),
    [subcategoryId, linkedSubcategoryIds]
  )
  const linkedOptionCandidates = useMemo(
    () =>
      options.filter(
        (item) =>
          selectedSubcategoryPoolIds.includes(item.subcategory_id) &&
          item.id !== optionId
      ),
    [optionId, options, selectedSubcategoryPoolIds]
  )

  const selectedPath = useMemo(() => {
    const option = options.find((item) => item.id === optionId)
    return formatCategoryPath({ category: mainCategory, subcategory: selectedSubcategory, option }) || 'No category selected'
  }, [mainCategory, selectedSubcategory, optionId, options])

  const selectedBasePriceEntry = useMemo(
    () => purityPrices.find((entry) => entry.id === defaultPurityPriceId) ?? null,
    [defaultPurityPriceId, purityPrices]
  )
  const combinedMetalOptions = useMemo(() => {
    const flagged = metals.filter((entry) => entry.is_combined_option || Boolean(entry.purity_label))
    return flagged.length > 0 ? flagged : metals
  }, [metals])
  const usesCombinedVariantFlow = metalVariants.length > 0
  const defaultMetalVariant = useMemo(
    () => metalVariants.find((entry) => entry.is_default) ?? metalVariants[0] ?? null,
    [metalVariants]
  )
  const getMetalVariantLabel = (metalId: string) => {
    const metal = metals.find((entry) => entry.id === metalId)
    return metal ? buildCombinedMetalDisplayLabel(metal) : 'Combined option'
  }
  const getVariantMediaItems = (metalId: string) =>
    metalVariants.find((entry) => entry.metal_id === metalId)?.media_items ?? []
  const activeVariantMediaItems =
    activeVariantMediaKey === 'default'
      ? defaultVariantMediaItems
      : getVariantMediaItems(activeVariantMediaKey)

  useEffect(() => {
    if (mainCategory && isHipHopCategory(mainCategory)) {
      setDetailTemplate('hiphop')
    }
  }, [mainCategory])

  useEffect(() => {
    if (forcedTemplate) {
      setDetailTemplate(forcedTemplate)
    }
  }, [forcedTemplate])

  useEffect(() => {
    if (forcedLane) {
      setProductLane(forcedLane)
    }
  }, [forcedLane])

  useEffect(() => {
    if ((productId || productSlug) || mainCategoryId || !(forceHipHopCategory || forcedTemplate === 'hiphop')) {
      return
    }

    const hiphopCategory = categories.find((entry) => isHipHopCategory(entry))
    if (hiphopCategory) {
      setMainCategoryId(hiphopCategory.id)
      setDetailTemplate('hiphop')
    }
  }, [categories, forceHipHopCategory, forcedTemplate, mainCategoryId, productId, productSlug])

  useEffect(() => {
    if ((productId || productSlug) || mainCategoryId || !forcedLane) {
      return
    }

    const lockedCategory = categories.find(
      (entry) => (entry as CatalogCategory & { category_lane?: 'standard' | 'hiphop' | 'collection' | null }).category_lane === forcedLane
    )
    if (lockedCategory) {
      setMainCategoryId(lockedCategory.id)
      setSubcategoryId('')
      setOptionId('')
      if (forcedLane === 'hiphop') {
        setDetailTemplate('hiphop')
      }
    }
  }, [categories, forcedLane, mainCategoryId, productId, productSlug])

  useEffect(() => {
    if (!loadedBootstrapScopes.has('basics')) return
    setLinkedSubcategoryIds((prev) =>
      prev.filter(
        (id) => id !== subcategoryId && categorySubcategories.some((item) => item.id === id)
      )
    )
  }, [categorySubcategories, subcategoryId, loadedBootstrapScopes])

  useEffect(() => {
    if (!loadedBootstrapScopes.has('basics')) return
    setLinkedOptionIds((prev) =>
      prev.filter(
        (id) =>
          id !== optionId &&
          linkedOptionCandidates.some((item) => item.id === id)
      )
    )
  }, [linkedOptionCandidates, optionId, loadedBootstrapScopes])

  useEffect(() => {
    if (isCollectionProduct && allowCheckout) {
      setAllowCheckout(false)
    }
  }, [allowCheckout, isCollectionProduct])

  useEffect(() => {
    if (isCollectionProduct && detailTemplate !== 'standard') {
      setDetailTemplate('standard')
    }
  }, [detailTemplate, isCollectionProduct])

  useEffect(() => {
    setSelectedPurities(
      purityPrices
        .map((entry) => entry.purity_label.trim())
        .filter(Boolean)
    )
  }, [purityPrices])

  const effectiveGemstoneValues = useMemo(() => {
    if (selectedMaterialValueIds.length > 0) {
      return selectedMaterialValueIds
        .map((id) => materialValues.find((entry) => entry.id === id)?.name)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    }

    return gemstoneValues
  }, [gemstoneValues, materialValues, selectedMaterialValueIds])

  const effectiveSelectedMaterialValueIds = useMemo(() => {
    if (selectedMaterialValueIds.length > 0) return selectedMaterialValueIds

    return gemstoneValues
      .map((value) => materialValues.find((entry) => entry.name.toLowerCase() === value.toLowerCase())?.id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  }, [gemstoneValues, materialValues, selectedMaterialValueIds])

  useEffect(() => {
    const hasDefault = purityPrices.some((entry) => entry.id === defaultPurityPriceId)
    if (!hasDefault) {
      setDefaultPurityPriceId(purityPrices[0]?.id ?? '')
    }
  }, [defaultPurityPriceId, purityPrices])

  useEffect(() => {
    setMetalVariants((prev) => {
      const next = selectedMetalIds.map((metalId, index) => {
        const existing = prev.find((entry) => entry.metal_id === metalId)
        return (
          existing ?? {
            metal_id: metalId,
            price: Number(basePrice || purityPrices[0]?.price || 0),
            is_default: index === 0,
            sort_order: index + 1,
            media_items: [],
          }
        )
      })

      const hasDefault = next.some((entry) => entry.is_default)
      return next.map((entry, index) => ({
        ...entry,
        sort_order: index + 1,
        is_default: hasDefault ? entry.is_default : index === 0,
      }))
    })
  }, [basePrice, purityPrices, selectedMetalIds])

  useEffect(() => {
    if (!metalVariants.length) {
      setActiveVariantMediaKey('default')
      return
    }

    const keys = ['default', ...metalVariants.map((entry) => entry.metal_id)]
    if (!keys.includes(activeVariantMediaKey)) {
      setActiveVariantMediaKey(metalVariants[0].metal_id)
    }
  }, [activeVariantMediaKey, metalVariants])

  useEffect(() => {
    if (!activeVariantMediaItems.length) {
      setActiveVariantMediaIndex(null)
      return
    }

    setActiveVariantMediaIndex((prev) => {
      if (prev == null) return 0
      return prev >= activeVariantMediaItems.length ? activeVariantMediaItems.length - 1 : prev
    })
  }, [activeVariantMediaItems])

  useEffect(() => {
    if (!usesCombinedVariantFlow || !defaultMetalVariant) return
    setBasePrice(String(Number(defaultMetalVariant.price ?? 0)))
  }, [defaultMetalVariant, usesCombinedVariantFlow])

  useEffect(() => {
    if (usesCombinedVariantFlow || !selectedBasePriceEntry) {
      return
    }

    setBasePrice(String(Number(selectedBasePriceEntry.price ?? 0)))
  }, [selectedBasePriceEntry, usesCombinedVariantFlow])

  useEffect(() => {
    setMetalMedia((prev) => {
      const next = selectedMetalIds.map((metalId, index) => {
        const existing = prev.find((entry) => entry.metal_id === metalId)
        return (
          existing ?? {
            metal_id: metalId,
            image_1_path: null,
            image_2_path: null,
            image_3_path: null,
            image_4_path: null,
            video_path: null,
            is_default_fallback: index === 0,
          }
        )
      })

      return next.map((entry, index) => ({
        ...entry,
        is_default_fallback: entry.is_default_fallback || (!next.some((row) => row.is_default_fallback) && index === 0),
      }))
    })
  }, [selectedMetalIds])

  useEffect(() => {
    if (!selectedMetalIds.length) {
      setActiveMetalMediaId('')
      return
    }
    if (!selectedMetalIds.includes(activeMetalMediaId)) {
      setActiveMetalMediaId(selectedMetalIds[0])
    }
  }, [activeMetalMediaId, selectedMetalIds])

  const addFeature = () => {
    const next = featureInput.trim()
    if (!next) return
    setFeatures((prev) => [...prev, next])
    setFeatureInput('')
  }

  const addFitOption = () => {
    const next = fitInput.trim()
    if (!next) return
    setFitOptions((prev) => (prev.includes(next) ? prev : [...prev, next]))
    setFitInput('')
  }

  const addHiphopBadge = () => {
    const next = hiphopBadgeInput.trim()
    if (!next) return
    setHiphopBadges((prev) => (prev.includes(next) ? prev : [...prev, next]))
    setHiphopBadgeInput('')
  }

  const addChainLengthOption = () => {
    const next = chainLengthInput.trim()
    if (!next) return
    setChainLengthOptions((prev) => (prev.includes(next) ? prev : [...prev, next]))
    setChainLengthInput('')
  }

  const addHiphopCaratValue = () => {
    const next = hiphopCaratInput.trim()
    if (!next) return
    setHiphopCaratValues((prev) => (prev.includes(next) ? prev : [...prev, next]))
    setHiphopCaratInput('')
  }

  const updateMetalVariant = (metalId: string, updater: (entry: ProductMetalVariant) => ProductMetalVariant) => {
    setMetalVariants((prev) =>
      prev.map((entry) => (entry.metal_id === metalId ? updater(entry) : entry))
    )
  }

  const addVariantMediaItem = (metalId: string | null) => {
    const nextItem: ProductVariantMediaItem = {
      media_type: 'image',
      media_path: '',
      sort_order: 1,
      is_default_fallback: !metalId,
    }

    if (!metalId) {
      const nextIndex = defaultVariantMediaItems.length
      setDefaultVariantMediaItems((prev) => [
        ...prev,
        { ...nextItem, sort_order: prev.length + 1 },
      ])
      setActiveVariantMediaIndex(nextIndex)
      return
    }

    const nextIndex = getVariantMediaItems(metalId).length
    updateMetalVariant(metalId, (entry) => ({
      ...entry,
      media_items: [
        ...(entry.media_items ?? []),
        { ...nextItem, sort_order: (entry.media_items?.length ?? 0) + 1 },
      ],
    }))
    setActiveVariantMediaIndex(nextIndex)
  }

  const updateVariantMediaItem = (
    metalId: string | null,
    itemIndex: number,
    updater: (item: ProductVariantMediaItem) => ProductVariantMediaItem
  ) => {
    if (!metalId) {
      setDefaultVariantMediaItems((prev) =>
        prev.map((item, index) => (index === itemIndex ? updater(item) : item))
      )
      return
    }

    updateMetalVariant(metalId, (entry) => ({
      ...entry,
      media_items: (entry.media_items ?? []).map((item, index) => (index === itemIndex ? updater(item) : item)),
    }))
  }

  const removeVariantMediaItem = (metalId: string | null, itemIndex: number) => {
    if (!metalId) {
      setDefaultVariantMediaItems((prev) =>
        prev
          .filter((_, index) => index !== itemIndex)
          .map((item, index) => ({ ...item, sort_order: index + 1 }))
      )
      setActiveVariantMediaIndex((prev) => {
        if (prev == null) return null
        if (prev === itemIndex) return null
        return prev > itemIndex ? prev - 1 : prev
      })
      return
    }

    updateMetalVariant(metalId, (entry) => ({
      ...entry,
      media_items: (entry.media_items ?? [])
        .filter((_, index) => index !== itemIndex)
        .map((item, index) => ({ ...item, sort_order: index + 1 })),
    }))
    setActiveVariantMediaIndex((prev) => {
      if (prev == null) return null
      if (prev === itemIndex) return null
      return prev > itemIndex ? prev - 1 : prev
    })
  }

  const applyTestData = () => {
    const category = categories[0]
    const nextSubcategory = subcategories.find((item) => item.category_id === category?.id)
    const nextOption = options.find((item) => item.subcategory_id === nextSubcategory?.id)
    const nextStyle = styles[0]
    const defaultMetals = metals.slice(0, 2).map((item) => item.id)
    const defaultCertificates = certificates.slice(0, 1).map((item) => item.id)
    setName(`${category?.name ?? 'Catalog'} Test Product`)
    setSku(`TEST-${Date.now().toString().slice(-6)}`)
    setFeatured(true)
    setBasePrice('5200')
    setDiscountPrice('4800')
    setDescription('A polished test product used to verify the aligned admin and storefront product flow.')
    setTagLine('A clean test case for aligned product data')
    setMainCategoryId(category?.id ?? '')
    setSubcategoryId(nextSubcategory?.id ?? '')
    setOptionId(nextOption?.id ?? '')
    setLinkedSubcategoryIds([])
    setLinkedOptionIds([])
    setStyleId(nextStyle?.id ?? '')
    setSelectedMetalIds(defaultMetals)
    setPurityPrices([
      { id: 'test-18k', purity_label: '18K', price: 5200, compare_at_price: 5600, sort_order: 1 },
      { id: 'test-14k', purity_label: '14K', price: 4800, compare_at_price: null, sort_order: 2 },
    ])
    setDefaultPurityPriceId('test-18k')
    setSelectedCertificateIds(defaultCertificates)
    setRingSizesEnabled(true)
    setRingCategoryId(ringCategories[0]?.id ?? '')
    setFitLabel('Fit')
    setFitOptions(['Standard', 'Comfort Fit'])
      setFitEnabled(true)
      setGemstoneLabel('Stone Type')
      setGemstoneValues(['Natural Diamond'])
      setShapesEnabled(false)
      setSelectedShapeIds([])
      setEngravingEnabled(true)
      setEngravingLabel('Complimentary Engraving')
      setShippingEnabled(true)
      setCareWarrantyEnabled(true)
      setShippingOverrideEnabled(false)
      setCareWarrantyOverrideEnabled(false)
      setShippingRuleId(shippingRules[0]?.id ?? '')
    setCareWarrantyRuleId(careWarrantyRules[0]?.id ?? '')
    setShippingTitleOverride('')
    setShippingBodyOverride('')
    setCareWarrantyTitleOverride('')
    setCareWarrantyBodyOverride('')
    setFeatures(['Made for UI testing', 'Dynamic specifications enabled', 'Admin/storefront sync test'])
    setSpecifications([
      { key: 'SKU', value: `TEST-${Date.now().toString().slice(-6)}` },
      { key: 'Crafted In', value: 'Surat, India' },
      { key: 'Finish', value: 'High Polish' },
    ])
    setProductDetails([
      { key: 'Style', value: nextStyle?.name ?? selectedStyle?.name ?? 'Signature' },
      { key: 'Wear', value: 'Everyday luxury' },
    ])
    setDetailSections([
      {
        id: 'diamond-details',
        title: 'Diamond Details',
        visible: true,
        rows: [
          { key: 'Diamond Type', value: 'Natural' },
          { key: 'Total Carat Weight', value: '0.66 Ct' },
        ],
      },
    ])
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    let shouldRedirect = false

    try {
      if (!verifiedProduct.current || !productHydrated || loading || loadError) throw new Error('Load this product successfully before saving. Please retry the load.')
      // Replacement saves require all reference choices, including cold ID entries.
      await Promise.all((['basics', 'pricing', 'attributes', 'content'] as CatalogBootstrapScope[]).map(scope => loadBootstrapScope(scope)))
      const defaultVariant = metalVariants.find((entry) => entry.is_default) ?? metalVariants[0] ?? null
      const resolvedPrice = Number(defaultVariant?.price ?? basePrice)
      if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) {
        throw new Error('Add a price greater than 0 to the default metal option before saving.')
      }
      if (customDropdownsEnabled) {
        const customDropdownError = validateProductCustomDropdowns(customDropdowns)
        if (customDropdownError) throw new Error(customDropdownError)
      }

      const saveUrl = productId ? `/api/products/${productId}` : productSlug ? `/api/products/by-slug/${encodeURIComponent(productSlug)}` : '/api/products'
      const response = await authedFetch(saveUrl, {
        method: productId || productSlug ? 'PATCH' : 'POST',
        headers: productId || productSlug ? { 'x-expected-revision': editorRevision.current ?? '' } : undefined,
        body: JSON.stringify({
          name,
          sku,
          product_lane: effectiveProductLane,
          detail_template: detailTemplate,
          featured,
          description: description || null,
          tag_line: tagLine || null,
          seo_title: seoTitle.trim() || null,
          seo_description: seoDescription.trim() || null,
          h1_title: h1Title.trim() || null,
          base_price: basePrice ? Number(basePrice) : null,
          discount_price: discountPrice ? Number(discountPrice) : null,
          gst_slab_id: gstSlabId || null,
          // Stock is retired (made to order). The saved value is sent back unchanged.
          stock_quantity: Math.max(0, Number(stockQuantity || 0)),
          status: 'active',
          main_category_id: mainCategoryId,
          subcategory_id: subcategoryId || null,
          option_id: optionId || null,
          linked_subcategory_ids: linkedSubcategoryIds,
          linked_option_ids: linkedOptionIds,
          style_id: styleId || null,
          metal_ids: selectedMetalIds,
          metal_variants: serializeProductMetalVariants(metalVariants),
          default_variant_media_items: serializeProductVariantMediaItems(defaultVariantMediaItems, true),
          purity_values: selectedPurities,
          purity_prices: serializeProductPurityPrices(purityPrices),
          default_purity_price_id: defaultPurityPriceId || null,
          metal_media: serializeProductMetalMedia(metalMedia),
          certificate_ids: selectedCertificateIds,
            ring_size_ids: [],
            ring_enabled: ringSizesEnabled,
            ring_category_id: ringSizesEnabled ? ringCategoryId || null : null,
            fit_options: fitEnabled ? fitOptions : [],
            fit_label: fitEnabled ? fitLabel || null : null,
            gemstone_label: gemstoneLabel || null,
            gemstone_value: effectiveGemstoneValues.join(', ') || null,
            material_value_ids: effectiveSelectedMaterialValueIds,
            shapes_enabled: shapesEnabled,
            shape_ids: shapesEnabled ? selectedShapeIds : [],
            show_purity: false,
            engraving_enabled: engravingEnabled,
            engraving_label: engravingEnabled ? engravingLabel || null : null,
            custom_dropdowns_enabled: customDropdownsEnabled,
            custom_dropdowns: serializeProductCustomDropdowns(customDropdowns),
            shipping_enabled: shippingEnabled,
            care_warranty_enabled: careWarrantyEnabled,
            shipping_override_enabled: shippingEnabled ? shippingOverrideEnabled : false,
            care_warranty_override_enabled: careWarrantyEnabled ? careWarrantyOverrideEnabled : false,
            shipping_rule_id: shippingEnabled ? shippingRuleId || null : null,
            care_warranty_rule_id: careWarrantyEnabled ? careWarrantyRuleId || null : null,
            shipping_title_override: shippingEnabled && shippingOverrideEnabled ? shippingTitleOverride || null : null,
            shipping_body_override: shippingEnabled && shippingOverrideEnabled ? shippingBodyOverride || null : null,
            care_warranty_title_override: careWarrantyEnabled && careWarrantyOverrideEnabled ? careWarrantyTitleOverride || null : null,
            care_warranty_body_override: careWarrantyEnabled && careWarrantyOverrideEnabled ? careWarrantyBodyOverride || null : null,
            features,
          specifications: sanitizeRows(specifications),
          product_details: sanitizeRows(productDetails),
          detail_sections: sanitizeSections(detailSections),
          faq_items: serializeProductFaqItems(faqItems),
          image_1_path: imagePaths[0],
          image_2_path: imagePaths[1],
          image_3_path: imagePaths[2],
          image_4_path: imagePaths[3],
          image_1_alt: imageAlts[0]?.trim() || null,
          image_2_alt: imageAlts[1]?.trim() || null,
          image_3_alt: imageAlts[2]?.trim() || null,
          image_4_alt: imageAlts[3]?.trim() || null,
          video_path: videoPath,
          model_3d_url: model3dUrl.trim() || null,
          show_image_1: showImageSlots[0],
          show_image_2: showImageSlots[1],
          show_image_3: showImageSlots[2],
          show_image_4: showImageSlots[3],
          show_video: showVideo,
          custom_order_enabled: customOrderEnabled,
          ready_to_ship: readyToShip,
          allow_checkout: isCollectionProduct ? false : allowCheckout,
          hiphop_badges: hiphopBadges,
          chain_length_options: chainLengthOptions,
          hiphop_carat_label: hiphopCaratLabel || null,
          hiphop_carat_values: hiphopCaratValues,
          gram_weight_label: gramWeightLabel || null,
          gram_weight_value: gramWeightValue || null,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Unable to save product.')
      }
      await response.json().catch(() => null)
      if (productId || productSlug) {
        // The save response contains only the products row. Relation-backed fields
        // (shapes, materials, variants, links, FAQs, and pricing) are loaded by GET,
        // so never cache the partial PATCH response as a complete editor record.
        deleteCachedQueryData(getProductEditorCacheKey(saveUrl))
      }

      toast({
        title: productId || productSlug ? 'Product updated' : 'Product created',
        description: productId || productSlug
          ? 'The product changes were saved successfully.'
          : 'The new product was created successfully.',
      })

      shouldRedirect = true
      setRedirecting(true)
      router.push(backHref)
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Unable to save product.',
        variant: 'destructive',
      })
      setRedirecting(false)
    } finally {
      if (!shouldRedirect) {
        setSaving(false)
      }
    }
  }

  if (loadError) {
    return <div role="alert" className="space-y-4 p-6"><p>{loadError}</p><p>{productHydrated ? 'Your loaded product and edits are retained.' : 'Product editing is unavailable until loading succeeds.'}</p><button type="button" onClick={() => void loadData()} disabled={loading}>Retry loading</button></div>
  }

  if ((loading || !productHydrated) || !loadedBootstrapScopes.has('basics')) {
    return (
      <ProductFormLoadingShell
        backHref={backHref}
        title={pageTitle || (productId || productSlug ? 'Edit Product' : 'Create Product')}
        description={pageDescription || (productId || productSlug ? 'Update the saved product model and storefront details.' : 'Add a new jewelry product.')}
      />
    )
  }

  if (loading) {
    return <ProductFormSkeleton />
  }

  return (
    <>
    <div className="flex flex-col gap-10">
      {redirecting ? <ProductFormRedirectOverlay /> : null}

      <ProductFormHeader
        backHref={backHref}
        title={pageTitle || (productId || productSlug ? 'Edit Product' : 'Create Product')}
        description={pageDescription || (productId || productSlug ? 'Update the saved product model and storefront details.' : 'Add a new jewelry product.')}
      />

      {!productId && !productSlug ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={applyTestData}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            Autofill Test Data
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-8">
        <ProductFormStepBar
          steps={PRODUCT_FORM_STEPS}
          activeStep={activeStep}
          onStepChange={setActiveStep}
          onStepIntent={(step) => {
            const scopes: Partial<Record<ProductFormStepId, CatalogBootstrapScope[]>> = {
              pricing: ['pricing'],
              attributes: ['pricing', 'attributes'],
              content: ['content'],
              media: ['pricing'],
            }
            void Promise.all((scopes[step] ?? []).map((scope) => loadBootstrapScope(scope)))
          }}
        />

        {activeStep === 'basics' ? (
          <>
            <ProductBasicInfoCard
              name={name}
              setName={setName}
              sku={sku}
              setSku={setSku}
              featured={featured}
              setFeatured={setFeatured}
              inputClassName={inputClassName}
            />

            <ProductCategoryCard
              mainCategoryId={mainCategoryId}
              onMainCategoryChange={(value) => {
                setMainCategoryId(value)
                setSubcategoryId('')
                setOptionId('')
                setLinkedSubcategoryIds([])
                setLinkedOptionIds([])
              }}
              categories={categories}
              forceHipHopCategory={forceHipHopCategory}
              isLockedLaneProduct={isLockedLaneProduct}
              isCollectionProduct={isCollectionProduct}
              categorySubcategories={categorySubcategories}
              subcategoryId={subcategoryId}
              onSubcategoryChange={(value) => {
                setSubcategoryId(value)
                setOptionId('')
              }}
              linkedSubcategoryCandidates={linkedSubcategoryCandidates}
              linkedSubcategoryIds={linkedSubcategoryIds}
              onLinkedSubcategoryToggle={(value) => setLinkedSubcategoryIds((prev) => toggleInArray(prev, value))}
              optionId={optionId}
              setOptionId={setOptionId}
              subcategoryOptions={subcategoryOptions}
              linkedOptionCandidates={linkedOptionCandidates}
              linkedOptionIds={linkedOptionIds}
              onLinkedOptionToggle={(value) => setLinkedOptionIds((prev) => toggleInArray(prev, value))}
              styleId={styleId}
              setStyleId={setStyleId}
              styles={styles}
              selectedPath={selectedPath}
            />

            <ProductLaneRuleCards
              isHiphopProduct={isHiphopProduct}
              isCollectionProduct={isCollectionProduct}
              allowCheckout={allowCheckout}
              setAllowCheckout={setAllowCheckout}
            />

            <ProductExperienceCard
              forcedLane={forcedLane ?? null}
              detailTemplate={detailTemplate}
              setDetailTemplate={setDetailTemplate}
              isHiphopProduct={isHiphopProduct}
              readyToShip={readyToShip}
              setReadyToShip={setReadyToShip}
              customOrderEnabled={customOrderEnabled}
              setCustomOrderEnabled={setCustomOrderEnabled}
              hiphopBadgeInput={hiphopBadgeInput}
              setHiphopBadgeInput={setHiphopBadgeInput}
              addHiphopBadge={addHiphopBadge}
              hiphopBadges={hiphopBadges}
              removeHiphopBadge={(value) => setHiphopBadges((prev) => prev.filter((item) => item !== value))}
              chainLengthInput={chainLengthInput}
              setChainLengthInput={setChainLengthInput}
              addChainLengthOption={addChainLengthOption}
              chainLengthOptions={chainLengthOptions}
              removeChainLengthOption={(value) => setChainLengthOptions((prev) => prev.filter((item) => item !== value))}
              hiphopCaratLabel={hiphopCaratLabel}
              setHiphopCaratLabel={setHiphopCaratLabel}
              gramWeightLabel={gramWeightLabel}
              setGramWeightLabel={setGramWeightLabel}
              hiphopCaratInput={hiphopCaratInput}
              setHiphopCaratInput={setHiphopCaratInput}
              addHiphopCaratValue={addHiphopCaratValue}
              hiphopCaratValues={hiphopCaratValues}
              removeHiphopCaratValue={(value) => setHiphopCaratValues((prev) => prev.filter((item) => item !== value))}
              gramWeightValue={gramWeightValue}
              setGramWeightValue={setGramWeightValue}
              inputClassName={inputClassName}
              secondaryButtonClassName={secondaryButtonClassName}
            />
          </>
        ) : null}

        {activeStep === 'pricing' ? (
          <>
            <ProductPricingSummaryCard
              combinedMetalOptions={combinedMetalOptions}
              selectedMetalIds={selectedMetalIds}
              onSelectedMetalToggle={(value) => setSelectedMetalIds((prev) => toggleInArray(prev, value))}
              defaultMetalVariant={defaultMetalVariant}
              selectedBasePriceEntry={selectedBasePriceEntry}
              getMetalVariantLabel={getMetalVariantLabel}
              discountPrice={discountPrice}
              setDiscountPrice={setDiscountPrice}
              gstSlabId={gstSlabId}
              setGstSlabId={setGstSlabId}
              gstSlabs={gstSlabs}
              inputClassName={inputClassName}
            />

            <ProductMetalOptionsCard
              metalVariants={metalVariants}
              combinedMetalOptions={combinedMetalOptions}
              setMetalVariants={setMetalVariants}
              getMetalVariantLabel={getMetalVariantLabel}
              selectedMetalIds={selectedMetalIds}
              onMetalAdd={(metalId) => setSelectedMetalIds((prev) => prev.includes(metalId) ? prev : [...prev, metalId])}
              onMetalRemove={(metalId) => setSelectedMetalIds((prev) => prev.filter((id) => id !== metalId))}
              onMetalReplace={(oldMetalId, newMetalId) => setSelectedMetalIds((prev) => prev.map((id) => id === oldMetalId ? newMetalId : id))}
              inputClassName={inputClassName}
            />
          </>
        ) : null}

        {activeStep === 'attributes' ? (
          <ProductAttributesStep
            certificates={certificates}
            selectedCertificateIds={selectedCertificateIds}
            onCertificateToggle={(value) => setSelectedCertificateIds((prev) => toggleInArray(prev, value))}
            ringCategories={ringCategories}
            ringCategorySizes={ringCategorySizes}
            ringSizesEnabled={ringSizesEnabled}
            onRingSizesEnabledChange={(next) => {
              setRingSizesEnabled(next)
              if (!next) setRingCategoryId('')
            }}
            ringCategoryId={ringCategoryId}
            setRingCategoryId={setRingCategoryId}
            gemstoneLabel={gemstoneLabel}
            setGemstoneLabel={setGemstoneLabel}
            materialValues={materialValues}
            effectiveSelectedMaterialValueIds={effectiveSelectedMaterialValueIds}
            onMaterialValueToggle={(value) =>
              setSelectedMaterialValueIds((prev) => {
                const base = prev.length > 0 ? prev : effectiveSelectedMaterialValueIds
                return toggleInArray(base, value)
              })
            }
            shapesEnabled={shapesEnabled}
            onShapesEnabledChange={(next) => {
              setShapesEnabled(next)
              if (!next) {
                setSelectedShapeIds([])
              }
            }}
            stoneShapes={stoneShapes}
            selectedShapeIds={selectedShapeIds}
            onShapeToggle={(value) => setSelectedShapeIds((prev) => toggleInArray(prev, value))}
            fitEnabled={fitEnabled}
            onFitEnabledChange={(next) => {
              setFitEnabled(next)
              if (!next) {
                setFitOptions([])
                setFitLabel('Fit')
              }
            }}
            fitLabel={fitLabel}
            setFitLabel={setFitLabel}
            fitInput={fitInput}
            setFitInput={setFitInput}
            addFitOption={addFitOption}
            fitOptions={fitOptions}
            removeFitOption={(value) => setFitOptions((prev) => prev.filter((item) => item !== value))}
            engravingEnabled={engravingEnabled}
            setEngravingEnabled={setEngravingEnabled}
            engravingLabel={engravingLabel}
            setEngravingLabel={setEngravingLabel}
            customDropdownsEnabled={customDropdownsEnabled}
            onCustomDropdownsEnabledChange={setCustomDropdownsEnabled}
            customDropdowns={customDropdowns}
            onCustomDropdownsChange={setCustomDropdowns}
            inputClassName={inputClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}

        {activeStep === 'content' ? (
          <ProductContentStep
            description={description}
            setDescription={setDescription}
            tagLine={tagLine}
            setTagLine={setTagLine}
            seoTitle={seoTitle}
            setSeoTitle={setSeoTitle}
            h1Title={h1Title}
            setH1Title={setH1Title}
            seoDescription={seoDescription}
            setSeoDescription={setSeoDescription}
            featureInput={featureInput}
            setFeatureInput={setFeatureInput}
            addFeature={addFeature}
            features={features}
            setFeatures={setFeatures}
            shippingEnabled={shippingEnabled}
            setShippingEnabled={setShippingEnabled}
            shippingRules={shippingRules}
            shippingRuleId={shippingRuleId}
            setShippingRuleId={setShippingRuleId}
            shippingOverrideEnabled={shippingOverrideEnabled}
            setShippingOverrideEnabled={setShippingOverrideEnabled}
            shippingTitleOverride={shippingTitleOverride}
            setShippingTitleOverride={setShippingTitleOverride}
            shippingBodyOverride={shippingBodyOverride}
            setShippingBodyOverride={setShippingBodyOverride}
            careWarrantyEnabled={careWarrantyEnabled}
            setCareWarrantyEnabled={setCareWarrantyEnabled}
            careWarrantyRules={careWarrantyRules}
            careWarrantyRuleId={careWarrantyRuleId}
            setCareWarrantyRuleId={setCareWarrantyRuleId}
            careWarrantyOverrideEnabled={careWarrantyOverrideEnabled}
            setCareWarrantyOverrideEnabled={setCareWarrantyOverrideEnabled}
            careWarrantyTitleOverride={careWarrantyTitleOverride}
            setCareWarrantyTitleOverride={setCareWarrantyTitleOverride}
            careWarrantyBodyOverride={careWarrantyBodyOverride}
            setCareWarrantyBodyOverride={setCareWarrantyBodyOverride}
            inputClassName={inputClassName}
            secondaryButtonClassName={secondaryButtonClassName}
          />
        ) : null}

        {activeStep === 'details' ? (
          <ProductDetailsStep
            specifications={specifications}
            setSpecifications={setSpecifications}
            productDetails={productDetails}
            setProductDetails={setProductDetails}
            faqItems={faqItems}
            setFaqItems={setFaqItems}
            onFaqValidationError={(message) =>
              toast({
                title: 'FAQ needs both fields',
                description: message,
                variant: 'destructive',
              })
            }
            detailSections={detailSections}
            setDetailSections={setDetailSections}
            createEmptyRow={emptyRow}
            createEmptySection={emptySection}
            inputClassName={inputClassName}
          />
        ) : null}

        {activeStep === 'media' ? (
          <>
            <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Media</h2>
                  <p className="mt-2 text-xs text-muted-foreground">Upload storefront media and do a final review before saving.</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/10 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">{selectedPath}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {isHiphopProduct ? 'Hip Hop presentation is active for this product.' : 'Standard product presentation is active.'}
                  </p>
                </div>
              </div>

                <div className="mt-6">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">Base Image Carousel</p>
                    <p className="mt-1 text-xs text-muted-foreground">Shared fallback media when a metal variant does not have its own images.</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {['Image 1', 'Image 2', 'Image 3', 'Image 4'].map((label, index) => (
                      <MediaThumbnailSlot
                        key={label}
                        inputId={`base-media-${index}`}
                        label={label}
                        path={imagePaths[index]}
                        visible={showImageSlots[index]}
                        uploading={Boolean(uploadingSlots[`base-image-${index}`])}
                        onVisibleChange={(next) => setShowImageSlots((prev) => prev.map((entry, slotIndex) => (slotIndex === index ? next : entry)))}
                        onClear={() => {
                          setImageSlots((prev) => prev.map((entry, slotIndex) => (slotIndex === index ? '' : entry)))
                          setImagePaths((prev) => prev.map((entry, slotIndex) => (slotIndex === index ? null : entry)))
                          setImageAlts((prev) => prev.map((entry, slotIndex) => (slotIndex === index ? '' : entry)))
                        }}
                        onUpload={async (file) => {
                          setUploadingSlots((prev) => ({ ...prev, [`base-image-${index}`]: true }))
                          try {
                            const { path, provider } = await uploadMedia(file, 'image', isHiphopProduct ? 'hiphop' : 'products')
                            setImageSlots((prev) => prev.map((entry, slotIndex) => (slotIndex === index ? path : entry)))
                            setImagePaths((prev) => prev.map((entry, slotIndex) => (slotIndex === index ? path : entry)))
                            toast({
                              title: 'Uploaded',
                              description: `${label} uploaded successfully to ${provider === 's3' ? 'AWS S3' : provider === 'r2' ? 'Cloudflare R2' : 'Supabase Storage'}.`,
                            })
                          } catch (error) {
                            toast({
                              title: 'Upload failed',
                              description: error instanceof Error ? error.message : `Unable to upload ${label.toLowerCase()}.`,
                              variant: 'destructive',
                            })
                          } finally {
                            setUploadingSlots((prev) => ({ ...prev, [`base-image-${index}`]: false }))
                          }
                        }}
                      />
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {['Image 1 Alt Text', 'Image 2 Alt Text', 'Image 3 Alt Text', 'Image 4 Alt Text'].map((label, index) => (
                      <FormField key={label} label={label}>
                        <input
                          value={imageAlts[index] ?? ''}
                          onChange={(event) => setImageAlts((prev) => prev.map((entry, slotIndex) => (slotIndex === index ? event.target.value : entry)))}
                          className={inputClassName}
                          placeholder="Optional image description for SEO/accessibility"
                        />
                      </FormField>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <MediaVideoUrlRow
                    value={videoPath ?? ''}
                    label="Legacy Shared Video URL"
                    onChange={(nextValue) => {
                      const trimmed = nextValue.trim()
                      setVideoPath(trimmed || null)
                    }}
                  />
                </div>

                <div className="mt-4">
                  <MediaVideoUrlRow
                    value={model3dUrl}
                    label="3D Model GLB URL"
                    helperText="Paste the Cloudflare/R2 direct .glb URL. This keeps images and video unchanged and adds an optional interactive 3D viewer on product details."
                    onChange={setModel3dUrl}
                  />
                </div>

              <div className="mt-6 rounded-lg border border-border bg-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Combined Option Media</h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Manage the repeatable image and video items for the default fallback block and for each combined metal / purity option. Storefront will use the selected option media first, then fall back to the default block if needed.
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveVariantMediaKey('default')
                      setActiveVariantMediaIndex(null)
                    }}
                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                      activeVariantMediaKey === 'default'
                        ? 'border-foreground bg-foreground text-white'
                        : 'border-border bg-white text-foreground hover:bg-secondary'
                    }`}
                  >
                    Default Fallback
                  </button>
                  {metalVariants.map((entry) => (
                    <button
                      key={entry.metal_id}
                      type="button"
                      onClick={() => {
                        setActiveVariantMediaKey(entry.metal_id)
                        setActiveVariantMediaIndex(null)
                      }}
                      className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors ${
                        activeVariantMediaKey === entry.metal_id
                          ? 'border-foreground bg-foreground text-white'
                          : 'border-border bg-white text-foreground hover:bg-secondary'
                      }`}
                    >
                      {getMetalVariantLabel(entry.metal_id)}
                    </button>
                  ))}
                </div>

                {(() => {
                  const isDefaultFallback = activeVariantMediaKey === 'default'
                  const items = isDefaultFallback ? defaultVariantMediaItems : getVariantMediaItems(activeVariantMediaKey)
                  const sectionLabel = isDefaultFallback ? 'Default Fallback' : getMetalVariantLabel(activeVariantMediaKey)
                  const activeItem = activeVariantMediaIndex == null ? null : items[activeVariantMediaIndex] ?? null

                  return (
                    <div className="mt-5 rounded-lg border border-border/70 bg-white p-5">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-foreground">{sectionLabel}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isDefaultFallback
                            ? 'This media shows when a combined option does not have its own media.'
                            : 'This media is shown when the shopper selects this combined option.'}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {items.map((item, itemIndex) => {
                          const isActive = activeVariantMediaIndex === itemIndex
                          const previewPath = toStoragePreviewUrl(item.media_path)
                          const uploadKey = `variant-media-${activeVariantMediaKey}-${itemIndex}`
                          const inputId = `variant-media-upload-${activeVariantMediaKey}-${itemIndex}`
                          const isUploading = Boolean(uploadingSlots[uploadKey])
                          return (
                            <div
                              key={`variant-media-thumb-${activeVariantMediaKey}-${itemIndex}`}
                              className={`group relative h-24 w-24 overflow-hidden rounded-xl border transition-colors ${
                                isActive ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-primary'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveVariantMediaIndex(itemIndex)
                                  if (item.media_type === 'video') {
                                    setVideoLibraryTarget({
                                      metalId: isDefaultFallback ? null : activeVariantMediaKey,
                                      itemIndex,
                                    })
                                    return
                                  }
                                  document.getElementById(inputId)?.click()
                                }}
                                disabled={isUploading}
                                className="block h-full w-full cursor-pointer disabled:cursor-wait"
                                title={item.media_type === 'video' ? 'Choose from Cloudflare video library' : 'Upload image'}
                              >
                                {item.media_type === 'image' && previewPath ? (
                                  // Native img is intentional for temporary blob/storage previews with unknown dimensions.
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={previewPath} alt={`${sectionLabel} item ${itemIndex + 1}`} className="h-full w-full object-cover" />
                                ) : item.media_type === 'video' && previewPath ? (
                                  <div className="relative h-full w-full bg-black">
                                    <video
                                      src={`${previewPath}#t=0.01`}
                                      muted
                                      playsInline
                                      preload="metadata"
                                      className="h-full w-full object-cover"
                                      aria-label={`${sectionLabel} video ${itemIndex + 1}`}
                                    />
                                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-center text-[9px] font-semibold uppercase tracking-[0.16em] text-white">
                                      Video {itemIndex + 1}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex h-full w-full flex-col items-center justify-center bg-secondary/20 px-2 text-center">
                                    <Plus size={16} className="mb-2 text-muted-foreground" />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      {item.media_type}
                                    </span>
                                    <span className="mt-1 text-[11px] text-foreground">
                                      {item.media_type === 'video'
                                        ? item.media_path ? 'Change video' : 'Choose library'
                                        : item.media_path ? 'Change file' : 'Upload'}
                                    </span>
                                  </div>
                                )}
                              </button>
                              <input
                                id={inputId}
                                type="file"
                                accept={item.media_type === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,image/webp,image/avif'}
                                className="hidden"
                                onChange={async (event) => {
                                  const input = event.currentTarget
                                  const file = input.files?.[0]
                                  if (!file) return
                                  setActiveVariantMediaIndex(itemIndex)
                                  setUploadingSlots((prev) => ({ ...prev, [uploadKey]: true }))
                                  try {
                                    const { path: uploadedPath, provider } = await uploadMedia(
                                      file,
                                      item.media_type === 'video' ? 'video' : 'image',
                                      isHiphopProduct ? 'hiphop' : 'products'
                                    )
                                    updateVariantMediaItem(isDefaultFallback ? null : activeVariantMediaKey, itemIndex, (entry) => ({
                                      ...entry,
                                      media_path: uploadedPath,
                                    }))
                                    toast({
                                      title: 'Uploaded',
                                      description: `${sectionLabel} ${item.media_type} uploaded successfully to ${provider === 's3' ? 'AWS S3' : provider === 'r2' ? 'Cloudflare R2' : 'Supabase Storage'}.`,
                                    })
                                  } catch (error) {
                                    toast({
                                      title: 'Upload failed',
                                      description: error instanceof Error ? error.message : `Unable to upload ${item.media_type}.`,
                                      variant: 'destructive',
                                    })
                                  } finally {
                                    setUploadingSlots((prev) => ({ ...prev, [uploadKey]: false }))
                                    input.value = ''
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  setActiveVariantMediaIndex(itemIndex)
                                  setDeleteVariantMediaTarget({
                                    metalId: isDefaultFallback ? null : activeVariantMediaKey,
                                    itemIndex,
                                    label: `${sectionLabel} media ${itemIndex + 1}`,
                                  })
                                }}
                                className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-foreground opacity-0 shadow-sm transition-opacity hover:text-destructive group-hover:opacity-100"
                                aria-label={`Delete ${sectionLabel} media ${itemIndex + 1}`}
                              >
                                <Trash2 size={14} />
                              </button>
                              {isUploading ? (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 text-foreground">
                                  <div className="flex flex-col items-center gap-1">
                                    <Loader2 size={18} className="animate-spin" />
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Uploading</span>
                                  </div>
                                </div>
                              ) : null}
                              <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                                {itemIndex + 1}
                              </div>
                            </div>
                          )
                        })}

                        <button
                          type="button"
                          onClick={() => addVariantMediaItem(isDefaultFallback ? null : activeVariantMediaKey)}
                          className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-white text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                        >
                          <Plus size={18} />
                          <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em]">Add</span>
                        </button>
                      </div>

                      {activeItem ? (
                        <div className="mt-5 rounded-lg border border-border bg-secondary/10 p-4">
                          {(() => {
                            const itemIndex = activeVariantMediaIndex ?? 0
                            const uploadKey = `variant-media-${activeVariantMediaKey}-${itemIndex}`
                            return (
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">
                                      {sectionLabel} media {itemIndex + 1}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Upload a file or paste a public URL for this selected thumbnail.
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteVariantMediaTarget({
                                        metalId: isDefaultFallback ? null : activeVariantMediaKey,
                                        itemIndex,
                                        label: `${sectionLabel} media ${itemIndex + 1}`,
                                      })
                                    }
                                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
                                  >
                                    {Boolean(uploadingSlots[uploadKey]) ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                    Remove
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[180px_minmax(0,1fr)_auto]">
                                  <div>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      Media Type
                                    </label>
                                    <Select
                                      value={activeItem.media_type}
                                      onValueChange={(value) =>
                                        updateVariantMediaItem(isDefaultFallback ? null : activeVariantMediaKey, itemIndex, (entry) => ({
                                          ...entry,
                                          media_type: value === 'video' ? 'video' : 'image',
                                        }))
                                      }
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="image">Image</SelectItem>
                                        <SelectItem value="video">Video</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      Media Path / URL
                                    </label>
                                    <input
                                      value={activeItem.media_path}
                                      onChange={(e) =>
                                        updateVariantMediaItem(isDefaultFallback ? null : activeVariantMediaKey, itemIndex, (entry) => ({
                                          ...entry,
                                          media_path: e.target.value,
                                        }))
                                      }
                                      placeholder={activeItem.media_type === 'video' ? 'https://...' : 'products/... or https://...'}
                                      className={inputClassName}
                                    />
                                    {activeItem.media_path ? (
                                      <p className="mt-2 break-all text-[11px] text-muted-foreground">{activeItem.media_path}</p>
                                    ) : null}
                                  </div>

                                  <div className="xl:col-span-3">
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      Alt Text
                                    </label>
                                    <input
                                      value={activeItem.alt_text ?? ''}
                                      onChange={(e) =>
                                        updateVariantMediaItem(isDefaultFallback ? null : activeVariantMediaKey, itemIndex, (entry) => ({
                                          ...entry,
                                          alt_text: e.target.value,
                                        }))
                                      }
                                      placeholder="Optional media description for SEO/accessibility"
                                      className={inputClassName}
                                    />
                                  </div>

                                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 xl:col-span-3">
                                    {activeItem.media_type === 'video' ? (
                                      <button
                                        type="button"
                                        onClick={() => setVideoLibraryTarget({
                                          metalId: isDefaultFallback ? null : activeVariantMediaKey,
                                          itemIndex,
                                        })}
                                        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[#C9E1F5] bg-[#F1F8FE] px-4 py-2 text-sm font-semibold text-[#245F96] transition-colors hover:border-[#9BC5E9] hover:bg-[#E8F4FD]"
                                      >
                                        <Video size={14} />
                                        Choose from library
                                      </button>
                                    ) : null}
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                                      <Plus size={14} />
                                      Upload
                                      <input
                                        type="file"
                                        accept={activeItem.media_type === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,image/webp,image/avif'}
                                        className="hidden"
                                        onChange={async (event) => {
                                          const input = event.currentTarget
                                          const file = input.files?.[0]
                                          if (!file) return
                                          setUploadingSlots((prev) => ({ ...prev, [uploadKey]: true }))
                                          try {
                                            const { path: uploadedPath, provider } = await uploadMedia(
                                              file,
                                              activeItem.media_type === 'video' ? 'video' : 'image',
                                              isHiphopProduct ? 'hiphop' : 'products'
                                            )
                                            updateVariantMediaItem(isDefaultFallback ? null : activeVariantMediaKey, itemIndex, (entry) => ({
                                              ...entry,
                                              media_path: uploadedPath,
                                            }))
                                            toast({
                                              title: 'Uploaded',
                                              description: `${sectionLabel} ${activeItem.media_type} uploaded successfully to ${provider === 's3' ? 'AWS S3' : provider === 'r2' ? 'Cloudflare R2' : 'Supabase Storage'}.`,
                                            })
                                          } catch (error) {
                                            toast({
                                              title: 'Upload failed',
                                              description: error instanceof Error ? error.message : `Unable to upload ${activeItem.media_type}.`,
                                              variant: 'destructive',
                                            })
                                          } finally {
                                            setUploadingSlots((prev) => ({ ...prev, [uploadKey]: false }))
                                            if (input) input.value = ''
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      ) : (
                        <div className="mt-5 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                          No media items added yet for this block. Click the <span className="font-semibold text-foreground">Add</span> tile to create the first thumbnail.
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>

              {(selectedMetalIds.length > 0 || metalMedia.length > 0) ? (
                <div className="mt-6 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  Legacy metal-specific media remains stored in the background for older products, but new work should use the <span className="font-semibold text-foreground">Combined Option Media</span> block above.
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        <ProductFormStepActions
          isFirstStep={isFirstStep}
          isLastStep={isLastStep}
          saving={saving}
          canSaveOnCurrentStep={Boolean(productId || productSlug)}
          backHref={backHref}
          submitLabel={productId || productSlug ? 'Update Product' : 'Create Product'}
          onPrevious={() => setActiveStep(PRODUCT_FORM_STEPS[Math.max(0, activeStepIndex - 1)].id)}
          onNext={() => setActiveStep(PRODUCT_FORM_STEPS[Math.min(PRODUCT_FORM_STEPS.length - 1, activeStepIndex + 1)].id)}
        />
      </form>
    </div>
    <ConfirmDialog
      isOpen={Boolean(deleteVariantMediaTarget)}
      title="Delete media block?"
      description={`Are you sure you want to delete "${deleteVariantMediaTarget?.label ?? 'this media block'}"?`}
      confirmText="Delete"
      type="delete"
      onConfirm={() => {
        if (!deleteVariantMediaTarget) return
        removeVariantMediaItem(deleteVariantMediaTarget.metalId, deleteVariantMediaTarget.itemIndex)
        setDeleteVariantMediaTarget(null)
      }}
      onCancel={() => setDeleteVariantMediaTarget(null)}
    />
    <VideoLibraryDialog
      open={Boolean(videoLibraryTarget)}
      onClose={() => setVideoLibraryTarget(null)}
      onSelect={(video) => {
        if (!videoLibraryTarget) return
        updateVariantMediaItem(videoLibraryTarget.metalId, videoLibraryTarget.itemIndex, (item) => ({
          ...item,
          media_type: 'video',
          media_path: video.url,
        }))
        setVideoLibraryTarget(null)
        toast({
          title: 'Video selected',
          description: 'The Cloudflare video was assigned to this media slot.',
        })
      }}
    />
    </>
  )
}

function MediaThumbnailSlot({
  inputId,
  label,
  path,
  visible,
  uploading = false,
  onVisibleChange,
  onUpload,
  onClear,
}: {
  inputId: string
  label: string
  path: string | null | undefined
  visible: boolean
  uploading?: boolean
  onVisibleChange: (next: boolean) => void
  onUpload: (file: File) => void | Promise<void>
  onClear?: () => void
}) {
  return (
    <div className="group relative h-24 w-24">
      <label htmlFor={inputId} className="block h-full w-full cursor-pointer overflow-hidden rounded-xl border border-border bg-white transition-colors hover:border-primary">
        {path ? (
          // Native img is intentional for temporary upload previews with unknown dimensions.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={toStoragePreviewUrl(path)} alt={`${label} preview`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center border-2 border-dashed border-border text-muted-foreground">
            <Plus size={18} />
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-foreground">
            <div className="flex flex-col items-center gap-1">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Uploading</span>
            </div>
          </div>
        ) : null}
      </label>

      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onVisibleChange(!visible)
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-foreground"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        {path && onClear && !uploading ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClear()
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-foreground"
            aria-label={`Delete ${label}`}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(event) => {
          const input = event.currentTarget
          const file = input.files?.[0]
          if (!file) return
          void onUpload(file)
          if (input) input.value = ''
        }}
      />
    </div>
  )
}

function MediaVideoUrlRow({
  value,
  label = 'Video URL',
  helperText = 'Paste the public video URL to be used on the storefront.',
  onChange,
}: {
  value: string
  label?: string
  helperText?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-white px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-secondary/30 text-foreground">
          <Video size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helperText}</p>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="url"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="https://..."
              className={inputClassName}
            />
            {value ? (
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-white text-foreground transition-colors hover:border-primary"
                aria-label={`Clear ${label}`}
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

const inputClassName =
  'w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'

const secondaryButtonClassName =
  'rounded bg-secondary px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors'
