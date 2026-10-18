'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ProductDetailSection, ProductFaqItem, ProductKeyValue } from '@/lib/product-catalog'
import { FormField } from '@/components/product-form/ProductFormControls'
import { KeyValueSection } from '@/components/product-form/KeyValueSection'
import { ProductFaqEditor } from '@/components/product-form/ProductFaqEditor'

export function ProductDetailsStep({
  specifications,
  setSpecifications,
  productDetails,
  setProductDetails,
  faqItems,
  setFaqItems,
  onFaqValidationError,
  detailSections,
  setDetailSections,
  createEmptyRow,
  createEmptySection,
  inputClassName,
}: {
  specifications: ProductKeyValue[]
  setSpecifications: Dispatch<SetStateAction<ProductKeyValue[]>>
  productDetails: ProductKeyValue[]
  setProductDetails: Dispatch<SetStateAction<ProductKeyValue[]>>
  faqItems: ProductFaqItem[]
  setFaqItems: Dispatch<SetStateAction<ProductFaqItem[]>>
  onFaqValidationError: (message: string) => void
  detailSections: ProductDetailSection[]
  setDetailSections: Dispatch<SetStateAction<ProductDetailSection[]>>
  createEmptyRow: () => ProductKeyValue
  createEmptySection: () => ProductDetailSection
  inputClassName: string
}) {
  return (
    <>
      <KeyValueSection
        title="Specifications"
        description="Add structured key-value rows for the product detail specifications tab."
        rows={specifications}
        onChange={setSpecifications}
      />

      <KeyValueSection
        title="Product Details"
        description="Use this for general product facts that should render separately from specifications."
        rows={productDetails}
        onChange={setProductDetails}
      />

      <ProductFaqEditor
        items={faqItems}
        onChange={setFaqItems}
        onValidationError={onFaqValidationError}
      />

      <section className="rounded-lg border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Additional Detail Sections</h2>
            <p className="mt-2 text-xs text-muted-foreground">Create dynamic sections like Diamond Details, Gemstone Details, or Material Details.</p>
          </div>
          <button
            type="button"
            onClick={() => setDetailSections((prev) => [...prev, createEmptySection()])}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <Plus size={14} />
            Add Section
          </button>
        </div>

        <div className="space-y-4">
          {detailSections.map((section, sectionIndex) => (
            <div key={section.id} className="rounded-lg border border-border bg-secondary/10 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                <FormField label="Section Title">
                  <input
                    value={section.title}
                    onChange={(e) =>
                      setDetailSections((prev) =>
                        prev.map((entry, index) => (index === sectionIndex ? { ...entry, title: e.target.value } : entry))
                      )
                    }
                    className={inputClassName}
                  />
                </FormField>
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={section.visible}
                    onChange={(e) =>
                      setDetailSections((prev) =>
                        prev.map((entry, index) => (index === sectionIndex ? { ...entry, visible: e.target.checked } : entry))
                      )
                    }
                    className="rounded border-border"
                  />
                  Visible
                </label>
                <button
                  type="button"
                  onClick={() => setDetailSections((prev) => prev.filter((_, index) => index !== sectionIndex))}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {section.rows.map((row, rowIndex) => (
                  <div key={`${section.id}-${rowIndex}`} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <input
                      value={row.key}
                      onChange={(e) =>
                        setDetailSections((prev) =>
                          prev.map((entry, index) =>
                            index === sectionIndex
                              ? {
                                  ...entry,
                                  rows: entry.rows.map((sectionRow, sectionRowIndex) =>
                                    sectionRowIndex === rowIndex ? { ...sectionRow, key: e.target.value } : sectionRow
                                  ),
                                }
                              : entry
                          )
                        )
                      }
                      placeholder="Label"
                      className={inputClassName}
                    />
                    <input
                      value={row.value}
                      onChange={(e) =>
                        setDetailSections((prev) =>
                          prev.map((entry, index) =>
                            index === sectionIndex
                              ? {
                                  ...entry,
                                  rows: entry.rows.map((sectionRow, sectionRowIndex) =>
                                    sectionRowIndex === rowIndex ? { ...sectionRow, value: e.target.value } : sectionRow
                                  ),
                                }
                              : entry
                          )
                        )
                      }
                      placeholder="Value"
                      className={inputClassName}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDetailSections((prev) =>
                          prev.map((entry, index) =>
                            index === sectionIndex
                              ? {
                                  ...entry,
                                  rows: entry.rows.length > 1 ? entry.rows.filter((_, sectionRowIndex) => sectionRowIndex !== rowIndex) : entry.rows,
                                }
                              : entry
                          )
                        )
                      }
                      className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  setDetailSections((prev) =>
                    prev.map((entry, index) => (index === sectionIndex ? { ...entry, rows: [...entry.rows, createEmptyRow()] } : entry))
                  )
                }
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <Plus size={14} />
                Add Row
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
