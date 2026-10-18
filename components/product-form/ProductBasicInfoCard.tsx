'use client'

import type { Dispatch, SetStateAction } from 'react'
import { FormField } from '@/components/product-form/ProductFormControls'

export function ProductBasicInfoCard({
  name,
  setName,
  sku,
  setSku,
  featured,
  setFeatured,
  inputClassName,
}: {
  name: string
  setName: Dispatch<SetStateAction<string>>
  sku: string
  setSku: Dispatch<SetStateAction<string>>
  featured: boolean
  setFeatured: Dispatch<SetStateAction<boolean>>
  inputClassName: string
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-8 text-xl font-bold text-foreground">Basic Information</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Product Name *">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClassName} />
        </FormField>
        <FormField label="SKU *">
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClassName} />
        </FormField>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <input id="featured" type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="rounded border-border" />
        <label htmlFor="featured" className="text-sm font-medium text-foreground">Featured Product</label>
      </div>
    </section>
  )
}
