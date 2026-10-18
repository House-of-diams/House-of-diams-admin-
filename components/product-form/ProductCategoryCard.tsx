'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField, TogglePillGroup } from '@/components/product-form/ProductFormControls'
import type {
  CatalogCategory,
  CatalogOption,
  CatalogStyle,
  CatalogSubcategory,
} from '@/lib/product-catalog'

export function ProductCategoryCard({
  mainCategoryId,
  onMainCategoryChange,
  categories,
  forceHipHopCategory,
  isLockedLaneProduct,
  isCollectionProduct,
  categorySubcategories,
  subcategoryId,
  onSubcategoryChange,
  linkedSubcategoryCandidates,
  linkedSubcategoryIds,
  onLinkedSubcategoryToggle,
  optionId,
  setOptionId,
  subcategoryOptions,
  linkedOptionCandidates,
  linkedOptionIds,
  onLinkedOptionToggle,
  styleId,
  setStyleId,
  styles,
  selectedPath,
}: {
  mainCategoryId: string
  onMainCategoryChange: (value: string) => void
  categories: CatalogCategory[]
  forceHipHopCategory: boolean
  isLockedLaneProduct: boolean
  isCollectionProduct: boolean
  categorySubcategories: CatalogSubcategory[]
  subcategoryId: string
  onSubcategoryChange: (value: string) => void
  linkedSubcategoryCandidates: CatalogSubcategory[]
  linkedSubcategoryIds: string[]
  onLinkedSubcategoryToggle: (value: string) => void
  optionId: string
  setOptionId: (value: string) => void
  subcategoryOptions: CatalogOption[]
  linkedOptionCandidates: CatalogOption[]
  linkedOptionIds: string[]
  onLinkedOptionToggle: (value: string) => void
  styleId: string
  setStyleId: (value: string) => void
  styles: CatalogStyle[]
  selectedPath: string
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
      <h2 className="mb-8 text-xl font-bold text-foreground">Category and Classification</h2>
      <div className="space-y-6">
        <FormField label="Main Category">
          <Select value={mainCategoryId} onValueChange={onMainCategoryChange} disabled={forceHipHopCategory || isLockedLaneProduct}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {isLockedLaneProduct ? (
          <p className="text-xs text-muted-foreground">
            {isCollectionProduct
              ? 'Main category is locked for Collection products.'
              : 'Main category is locked for Hip Hop products.'}
          </p>
        ) : null}

        {categorySubcategories.length > 0 ? (
          <FormField label="Subcategory">
            <Select value={subcategoryId} onValueChange={onSubcategoryChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select subcategory" />
              </SelectTrigger>
              <SelectContent>
                {categorySubcategories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : null}

        {linkedSubcategoryCandidates.length > 0 ? (
          <TogglePillGroup
            label="Linked Subcategories"
            items={linkedSubcategoryCandidates.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            selected={linkedSubcategoryIds}
            onToggle={onLinkedSubcategoryToggle}
          />
        ) : null}

        {subcategoryId && subcategoryOptions.length > 0 ? (
          <FormField label="Option">
            <Select value={optionId} onValueChange={setOptionId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select option" />
              </SelectTrigger>
              <SelectContent>
                {subcategoryOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : null}

        {subcategoryId && subcategoryOptions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
            No options configured for this subcategory. Manage options under Catalog.
          </div>
        ) : null}

        {linkedOptionCandidates.length > 0 ? (
          <TogglePillGroup
            label="Linked Options"
            items={linkedOptionCandidates.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            selected={linkedOptionIds}
            onToggle={onLinkedOptionToggle}
          />
        ) : null}

        <FormField label="Style">
          <Select value={styleId || '__none__'} onValueChange={(value) => setStyleId(value === '__none__' ? '' : value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No style</SelectItem>
              {styles.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <div className="rounded-lg border border-border bg-secondary/20 px-4 py-4">
          <p className="text-sm font-semibold text-foreground">Selected Path</p>
          <p className="mt-3 text-xs text-muted-foreground">{selectedPath}</p>
        </div>
      </div>
    </section>
  )
}
