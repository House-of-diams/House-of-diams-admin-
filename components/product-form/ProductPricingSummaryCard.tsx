'use client'

import type { Dispatch, SetStateAction } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField, TogglePillGroup } from '@/components/product-form/ProductFormControls'
import type {
  CatalogGstSlab,
  CatalogMetal,
  ProductMetalVariant,
  ProductPurityPrice,
} from '@/lib/product-catalog'
import { buildCombinedMetalDisplayLabel } from '@/lib/product-metal-variants'

function formatDollarPrice(value: number) {
  return value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

export function ProductPricingSummaryCard({
  combinedMetalOptions,
  selectedMetalIds,
  onSelectedMetalToggle,
  defaultMetalVariant,
  selectedBasePriceEntry,
  getMetalVariantLabel,
  discountPrice,
  setDiscountPrice,
  gstSlabId,
  setGstSlabId,
  gstSlabs,
  stockQuantity,
  setStockQuantity,
  inputClassName,
}: {
  combinedMetalOptions: CatalogMetal[]
  selectedMetalIds: string[]
  onSelectedMetalToggle: (value: string) => void
  defaultMetalVariant: ProductMetalVariant | null
  selectedBasePriceEntry: ProductPurityPrice | null
  getMetalVariantLabel: (metalId: string) => string
  discountPrice: string
  setDiscountPrice: Dispatch<SetStateAction<string>>
  gstSlabId: string
  setGstSlabId: Dispatch<SetStateAction<string>>
  gstSlabs: CatalogGstSlab[]
  stockQuantity: string
  setStockQuantity: Dispatch<SetStateAction<string>>
  inputClassName: string
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-8 text-xl font-bold text-foreground">Pricing</h2>
      <div className="mb-8 rounded-lg border border-border bg-secondary/10 p-4">
        <TogglePillGroup
          label="Metal Options"
          items={combinedMetalOptions.map((item) => ({ id: item.id, label: buildCombinedMetalDisplayLabel(item) }))}
          selected={selectedMetalIds}
          onToggle={onSelectedMetalToggle}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Pick the sellable combined metal options here first. The prices and media blocks below will follow the same selection.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FormField label="Base Price *">
          <div className="rounded-lg border border-border bg-secondary/10 px-4 py-3 text-sm text-foreground">
            {defaultMetalVariant ? (
              <div>
                <p className="font-semibold">{getMetalVariantLabel(defaultMetalVariant.metal_id)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDollarPrice(Number(defaultMetalVariant.price || 0))}
                </p>
              </div>
            ) : selectedBasePriceEntry ? (
              <div>
                <p className="font-semibold">Legacy base price</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDollarPrice(Number(selectedBasePriceEntry.price || 0))}
                </p>
              </div>
            ) : (
              <span className="text-muted-foreground">Add at least one metal option first.</span>
            )}
          </div>
        </FormField>
        <FormField label="Discount Price">
          <input type="number" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)} className={inputClassName} />
        </FormField>
        <FormField label="GST Slab">
          <Select value={gstSlabId || '__none__'} onValueChange={(value) => setGstSlabId(value === '__none__' ? '' : value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select GST slab" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No GST slab</SelectItem>
              {gstSlabs
                .filter((item) => item.status !== 'hidden')
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.percentage}%)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Stock Quantity">
          <input type="number" min="0" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} className={inputClassName} />
        </FormField>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Base price follows the default metal option shown below.
      </p>
    </section>
  )
}
