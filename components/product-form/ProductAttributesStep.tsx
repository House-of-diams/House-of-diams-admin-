'use client'

import type { Dispatch, SetStateAction } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField, PillToggle, TagList, TogglePillGroup } from '@/components/product-form/ProductFormControls'
import type {
  CatalogCertificate,
  CatalogMaterialValue,
  CatalogRingCategory,
  CatalogRingCategorySize,
  CatalogStoneShape,
} from '@/lib/product-catalog'
import type { ProductCustomDropdown } from '@/lib/product-custom-dropdowns'
import { ProductCustomDropdownEditor } from './ProductCustomDropdownEditor'

export function ProductAttributesStep({
  certificates,
  selectedCertificateIds,
  onCertificateToggle,
  ringCategories,
  ringCategorySizes,
  ringSizesEnabled,
  onRingSizesEnabledChange,
  ringCategoryId,
  setRingCategoryId,
  gemstoneLabel,
  setGemstoneLabel,
  materialValues,
  effectiveSelectedMaterialValueIds,
  onMaterialValueToggle,
  shapesEnabled,
  onShapesEnabledChange,
  stoneShapes,
  selectedShapeIds,
  onShapeToggle,
  fitEnabled,
  onFitEnabledChange,
  fitLabel,
  setFitLabel,
  fitInput,
  setFitInput,
  addFitOption,
  fitOptions,
  removeFitOption,
  engravingEnabled,
  setEngravingEnabled,
  engravingLabel,
  setEngravingLabel,
  inputClassName,
  secondaryButtonClassName,
  customDropdownsEnabled,
  onCustomDropdownsEnabledChange,
  customDropdowns,
  onCustomDropdownsChange,
}: {
  certificates: CatalogCertificate[]
  selectedCertificateIds: string[]
  onCertificateToggle: (value: string) => void
  ringCategories: CatalogRingCategory[]
  ringCategorySizes: CatalogRingCategorySize[]
  ringSizesEnabled: boolean
  onRingSizesEnabledChange: (value: boolean) => void
  ringCategoryId: string
  setRingCategoryId: Dispatch<SetStateAction<string>>
  gemstoneLabel: string
  setGemstoneLabel: Dispatch<SetStateAction<string>>
  materialValues: CatalogMaterialValue[]
  effectiveSelectedMaterialValueIds: string[]
  onMaterialValueToggle: (value: string) => void
  shapesEnabled: boolean
  onShapesEnabledChange: (value: boolean) => void
  stoneShapes: CatalogStoneShape[]
  selectedShapeIds: string[]
  onShapeToggle: (value: string) => void
  fitEnabled: boolean
  onFitEnabledChange: (value: boolean) => void
  fitLabel: string
  setFitLabel: Dispatch<SetStateAction<string>>
  fitInput: string
  setFitInput: Dispatch<SetStateAction<string>>
  addFitOption: () => void
  fitOptions: string[]
  removeFitOption: (value: string) => void
  engravingEnabled: boolean
  setEngravingEnabled: Dispatch<SetStateAction<boolean>>
  engravingLabel: string
  setEngravingLabel: Dispatch<SetStateAction<string>>
  inputClassName: string
  secondaryButtonClassName: string
  customDropdownsEnabled: boolean
  onCustomDropdownsEnabledChange: (value: boolean) => void
  customDropdowns: ProductCustomDropdown[]
  onCustomDropdownsChange: (groups: ProductCustomDropdown[]) => void
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-8 text-xl font-bold text-foreground">Attributes and Filters</h2>
      <div className="space-y-6">
        {certificates.length > 0 ? (
          <TogglePillGroup
            label="Certificates"
            items={certificates.map((item) => ({ id: item.id, label: item.name }))}
            selected={selectedCertificateIds}
            onToggle={onCertificateToggle}
          />
        ) : null}

        {ringCategories.length > 0 ? (
          <div className="rounded-lg border border-border bg-secondary/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Ring Category</p>
                <p className="mt-2 text-xs text-muted-foreground">Enable this only for products that need ring size selection and pick the default ring category.</p>
              </div>
              <PillToggle
                value={ringSizesEnabled}
                onChange={onRingSizesEnabledChange}
                onLabel="Enabled"
                offLabel="Disabled"
              />
            </div>

            {ringSizesEnabled ? (
              <div className="mt-4">
                <FormField label="Default Ring Category">
                  <Select value={ringCategoryId || undefined} onValueChange={setRingCategoryId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select ring category" />
                    </SelectTrigger>
                    <SelectContent>
                      {ringCategories.map((item) => (
                        <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                {ringCategoryId ? (
                  <div className="mt-4">
                    <label className="mb-3 block text-sm font-semibold text-foreground">Sizes In This Category</label>
                    <div className="flex flex-wrap gap-2">
                      {ringCategorySizes
                        .filter((item) => item.ring_category_id === ringCategoryId && item.status === 'active')
                        .sort((left, right) => left.display_order - right.display_order)
                        .map((item) => (
                          <span key={item.id} className="rounded-full border border-border px-3 py-2 text-sm text-foreground">
                            {item.size_label}
                          </span>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Generic Stone / Material Label">
            <input value={gemstoneLabel} onChange={(e) => setGemstoneLabel(e.target.value)} placeholder="Stone Type, Material, Gemstone..." className={inputClassName} />
          </FormField>
          <FormField label="Generic Stone / Material Values" className="sm:col-span-2">
            {materialValues.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {materialValues.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onMaterialValueToggle(item.id)}
                      className={`rounded px-3 py-2 text-sm font-medium transition-colors ${effectiveSelectedMaterialValueIds.includes(item.id) ? 'bg-primary text-white' : 'border border-border hover:bg-secondary'}`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Select the material values this product should expose on the storefront.</p>
              </>
            ) : (
              <div className="rounded border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                No material values found in the master table yet. Add them in the database first, then they will appear here.
              </div>
            )}
          </FormField>
        </div>

        <div className="rounded-lg border border-border bg-secondary/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Stone Shape Selector</p>
              <p className="mt-2 text-xs text-muted-foreground">Enable only when this product should expose shape selection and shape-based filtering.</p>
            </div>
            <PillToggle
              value={shapesEnabled}
              onChange={onShapesEnabledChange}
              onLabel="Enabled"
              offLabel="Disabled"
            />
          </div>

          {shapesEnabled ? (
            <div className="mt-4">
              <TogglePillGroup
                label="Available Shapes"
                items={stoneShapes.map((shape) => ({ id: shape.id, label: shape.name }))}
                selected={selectedShapeIds}
                onToggle={onShapeToggle}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                These selected master shapes will be used for the product page selector, listing filters, and shape-aware navigation.
              </p>
            </div>
          ) : null}
        </div>

        <ProductCustomDropdownEditor enabled={customDropdownsEnabled} onEnabledChange={onCustomDropdownsEnabledChange} groups={customDropdowns} onChange={onCustomDropdownsChange} />

        <div className="rounded-lg border border-border bg-secondary/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Fit</p>
              <p className="mt-2 text-xs text-muted-foreground">Use this for wear-style options like Comfort Fit, Screw Back, or Chain Length choices.</p>
            </div>
            <PillToggle
              value={fitEnabled}
              onChange={onFitEnabledChange}
              onLabel="Enabled"
              offLabel="Disabled"
            />
          </div>

          {fitEnabled ? (
            <div className="mt-4 space-y-4">
              <FormField label="Fit Label">
                <input value={fitLabel} onChange={(e) => setFitLabel(e.target.value)} placeholder="Fit, Backing, Chain Length..." className={inputClassName} />
              </FormField>
              <div>
                <label className="mb-3 block text-sm font-semibold text-foreground">Fit Options</label>
                <div className="flex gap-2">
                  <input
                    value={fitInput}
                    onChange={(e) => setFitInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addFitOption()
                      }
                    }}
                    placeholder="Add fit option like Comfort Fit or Screw Back"
                    className={`${inputClassName} flex-1`}
                  />
                  <button type="button" onClick={addFitOption} className={secondaryButtonClassName}>Add</button>
                </div>
                <TagList items={fitOptions} onRemove={removeFitOption} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-border bg-secondary/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Engraving</p>
              <p className="mt-2 text-xs text-muted-foreground">Control whether this product offers engraving on the storefront.</p>
            </div>
            <PillToggle value={engravingEnabled} onChange={setEngravingEnabled} onLabel="Enabled" offLabel="Disabled" />
          </div>
          {engravingEnabled ? (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-foreground">Engraving Label</label>
              <input value={engravingLabel} onChange={(e) => setEngravingLabel(e.target.value)} className={inputClassName} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
