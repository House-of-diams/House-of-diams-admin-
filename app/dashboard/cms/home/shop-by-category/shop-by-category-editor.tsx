'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowLeft, ArrowUp, ImageOff, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type Kind = 'category' | 'subcategory' | 'option'
type CatalogItem = { id: string; name: string; slug: string; status: string; image_path?: string | null; icon_svg_path?: string | null; image_alt?: string | null; category_id?: string; subcategory_id?: string; banner_desktop_image_path?: string | null; banner_mobile_image_path?: string | null; banner_desktop_image_alt?: string | null; banner_mobile_image_alt?: string | null }
type SelectedItem = { id?: number | string; item_type: Kind; category_id: string | null; subcategory_id: string | null; option_id: string | null; display_order: number; is_active: boolean }
export type ShopByCategoryInitialData = {
  revision: string
  section: { id: number | string; heading: string; shop_all_label: string | null; shop_all_link: string | null; is_enabled: boolean; desktop_columns: number; tablet_columns: number; mobile_columns: number }
  items: SelectedItem[]
  categories: CatalogItem[]
  subcategories: CatalogItem[]
  options: CatalogItem[]
}

const field = 'w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10'
function sourceId(item: SelectedItem) { return item.category_id ?? item.subcategory_id ?? item.option_id ?? '' }
function editableState(section: ShopByCategoryInitialData['section'], items: SelectedItem[]) {
  return JSON.stringify({ section, items: items.map((item, index) => ({ ...item, display_order: index })) })
}
function storageUrl(path?: string | null) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_COLLECTION_BUCKET || 'hod'
  return base ? `${base}/storage/v1/object/public/${bucket}/${path.replace(/^\/+/, '')}` : path
}

export function ShopByCategoryEditor({ initialData }: { initialData: ShopByCategoryInitialData }) {
  const { toast } = useToast()
  const router = useRouter()
  const [section, setSection] = useState(initialData.section)
  const [items, setItems] = useState(initialData.items)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [pendingOptionIds, setPendingOptionIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(initialData.revision)
  const [savedItemIds, setSavedItemIds] = useState(() => initialData.items.flatMap((item) => item.id ? [String(item.id)] : []))
  const [savedState, setSavedState] = useState(() => editableState(initialData.section, initialData.items))
  const pendingSave = useRef<{ fingerprint: string; id: string } | null>(null)
  const dirty = editableState(section, items) !== savedState
  const unsaved = useUnsavedChanges(dirty)
  const categoryMap = useMemo(() => new Map(initialData.categories.map((x) => [x.id, x])), [initialData.categories])
  const subcategoryMap = useMemo(() => new Map(initialData.subcategories.map((x) => [x.id, x])), [initialData.subcategories])
  const selectedKeys = new Set(items.map((item) => `${item.item_type}:${sourceId(item)}`))
  const activeCategories = initialData.categories.filter((item) => item.status === 'active')
  const availableSubcategories = initialData.subcategories.filter((item) => item.status === 'active' && item.category_id === categoryId)
  const availableOptions = initialData.options.filter((item) => item.status === 'active' && item.subcategory_id === subcategoryId)
  function catalogRecord(item: SelectedItem) {
    const id = sourceId(item)
    return item.item_type === 'category' ? categoryMap.get(id) : item.item_type === 'subcategory' ? subcategoryMap.get(id) : initialData.options.find((x) => x.id === id)
  }
  function catalogContext(item: SelectedItem) {
    const record = catalogRecord(item)
    if (!record) return 'Catalog record unavailable'
    if (item.item_type === 'category') return 'Category'
    if (item.item_type === 'subcategory') return categoryMap.get(record.category_id ?? '')?.name ?? 'Unknown category'
    const subcategory = subcategoryMap.get(record.subcategory_id ?? '')
    return `${categoryMap.get(subcategory?.category_id ?? '')?.name ?? 'Unknown category'} / ${subcategory?.name ?? 'Unknown subcategory'}`
  }
  function resetPicker() {
    setCategoryId('')
    setSubcategoryId('')
    setPendingOptionIds([])
  }
  function handlePickerChange(open: boolean) {
    setPickerOpen(open)
    if (!open) resetPicker()
  }
  function addSelectedOptions() {
    const ids = pendingOptionIds.filter((id) => !selectedKeys.has(`option:${id}`))
    if (!ids.length) return
    setItems((current) => [
      ...current,
      ...ids.map((id, index) => ({ item_type: 'option' as const, category_id: null, subcategory_id: null, option_id: id, display_order: current.length + index, is_active: true })),
    ])
    handlePickerChange(false)
  }
  function move(index: number, offset: number) {
    const target = index + offset
    if (target < 0 || target >= items.length) return
    setItems((current) => { const copy = [...current]; [copy[index], copy[target]] = [copy[target], copy[index]]; return copy.map((x, i) => ({ ...x, display_order: i })) })
  }
  async function save() {
    setSaving(true)
    try {


      const retainedIds = new Set(items.flatMap((item) => item.id ? [String(item.id)] : []))
      const saveBody = { section, items: items.map((x, i) => ({ ...x, display_order: i })), expected_revision: revision, deleted_ids: savedItemIds.filter((id) => !retainedIds.has(id)) }
      const fingerprint = JSON.stringify(saveBody)
      if (pendingSave.current?.fingerprint !== fingerprint) pendingSave.current = { fingerprint, id: crypto.randomUUID() }
      const response = await cmsFetch('/api/cms/home/shop-by-category', { method: 'POST', headers: { 'content-type': 'application/json',  }, body: JSON.stringify({ ...saveBody, request_id: pendingSave.current.id }) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save section.')
      if (!Array.isArray(payload?.items) || !payload?.section || typeof payload?.revision !== 'string') throw new Error('Save response was interrupted. Retry to confirm the same save.')
      setItems(payload.items)
      setSection(payload.section)
      setSavedState(editableState(payload.section, payload.items))
      setSavedItemIds(payload.items.map((item: SelectedItem) => String(item.id)))
      setRevision(payload.revision)
      pendingSave.current = null
      toast({ title: 'Saved', description: 'Shop By Category updated successfully.' })
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save section.', variant: 'destructive' })
    } finally { setSaving(false) }
  }
  return <div className="p-5 md:p-8">
    <Link href="/dashboard/cms/home" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/home')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16}/>Back to Home</Link>
    <div className="mt-7"><h1 className="font-jakarta text-3xl font-semibold">Shop By Category</h1><p className="mt-1 text-sm text-muted-foreground">Build the compact catalog grid shown directly below the homepage hero.</p></div>
    <section className="mt-8 max-w-6xl rounded-lg border border-border bg-white p-5 shadow-xs">
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">Heading<input className={`${field} mt-2`} value={section.heading} onChange={(e)=>setSection({...section,heading:e.target.value})}/></label><label className="text-sm font-semibold">Shop All label<input className={`${field} mt-2`} value={section.shop_all_label ?? ''} onChange={(e)=>setSection({...section,shop_all_label:e.target.value})}/></label><label className="text-sm font-semibold">Shop All link<input className={`${field} mt-2`} value={section.shop_all_link ?? ''} onChange={(e)=>setSection({...section,shop_all_link:e.target.value})}/></label><label className="flex items-center gap-3 self-end rounded-lg border border-border p-3 text-sm font-semibold"><input type="checkbox" checked={section.is_enabled} onChange={(e)=>setSection({...section,is_enabled:e.target.checked})}/>Enable section</label></div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">{([['desktop_columns','Desktop',2,8],['tablet_columns','Tablet',1,6],['mobile_columns','Mobile',1,3]] as const).map(([key,label,min,max])=><label key={key} className="text-sm font-semibold">{label} columns<input type="number" min={min} max={max} className={`${field} mt-2`} value={section[key]} onChange={(e)=>setSection({...section,[key]:Number(e.target.value)})}/></label>)}</div>
    </section>
    <section className="mt-6 max-w-6xl overflow-hidden rounded-lg border border-border bg-white shadow-xs">
      <div className="flex flex-col gap-4 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-semibold">Selected cards</h2><p className="text-sm text-muted-foreground">Order, enable, or remove cards before saving.</p></div>
        {items.length > 0 ? <Button type="button" onClick={() => setPickerOpen(true)}><Plus/>Add Cards</Button> : null}
      </div>
      {items.length===0?<div className="flex flex-col items-center px-5 py-12 text-center"><div className="flex size-11 items-center justify-center rounded-lg bg-secondary text-primary"><ImageOff size={20}/></div><h3 className="mt-4 text-base font-semibold">No cards selected</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Choose a category and subcategory, then select the options you want to feature on the homepage.</p><Button type="button" className="mt-5" onClick={() => setPickerOpen(true)}><Plus/>Select Cards</Button></div>:<div className="divide-y">{items.map((item,index)=>{const record=catalogRecord(item); const image=record ? (item.item_type==='category' ? record.banner_desktop_image_path ?? record.banner_mobile_image_path : record.image_path ?? record.icon_svg_path) : ''; return <div key={`${item.item_type}-${sourceId(item)}`} className="flex flex-wrap items-center gap-4 p-4"><div className="h-14 w-14 shrink-0 bg-secondary">{image?<img src={storageUrl(image)} alt="" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><ImageOff size={18}/></div>}</div><div className="min-w-40 flex-1"><div className="text-sm font-semibold">{record?.name ?? 'Missing catalog record'}</div><div className="text-xs text-muted-foreground"><span className="uppercase">{item.item_type}</span> · {catalogContext(item)}{record?.status !== 'active' ? ' · Inactive—remove before saving' : ''}</div></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.is_active} onChange={(e)=>setItems(items.map((x,i)=>i===index?{...x,is_active:e.target.checked}:x))}/>Active</label><div className="flex gap-1"><button aria-label="Move up" disabled={index===0} onClick={()=>move(index,-1)} className="rounded border p-2 disabled:opacity-30"><ArrowUp size={15}/></button><button aria-label="Move down" disabled={index===items.length-1} onClick={()=>move(index,1)} className="rounded border p-2 disabled:opacity-30"><ArrowDown size={15}/></button><button aria-label="Remove" onClick={()=>setItems(items.filter((_,i)=>i!==index).map((x,i)=>({...x,display_order:i})))} className="rounded border p-2 text-destructive"><Trash2 size={15}/></button></div></div>})}</div>}
    </section>
    <Dialog open={pickerOpen} onOpenChange={handlePickerChange}>
      <DialogContent className="flex max-h-[min(86vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>Select cards</DialogTitle>
          <DialogDescription>Follow the catalog hierarchy, then add one or more options to this section.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">1. Category<select className={`${field} mt-2`} value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(''); setPendingOptionIds([]) }}><option value="">Select a category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="text-sm font-semibold">2. Subcategory<select className={`${field} mt-2`} value={subcategoryId} disabled={!categoryId || availableSubcategories.length === 0} onChange={(event) => { setSubcategoryId(event.target.value); setPendingOptionIds([]) }}><option value="">Select a subcategory</option>{availableSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}</select></label>
          </div>
          {categoryId && availableSubcategories.length === 0 ? <div className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-7 text-center"><p className="text-sm font-semibold">No active subcategories</p><p className="mt-1 text-xs text-muted-foreground">Activate or add a subcategory under this category before selecting cards.</p></div> : null}
          <div>
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">3. Choose options</h3><p className="mt-0.5 text-xs text-muted-foreground">Select every option you want to add as a homepage card.</p></div>{subcategoryId ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">{pendingOptionIds.length} selected</span> : null}</div>
            {!subcategoryId ? <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Select a category and subcategory to see its active options.</div> : availableOptions.length === 0 ? <div className="mt-3 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-7 text-center"><p className="text-sm font-semibold">No active options</p><p className="mt-1 text-xs text-muted-foreground">Activate or add options under this subcategory before selecting cards.</p></div> : <div className="mt-3 divide-y overflow-hidden rounded-lg border border-border">{availableOptions.map((option) => { const alreadyAdded = selectedKeys.has(`option:${option.id}`); const checked = pendingOptionIds.includes(option.id); return <label key={option.id} className={`flex items-center gap-3 px-4 py-3 ${alreadyAdded ? 'cursor-not-allowed bg-secondary/40' : 'cursor-pointer hover:bg-secondary/25'}`}><Checkbox checked={alreadyAdded || checked} disabled={alreadyAdded} onCheckedChange={(value) => setPendingOptionIds((current) => value === true ? [...current, option.id] : current.filter((id) => id !== option.id))} aria-label={`Select ${option.name}`}/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{option.name}</span><span className="block truncate text-xs text-muted-foreground">{categoryMap.get(categoryId)?.name} / {subcategoryMap.get(subcategoryId)?.name}</span></span>{alreadyAdded ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">Already added</span> : null}</label>})}</div>}
          </div>
        </div>
        <DialogFooter className="border-t bg-secondary/20 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => handlePickerChange(false)}>Cancel</Button>
          <Button type="button" disabled={pendingOptionIds.length === 0} onClick={addSelectedOptions}>Add Selected Cards{pendingOptionIds.length ? ` (${pendingOptionIds.length})` : ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <CmsSaveAction onClick={save} isSaving={saving} disabled={!dirty}/>
    <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Shop By Category changes?" description="Your changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)}/>
  </div>
}
