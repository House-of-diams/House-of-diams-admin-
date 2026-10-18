'use client'

import type { Dispatch, KeyboardEvent, SetStateAction } from 'react'
import type { ProductContentRule } from '@/lib/product-catalog'
import { FormField, TagList } from '@/components/product-form/ProductFormControls'
import { PolicyEditor } from '@/components/product-form/PolicyEditor'

export function ProductContentStep({
  description,
  setDescription,
  tagLine,
  setTagLine,
  seoTitle,
  setSeoTitle,
  h1Title,
  setH1Title,
  seoDescription,
  setSeoDescription,
  featureInput,
  setFeatureInput,
  addFeature,
  features,
  setFeatures,
  shippingEnabled,
  setShippingEnabled,
  shippingRules,
  shippingRuleId,
  setShippingRuleId,
  shippingOverrideEnabled,
  setShippingOverrideEnabled,
  shippingTitleOverride,
  setShippingTitleOverride,
  shippingBodyOverride,
  setShippingBodyOverride,
  careWarrantyEnabled,
  setCareWarrantyEnabled,
  careWarrantyRules,
  careWarrantyRuleId,
  setCareWarrantyRuleId,
  careWarrantyOverrideEnabled,
  setCareWarrantyOverrideEnabled,
  careWarrantyTitleOverride,
  setCareWarrantyTitleOverride,
  careWarrantyBodyOverride,
  setCareWarrantyBodyOverride,
  inputClassName,
  secondaryButtonClassName,
}: {
  description: string
  setDescription: Dispatch<SetStateAction<string>>
  tagLine: string
  setTagLine: Dispatch<SetStateAction<string>>
  seoTitle: string
  setSeoTitle: Dispatch<SetStateAction<string>>
  h1Title: string
  setH1Title: Dispatch<SetStateAction<string>>
  seoDescription: string
  setSeoDescription: Dispatch<SetStateAction<string>>
  featureInput: string
  setFeatureInput: Dispatch<SetStateAction<string>>
  addFeature: () => void
  features: string[]
  setFeatures: Dispatch<SetStateAction<string[]>>
  shippingEnabled: boolean
  setShippingEnabled: Dispatch<SetStateAction<boolean>>
  shippingRules: ProductContentRule[]
  shippingRuleId: string
  setShippingRuleId: Dispatch<SetStateAction<string>>
  shippingOverrideEnabled: boolean
  setShippingOverrideEnabled: Dispatch<SetStateAction<boolean>>
  shippingTitleOverride: string
  setShippingTitleOverride: Dispatch<SetStateAction<string>>
  shippingBodyOverride: string
  setShippingBodyOverride: Dispatch<SetStateAction<string>>
  careWarrantyEnabled: boolean
  setCareWarrantyEnabled: Dispatch<SetStateAction<boolean>>
  careWarrantyRules: ProductContentRule[]
  careWarrantyRuleId: string
  setCareWarrantyRuleId: Dispatch<SetStateAction<string>>
  careWarrantyOverrideEnabled: boolean
  setCareWarrantyOverrideEnabled: Dispatch<SetStateAction<boolean>>
  careWarrantyTitleOverride: string
  setCareWarrantyTitleOverride: Dispatch<SetStateAction<string>>
  careWarrantyBodyOverride: string
  setCareWarrantyBodyOverride: Dispatch<SetStateAction<string>>
  inputClassName: string
  secondaryButtonClassName: string
}) {
  const handleFeatureKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addFeature()
  }

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h2 className="mb-8 text-xl font-bold text-foreground">Content</h2>
        <div className="space-y-4">
          <FormField label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputClassName} />
          </FormField>
          <FormField label="Tag Line">
            <input value={tagLine} onChange={(e) => setTagLine(e.target.value)} className={inputClassName} />
          </FormField>
          <div className="rounded-lg border border-border bg-secondary/10 p-4">
            <div className="mb-4">
              <p className="text-sm font-semibold text-foreground">Optional SEO Fields</p>
              <p className="mt-1 text-xs text-muted-foreground">Leave blank to use the automatic product name and description metadata.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FormField label="SEO Title">
                <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputClassName} placeholder="Custom Google title" />
              </FormField>
              <FormField label="On-page H1 Title">
                <input value={h1Title} onChange={(e) => setH1Title(e.target.value)} className={inputClassName} placeholder="Optional display title" />
              </FormField>
              <div className="lg:col-span-2">
                <FormField label="SEO Meta Description">
                  <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} rows={3} className={inputClassName} placeholder="Custom Google description, ideally around 150-160 characters." />
                </FormField>
              </div>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Highlights</label>
            <div className="flex gap-2">
              <input value={featureInput} onChange={(e) => setFeatureInput(e.target.value)} onKeyDown={handleFeatureKeyDown} className={`${inputClassName} flex-1`} />
              <button type="button" onClick={addFeature} className={secondaryButtonClassName}>Add</button>
            </div>
            <TagList items={features} onRemove={(value) => setFeatures((prev) => prev.filter((item) => item !== value))} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <h2 className="mb-8 text-xl font-bold text-foreground">Store Policies</h2>
        <div className="space-y-6">
          <PolicyEditor
            title="Shipping"
            description="Select a reusable shipping rule and optionally override it for this product."
            enabled={shippingEnabled}
            onEnabledChange={(next) => {
              setShippingEnabled(next)
              if (!next) {
                setShippingOverrideEnabled(false)
                setShippingRuleId('')
                setShippingTitleOverride('')
                setShippingBodyOverride('')
              }
            }}
            rules={shippingRules}
            selectedRuleId={shippingRuleId}
            onRuleChange={setShippingRuleId}
            overrideEnabled={shippingOverrideEnabled}
            onOverrideEnabledChange={(next) => {
              setShippingOverrideEnabled(next)
              if (!next) {
                setShippingTitleOverride('')
                setShippingBodyOverride('')
              }
            }}
            titleOverride={shippingTitleOverride}
            onTitleOverrideChange={setShippingTitleOverride}
            bodyOverride={shippingBodyOverride}
            onBodyOverrideChange={setShippingBodyOverride}
          />

          <PolicyEditor
            title="Care & Warranty"
            description="Select a reusable care rule and optionally override it for this product."
            enabled={careWarrantyEnabled}
            onEnabledChange={(next) => {
              setCareWarrantyEnabled(next)
              if (!next) {
                setCareWarrantyOverrideEnabled(false)
                setCareWarrantyRuleId('')
                setCareWarrantyTitleOverride('')
                setCareWarrantyBodyOverride('')
              }
            }}
            rules={careWarrantyRules}
            selectedRuleId={careWarrantyRuleId}
            onRuleChange={setCareWarrantyRuleId}
            overrideEnabled={careWarrantyOverrideEnabled}
            onOverrideEnabledChange={(next) => {
              setCareWarrantyOverrideEnabled(next)
              if (!next) {
                setCareWarrantyTitleOverride('')
                setCareWarrantyBodyOverride('')
              }
            }}
            titleOverride={careWarrantyTitleOverride}
            onTitleOverrideChange={setCareWarrantyTitleOverride}
            bodyOverride={careWarrantyBodyOverride}
            onBodyOverrideChange={setCareWarrantyBodyOverride}
          />
        </div>
      </section>
    </>
  )
}
