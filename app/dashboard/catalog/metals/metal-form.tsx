'use client'

import { catalogFetch } from '@/lib/catalog-transport'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useEditGuard } from '@/hooks/use-unsaved-changes'
import { slugify } from '@/lib/product-catalog'
import type { MetalItem } from './metals-client'
import { buildCombinedMetalDisplayLabel } from '@/lib/product-metal-variants'
import { catalogMetalSaveBody } from '@/lib/catalog-metal-client'

function stripPurityPrefix(value: string, purity?: string | null) {
  const source = value.trim()
  const prefix = purity?.trim()
  if (!source || !prefix) return source
  return source.toLowerCase().startsWith(`${prefix.toLowerCase()} `)
    ? source.slice(prefix.length).trim()
    : source
}

function deriveCombinedMetalLabel(input: {
  purity_label?: string | null
  base_metal_name?: string | null
  name: string
}) {
  return buildCombinedMetalDisplayLabel({
    name: input.name || '',
    display_label: input.name || '',
    purity_label: input.purity_label ?? '',
    base_metal_name: input.base_metal_name || input.name || '',
  })
}

export function MetalForm({
  initialItem,
  mode,
}: {
  initialItem?: MetalItem | null
  mode: 'create' | 'edit'
}) {
  const router = useRouter()
  const { toast } = useToast()
  // HOD-056: warn before leaving with unsaved edits.
  const edits = useEditGuard()
  const [isSaving, setIsSaving] = useState(false)
  const initialMetalName = initialItem?.base_metal_name?.trim() || stripPurityPrefix(initialItem?.name ?? '', initialItem?.purity_label)
  const [formData, setFormData] = useState({
    name: initialMetalName,
    slug: initialItem?.slug ?? '',
    purity_label: initialItem?.purity_label ?? '',
    base_metal_name: initialItem?.base_metal_name ?? '',
    display_label: deriveCombinedMetalLabel({
      name: initialMetalName,
      purity_label: initialItem?.purity_label ?? '',
      base_metal_name: initialItem?.base_metal_name || initialMetalName,
    }),
    is_combined_option: initialItem?.is_combined_option ?? false,
    color_hex: initialItem?.color_hex || '#D4AF37',
    composition_description: initialItem?.composition_description ?? '',
    display_order: initialItem?.display_order ?? 1,
    status: initialItem?.status ?? ('active' as 'active' | 'hidden'),
    composition_parts: initialItem?.composition_parts ?? [],
  })

  const saveItem = async () => {

    setIsSaving(true)
    try {
      const generatedDisplayLabel = deriveCombinedMetalLabel(formData)
      const savePayload = {
        ...formData,
        name: formData.is_combined_option ? generatedDisplayLabel : formData.name,
        base_metal_name: formData.base_metal_name.trim() || formData.name,
        display_label: generatedDisplayLabel,
        slug:
          formData.is_combined_option && (!formData.slug || formData.slug === slugify(formData.name))
            ? slugify(generatedDisplayLabel)
            : formData.slug,
      }
      const response = await catalogFetch(mode === 'edit' ? `/api/catalog/metals/${initialItem?.id}` : '/api/catalog/metals', {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: catalogMetalSaveBody(
          Object.fromEntries(Object.entries(savePayload).filter(([key]) => key !== 'composition_parts')),
          savePayload.composition_parts,
          initialItem?._revision ?? null,
          initialItem?.composition_parts ?? []
        ),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast({ title: 'Save failed', description: payload?.error ?? 'Unable to save metal.', variant: 'destructive' })
        return
      }

      edits.reset()
      toast({ title: 'Saved', description: 'Metal master updated successfully.' })
      router.push('/dashboard/catalog/metals')
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="p-8" {...edits.bind}>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/catalog/metals" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} />
            Back to Metals
          </Link>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">{mode === 'edit' ? 'Edit Metal' : 'Add New Metal'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the metal master and its direct composition values.</p>
        </div>
      </div>

      <div className="max-w-4xl rounded-lg border border-border bg-white p-6 shadow-xs">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Metal Name</label>
            <input
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => {
                  const nextName = e.target.value
                  const nextBaseMetalName = prev.base_metal_name === '' || prev.base_metal_name === prev.name ? '' : prev.base_metal_name
                  const nextDerivedLabel = deriveCombinedMetalLabel({
                    ...prev,
                    name: nextName,
                    base_metal_name: nextBaseMetalName,
                  })
                  return {
                    ...prev,
                    name: nextName,
                    slug: prev.slug === '' || prev.slug === slugify(prev.name) ? slugify(nextName) : prev.slug,
                    base_metal_name: nextBaseMetalName,
                    display_label: nextDerivedLabel,
                  }
                })
              }
              className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Purity Label</label>
              <input
                value={formData.purity_label}
                onChange={(e) =>
                  setFormData((prev) => {
                    const nextPurityLabel = e.target.value
                    const nextDerivedLabel = deriveCombinedMetalLabel({
                      ...prev,
                      purity_label: nextPurityLabel,
                    })
                    return {
                      ...prev,
                      purity_label: nextPurityLabel,
                      display_label: nextDerivedLabel,
                    }
                  })
                }
                placeholder="Example: 14K"
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Base Metal Name</label>
              <input
                value={formData.base_metal_name}
                onChange={(e) =>
                  setFormData((prev) => {
                    const nextBaseMetalName = e.target.value
                    const nextDerivedLabel = deriveCombinedMetalLabel({
                      ...prev,
                      base_metal_name: nextBaseMetalName,
                    })
                    return {
                      ...prev,
                      base_metal_name: nextBaseMetalName,
                      display_label: nextDerivedLabel,
                    }
                  })
                }
                placeholder="Optional. Leave blank to use Metal Name."
                className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Display Label</label>
            <input
              value={formData.display_label}
              readOnly
              placeholder="Example: 14K Yellow Gold"
              className="w-full rounded-lg border border-border bg-secondary/40 px-4 py-2.5 text-sm text-foreground"
            />
            <p className="mt-2 text-xs text-muted-foreground">Auto-generated live from Purity Label and Base Metal Name / Metal Name.</p>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Slug</label>
            <input value={formData.slug} onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Color</label>
              <input type="color" value={formData.color_hex} onChange={(e) => setFormData((prev) => ({ ...prev, color_hex: e.target.value }))} className="h-10 w-16 rounded border border-border bg-white p-1" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Display Order</label>
              <input type="number" value={formData.display_order} onChange={(e) => setFormData((prev) => ({ ...prev, display_order: Number(e.target.value) || 0 }))} className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Composition Description</label>
            <textarea
              value={formData.composition_description}
              onChange={(e) => setFormData((prev) => ({ ...prev, composition_description: e.target.value }))}
              placeholder="Short description shown with the metal indicator block."
              className="min-h-[96px] w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Metal Mode</label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, is_combined_option: false }))}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${!formData.is_combined_option ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}
              >
                Base Metal
              </button>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, is_combined_option: true }))}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${formData.is_combined_option ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}
              >
                Combined Sellable Option
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Use combined option for values like 14K Yellow Gold or 18K Rose Gold.</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Status</label>
            <div className="flex flex-wrap gap-2">
              {(['active', 'hidden'] as const).map((status) => (
                <button key={status} type="button" onClick={() => setFormData((prev) => ({ ...prev, status }))} className={`rounded-full px-4 py-2 text-sm font-semibold ${formData.status === status ? 'bg-primary text-white' : 'border border-border text-foreground hover:bg-secondary'}`}>
                  {status === 'active' ? 'Active' : 'Hidden'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Composition Values</div>
                <div className="text-xs text-muted-foreground">Add the composition rows for this metal only.</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    composition_parts: [
                      ...(prev.composition_parts ?? []),
                      {
                        part_name: '',
                        percentage: 0,
                        color_hex: prev.color_hex || '#D4AF37',
                        sort_order: (prev.composition_parts?.length ?? 0) + 1,
                      },
                    ],
                  }))
                }
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                <Plus size={12} className="mr-1 inline-block" />
                Add Value
              </button>
            </div>

            <div className="space-y-3">
              {(formData.composition_parts ?? []).map((part, partIndex) => (
                <div key={`${part.id ?? 'part'}-${partIndex}`} className="grid gap-3 rounded-xl border border-border bg-secondary/20 p-3 md:grid-cols-[1.3fr_0.8fr_0.8fr_auto]">
                  <input
                    value={part.part_name}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        composition_parts: (prev.composition_parts ?? []).map((entry, index) =>
                          index === partIndex ? { ...entry, part_name: e.target.value } : entry
                        ),
                      }))
                    }
                    placeholder="Part name"
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={part.percentage}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        composition_parts: (prev.composition_parts ?? []).map((entry, index) =>
                          index === partIndex ? { ...entry, percentage: Number(e.target.value) || 0 } : entry
                        ),
                      }))
                    }
                    placeholder="%"
                    className="w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm"
                  />
                  <input
                    type="color"
                    value={part.color_hex || formData.color_hex || '#D4AF37'}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        composition_parts: (prev.composition_parts ?? []).map((entry, index) =>
                          index === partIndex ? { ...entry, color_hex: e.target.value } : entry
                        ),
                      }))
                    }
                    className="h-10 w-full rounded border border-border bg-white p-1"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        composition_parts: (prev.composition_parts ?? []).filter((_, index) => index !== partIndex).map((entry, index) => ({
                          ...entry,
                          sort_order: index + 1,
                        })),
                      }))
                    }
                    className="rounded p-2 hover:bg-red-100"
                  >
                    <Trash2 size={14} className="text-red-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" disabled={isSaving} onClick={() => void saveItem()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <Link href="/dashboard/catalog/metals" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
