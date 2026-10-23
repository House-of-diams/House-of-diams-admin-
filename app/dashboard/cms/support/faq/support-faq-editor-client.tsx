'use client'
import { uploadAwsImage } from '@/lib/image-transport'
import { resolveCatalogImageUrl } from '@/components/catalog-image-preview'
import { readCmsId } from '@/lib/cms-id-safety'


import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowLeft, Edit2, Plus, Trash2, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CmsSaveAction } from '@/components/cms-save-action'
import { useToast } from '@/hooks/use-toast'
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

type Category = { id: number | string; _revision: string; name: string; slug: string; description: string; image_path: string | null; image_alt: string; sort_order: number; is_active: boolean }
type FaqItem = { clientId: string; id?: number | string; sort_order: number; question: string; answer: string; is_active: boolean; category_id: number | string | null; catalog_category_id: string | null }
type EditorItem = Omit<FaqItem, 'id'>
type CategoryDraft = Omit<Category, 'id' | '_revision'> & { id?: number | string; _revision?: string }
export type SupportFaqInitialData = {
  section: { section_key: string; title: string; subtitle: string }
  items: Array<{ id: number | string; sort_order: number; question: string; answer: string; is_active: boolean; category_id: number | string | null; catalog_category_id: string | null }>
  categories: Category[]
  catalogCategories: Array<{ id: string; name: string; slug: string }>
}
const emptyItem = (sort_order: number): EditorItem => ({ clientId: `draft-${Date.now()}`, sort_order, question: '', answer: '', is_active: true, category_id: null, catalog_category_id: null })
const emptyCategory = (sort_order: number): CategoryDraft => ({ name: '', slug: '', description: '', image_path: null, image_alt: '', sort_order, is_active: true })
const faqFingerprint = (title: string, subtitle: string, items: FaqItem[]) => JSON.stringify({ title, subtitle, items: [...items].sort((a,b)=>a.sort_order-b.sort_order).map(({id,sort_order,question,answer,is_active,category_id,catalog_category_id})=>({id,sort_order,question,answer,is_active,category_id,catalog_category_id})) })

export function SupportFaqEditorClient({ initialData, initialRevision }: { initialData: SupportFaqInitialData; initialRevision: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [title, setTitle] = useState(initialData.section.title)
  const [subtitle, setSubtitle] = useState(initialData.section.subtitle)
  const [items, setItems] = useState<FaqItem[]>(initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item, category_id: item.category_id ?? null, catalog_category_id: item.catalog_category_id ?? null })))
  const [categories, setCategories] = useState<Category[]>(initialData.categories)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState('FAQ content loaded')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorItem, setEditorItem] = useState<EditorItem>(emptyItem(1))
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(emptyCategory(1))
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState<Category | null>(null)
  const [faqDeleteTarget, setFaqDeleteTarget] = useState<FaqItem | null>(null)
  const [savedFingerprint, setSavedFingerprint] = useState(() => faqFingerprint(initialData.section.title, initialData.section.subtitle, initialData.items.map((item) => ({ clientId: `id-${item.id}`, ...item }))))
  const pendingCategorySave = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const pendingCategoryDelete = useRef<{ id: number | string; requestId: string } | null>(null)
  const { prepareSave, acceptSave } = useCmsAtomicListSave(initialData.items, initialRevision)
  const sorted = useMemo(() => [...items].sort((a,b) => a.sort_order-b.sort_order), [items])
  const sortedCategories = useMemo(() => [...categories].sort((a,b) => a.sort_order-b.sort_order), [categories])
  const dirty = useMemo(() => faqFingerprint(title, subtitle, items) !== savedFingerprint, [title, subtitle, items, savedFingerprint])
  const unsaved = useUnsavedChanges(dirty || editorOpen || categoryOpen)

  const saveItem = () => {
    setItems((prev) => { const i=prev.findIndex((x)=>x.clientId===editorItem.clientId); if(i<0)return [...prev,editorItem]; const copy=[...prev]; copy[i]={...copy[i],...editorItem}; return copy })
    setEditorOpen(false); setStatus('FAQ draft updated. Save changes to publish.')
  }
  const saveAll = async () => {
    setIsSaving(true)
    try {

      const body=prepareSave({parent:{title,subtitle},items:sorted.map(({id,sort_order,question,answer,is_active,category_id,catalog_category_id})=>({id,sort_order,question,answer,is_active,category_id,catalog_category_id}))},sorted)
      const res=await cmsFetch('/api/cms/support/faq',{method:'POST',headers:{'content-type':'application/json',},body:JSON.stringify(body)})
      const payload=await res.json().catch(()=>null); if(!res.ok) throw new Error(payload?.error||'Unable to save FAQ content.'); if(!payload?.parent||!Array.isArray(payload.items)||!payload.revision)throw new Error('Save response was interrupted. Retry to confirm the same save.'); const canonical=payload.items.map((item:SupportFaqInitialData['items'][number])=>({clientId:`id-${item.id}`,...item}));setTitle(payload.parent.title);setSubtitle(payload.parent.subtitle);setItems(canonical);setSavedFingerprint(faqFingerprint(payload.parent.title,payload.parent.subtitle,canonical));acceptSave(payload.items,payload.revision)
      setConfirmOpen(false); setStatus('FAQ content saved'); toast({title:'Saved',description:'FAQ content updated successfully.'})
    } catch(error) { setStatus(error instanceof Error?error.message:'Unable to save FAQ content.') } finally { setIsSaving(false) }
  }
  const saveCategory = async () => {
    setCategorySaving(true)
    try {

      const item={name:categoryDraft.name,slug:categoryDraft.slug,description:categoryDraft.description,image_path:categoryDraft.image_path,image_alt:categoryDraft.image_alt,sort_order:categoryDraft.sort_order,is_active:categoryDraft.is_active}
      const body={id:categoryDraft.id??null,expected_revision:categoryDraft._revision??null,item};const currentFingerprint=JSON.stringify(body);if(pendingCategorySave.current?.fingerprint!==currentFingerprint)pendingCategorySave.current={fingerprint:currentFingerprint,requestId:crypto.randomUUID()}
      const res=await cmsFetch('/api/cms/support/faq/categories',{method:'POST',headers:{'content-type':'application/json',},body:JSON.stringify({...body,request_id:pendingCategorySave.current.requestId})})
      const payload=await res.json().catch(()=>null); if(!res.ok||!payload?.category?._revision) throw new Error(payload?.error||'Save response was interrupted. Retry to confirm the same save.')
      setCategories((prev)=>[...prev.filter((x)=>x.id!==payload.category.id),payload.category]);pendingCategorySave.current=null; setCategoryOpen(false); setStatus('FAQ category saved');toast({title:'Saved',description:'FAQ category updated successfully.'})
    } catch(error) { setStatus(error instanceof Error?error.message:'Unable to save category.') } finally { setCategorySaving(false) }
  }
  const uploadCategoryImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file=event.target.files?.[0]; if(!file)return
    setCategorySaving(true)
    try { const awsPath=await uploadAwsImage(file,'/api/cms/uploads/faq-category');if(awsPath){setCategoryDraft(prev=>({...prev,image_path:awsPath}));setStatus('Category image uploaded');return} throw new Error('Image service unavailable.') } catch(error){setStatus(error instanceof Error?error.message:'Upload failed.')} finally{setCategorySaving(false)}
  }
  const deleteCategory = async () => {
    if (!categoryDeleteTarget) return
    const target=categoryDeleteTarget;setCategorySaving(true)
    try{if(pendingCategoryDelete.current?.id!==target.id)pendingCategoryDelete.current={id:target.id,requestId:crypto.randomUUID()};const res=await cmsFetch('/api/cms/support/faq/categories',{method:'DELETE',headers:{'content-type':'application/json',},body:JSON.stringify({id:target.id,expected_revision:target._revision,request_id:pendingCategoryDelete.current.requestId})});const payload=await res.json().catch(()=>null);if(!res.ok||!payload?.ok)throw new Error(payload?.error||'Delete response was interrupted. Reload before retrying.');setCategories((prev)=>prev.filter((x)=>x.id!==target.id));pendingCategoryDelete.current=null;setCategoryDeleteTarget(null);setStatus('FAQ category deleted');toast({title:'Deleted',description:'FAQ category deleted successfully.'})}catch(error){setStatus(error instanceof Error?error.message:'Unable to delete category.')}finally{setCategorySaving(false)}
  }
  const nextItem=Math.max(...items.map((x)=>x.sort_order),0)+1
  const nextCategory=Math.max(...categories.map((x)=>x.sort_order),0)+1

  return <div className="p-8">
    <div className="mb-8 flex items-center justify-between gap-4"><Link href="/dashboard/cms/support" onClick={(event)=>{event.preventDefault();unsaved.confirmNavigation(()=>router.push('/dashboard/cms/support'))}} className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft size={16}/>Back to Support</Link><CmsSaveAction onClick={()=>setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty||editorOpen||categoryOpen||categorySaving} position="inline"/></div>
    <div className="mb-10"><h1 className="font-jakarta text-3xl font-semibold">FAQ</h1><p className="mt-1 text-sm text-muted-foreground">Manage categories and support questions</p><p className="mt-2 text-xs text-muted-foreground">{status}</p></div>
    <div className="mb-8 max-w-4xl space-y-4"><label className="block text-sm font-semibold">Title<input value={title} onChange={(e)=>setTitle(e.target.value)} className="mt-2 w-full rounded-lg border border-border px-3 py-2 font-normal"/></label><label className="block text-sm font-semibold">Subtitle<textarea value={subtitle} onChange={(e)=>setSubtitle(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-border px-3 py-2 font-normal"/></label></div>
    <div className="mb-10"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-xl font-semibold">FAQ Categories</h2><p className="text-sm text-muted-foreground">Reusable groups for support and document pages.</p></div><button onClick={()=>{setCategoryDraft(emptyCategory(nextCategory));setCategoryOpen(true)}} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"><Plus size={15}/>Add Category</button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sortedCategories.map((category)=><div key={category.id} className="border border-border bg-white p-4"><div className="flex items-start gap-3">{category.image_path?<Image unoptimized width={48} height={48} src={resolveCatalogImageUrl(category.image_path) ?? ''} alt={category.image_alt||category.name} className="h-12 w-12 object-contain"/>:<div className="h-12 w-12 bg-secondary"/>}<div className="min-w-0 flex-1"><p className="font-semibold">{category.name}</p><p className="truncate text-xs text-muted-foreground">{category.slug}</p></div></div><div className="mt-4 flex gap-2"><button onClick={()=>{setCategoryDraft(category);setCategoryOpen(true)}} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"><Edit2 size={13}/>Edit</button><button onClick={()=>setCategoryDeleteTarget(category)} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={13}/>Delete</button></div></div>)}</div>
    </div>
    <div className="overflow-hidden border border-border bg-white"><table className="w-full"><thead><tr className="border-b bg-secondary/40"><th className="px-5 py-3 text-left text-xs uppercase">Order</th><th className="px-5 py-3 text-left text-xs uppercase">Question</th><th className="px-5 py-3 text-left text-xs uppercase">Category</th><th className="px-5 py-3 text-right text-xs uppercase">Actions</th></tr></thead><tbody>{sorted.map((item)=><tr key={item.clientId} className="border-b last:border-0"><td className="px-5 py-4 text-sm">{item.sort_order}</td><td className="px-5 py-4 text-sm">{item.question}</td><td className="px-5 py-4 text-sm">{categories.find((x)=>x.id===item.category_id)?.name||'Uncategorized'}</td><td className="px-5 py-4 text-right"><button onClick={()=>{setEditorItem(item);setEditorOpen(true)}} className="mr-2 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"><Edit2 size={14}/>Edit</button><button onClick={()=>setFaqDeleteTarget(item)} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={14}/>Delete</button></td></tr>)}</tbody></table></div>
    <button onClick={()=>{setEditorItem(emptyItem(nextItem));setEditorOpen(true)}} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"><Plus size={16}/>Add FAQ</button>
    <ConfirmDialog isOpen={confirmOpen} title="Save FAQ content?" description="This will update FAQ questions on the live site." confirmText="Save" cancelText="Cancel" type="confirm" isLoading={isSaving} onConfirm={saveAll} onCancel={()=>setConfirmOpen(false)}/>
    <ConfirmDialog isOpen={Boolean(categoryDeleteTarget)} title="Delete FAQ category?" description={categoryDeleteTarget ? `This permanently deletes "${categoryDeleteTarget.name}". Categories still assigned to a FAQ or document cannot be deleted.` : undefined} confirmText="Delete Category" cancelText="Cancel" type="delete" onConfirm={deleteCategory} onCancel={()=>setCategoryDeleteTarget(null)}/>
    <ConfirmDialog isOpen={Boolean(faqDeleteTarget)} title="Delete this FAQ?" description={faqDeleteTarget ? `Remove "${faqDeleteTarget.question}" from the draft? Save changes afterward to publish.` : undefined} confirmText="Delete FAQ" cancelText="Cancel" type="delete" onConfirm={()=>{if(faqDeleteTarget)setItems((items)=>items.filter((item)=>item.clientId!==faqDeleteTarget.clientId));setFaqDeleteTarget(null);setStatus('FAQ removed from draft. Save changes to publish.')}} onCancel={()=>setFaqDeleteTarget(null)}/>
    <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved FAQ changes?" description="Your FAQ or open category changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={()=>unsaved.setShowWarning(false)}/>
    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Edit FAQ</DialogTitle><DialogDescription>Assign this question to one optional category.</DialogDescription></DialogHeader><div className="space-y-4"><label className="block text-sm font-semibold">Question<input value={editorItem.question} onChange={(e)=>setEditorItem((p)=>({...p,question:e.target.value}))} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="block text-sm font-semibold">Answer<textarea value={editorItem.answer} onChange={(e)=>setEditorItem((p)=>({...p,answer:e.target.value}))} rows={5} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="block text-sm font-semibold">Category<Select value={editorItem.category_id ? String(editorItem.category_id) : 'uncategorized'} onValueChange={(v)=>setEditorItem((p)=>({...p,category_id:v==='uncategorized'?null:readCmsId(v)}))}><SelectTrigger className="mt-2 w-full font-normal"><SelectValue placeholder="Uncategorized"/></SelectTrigger><SelectContent><SelectItem value="uncategorized">Uncategorized</SelectItem>{sortedCategories.filter((x)=>x.is_active).map((x)=><SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}</SelectContent></Select></label><label className="block text-sm font-semibold">Catalogue Category <span className="font-normal text-muted-foreground">(internal association)</span><Select value={editorItem.catalog_category_id || 'none'} onValueChange={(v)=>setEditorItem((p)=>({...p,catalog_category_id:v==='none'?null:v}))}><SelectTrigger className="mt-2 w-full font-normal"><SelectValue placeholder="No catalogue category"/></SelectTrigger><SelectContent><SelectItem value="none">No catalogue category</SelectItem>{initialData.catalogCategories.map((x)=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></label><label className="block text-sm font-semibold">Sort order<input type="number" value={editorItem.sort_order} onChange={(e)=>setEditorItem((p)=>({...p,sort_order:Number(e.target.value)||1}))} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={editorItem.is_active} onChange={(e)=>setEditorItem((p)=>({...p,is_active:e.target.checked}))}/>Active</label></div><DialogFooter><button onClick={()=>setEditorOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button><button onClick={saveItem} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">Update Item</button></DialogFooter></DialogContent></Dialog>
    <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{categoryDraft.id?'Edit':'Add'} FAQ Category</DialogTitle><DialogDescription>SVG, PNG, JPG, and WebP images are supported.</DialogDescription></DialogHeader><div className="space-y-4"><label className="block text-sm font-semibold">Name<input value={categoryDraft.name} onChange={(e)=>setCategoryDraft((p)=>({...p,name:e.target.value}))} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="block text-sm font-semibold">Slug<input value={categoryDraft.slug} onChange={(e)=>setCategoryDraft((p)=>({...p,slug:e.target.value}))} placeholder="Generated from name" className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="block text-sm font-semibold">Description<textarea value={categoryDraft.description} onChange={(e)=>setCategoryDraft((p)=>({...p,description:e.target.value}))} rows={3} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"><Upload size={14}/>{categorySaving?'Uploading...':'Upload image'}<input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp" disabled={categorySaving} className="hidden" onChange={(e)=>void uploadCategoryImage(e)}/></label>{categoryDraft.image_path?<p className="text-xs text-muted-foreground">{categoryDraft.image_path}</p>:null}<label className="block text-sm font-semibold">Image alt text<input value={categoryDraft.image_alt} onChange={(e)=>setCategoryDraft((p)=>({...p,image_alt:e.target.value}))} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="block text-sm font-semibold">Sort order<input type="number" value={categoryDraft.sort_order} onChange={(e)=>setCategoryDraft((p)=>({...p,sort_order:Number(e.target.value)||1}))} className="mt-2 w-full rounded-lg border px-3 py-2 font-normal"/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={categoryDraft.is_active} onChange={(e)=>setCategoryDraft((p)=>({...p,is_active:e.target.checked}))}/>Active</label></div><DialogFooter><button onClick={()=>setCategoryOpen(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">Cancel</button><button disabled={categorySaving} onClick={()=>void saveCategory()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">Save Category</button></DialogFooter></DialogContent></Dialog>
  </div>
}
