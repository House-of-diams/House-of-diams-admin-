'use client'

import { catalogFetch } from '@/lib/catalog-transport'

import Link from 'next/link'
import { useState } from 'react'
import { Edit2, Plus, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { buildCombinedMetalDisplayLabel } from '@/lib/product-metal-variants'
import { catalogMetalDeleteBody } from '@/lib/catalog-metal-client'

export type MetalItem = {
  id: string
  _revision?: string
  name: string
  slug: string
  purity_label?: string | null
  base_metal_name?: string | null
  display_label?: string | null
  is_combined_option?: boolean
  color_hex: string | null
  composition_description?: string | null
  display_order: number
  status: 'active' | 'hidden'
  composition_parts?: {
    id?: number | string
    part_name: string
    percentage: number
    color_hex?: string | null
    sort_order: number
  }[]
}

function stripPurityPrefix(value: string, purity?: string | null) {
  const source = value.trim()
  const prefix = purity?.trim()
  if (!source || !prefix) return source
  return source.toLowerCase().startsWith(`${prefix.toLowerCase()} `)
    ? source.slice(prefix.length).trim()
    : source
}

function getMetalBaseName(metal: MetalItem) {
  return metal.base_metal_name?.trim() || stripPurityPrefix(metal.name, metal.purity_label)
}

export function MetalsClient({ initialItems }: { initialItems: MetalItem[] }) {
  const { toast } = useToast()
  const [items, setItems] = useState<MetalItem[]>(initialItems)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MetalItem | null>(null)

  const loadItems = async () => {
    setLoading(true)
    try {

      const response = await catalogFetch('/api/catalog/metals')
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.items) {
        toast({ title: 'Load failed', description: payload?.error ?? 'Unable to load metals.', variant: 'destructive' })
        return
      }
      setItems(payload.items)
    } finally {
      setLoading(false)
    }
  }

  const deleteItem = async (id: string) => {

    const revision=items.find((item)=>item.id===id)?._revision
    if(!revision){toast({title:'Reload required',description:'Reload this metal before deleting it.',variant:'destructive'});return}
    const response = await catalogFetch(`/api/catalog/metals/${id}`, {
      method: 'DELETE',
      headers: { 'content-type':'application/json' },
      body:catalogMetalDeleteBody(revision),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      toast({
        title: response.status === 409 ? 'Metal is in use' : 'Delete failed',
        description: payload?.error ?? 'Unable to delete metal.',
        variant: 'destructive',
      })
      return
    }

    await loadItems()
    setDeleteTarget(null)
    toast({ title: 'Deleted', description: 'Metal removed successfully.' })
  }

  return (
    <div className="p-8">
      <div className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Metals</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage metal master data for product configuration.</p>
        </div>

        <Link href="/dashboard/catalog/metals/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
          <Plus size={16} />
          Add New Metal
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Metal Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Display Label</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Purity</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Slug</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Color Swatch</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Edit</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-foreground">Delete</th>
              </tr>
            </thead>
            <tbody>
              {items.map((metal) => (
                <tr key={metal.id} className="border-b border-border hover:bg-secondary/20">
                  <td className="px-6 py-4 text-sm font-medium text-foreground">{getMetalBaseName(metal)}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{buildCombinedMetalDisplayLabel(metal)}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{metal.purity_label || 'Base metal only'}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{metal.slug}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex h-6 w-6 rounded-full border border-black/10" style={{ backgroundColor: metal.color_hex || '#D4AF37' }} />
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${metal.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
                      {metal.status === 'active' ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/catalog/metals/${metal.id}`} className="rounded p-1.5 hover:bg-secondary transition-colors">
                      <Edit2 size={14} className="text-muted-foreground" />
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <button type="button" onClick={() => setDeleteTarget(metal)} className="rounded p-1.5 hover:bg-red-100 transition-colors">
                      <Trash2 size={14} className="text-red-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 text-sm text-muted-foreground">Updating metals...</div>
      ) : null}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete metal?"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"?`}
        confirmText="Delete"
        type="delete"
        onConfirm={() => {
          if (!deleteTarget) return
          void deleteItem(deleteTarget.id)
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
