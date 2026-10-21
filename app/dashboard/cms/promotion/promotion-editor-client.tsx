'use client'
import { tryUploadAwsImage } from '@/lib/image-transport'
import { readCmsId } from '@/lib/cms-id-safety'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Gift, Pencil, Plus, Trash2, X } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { CMSTabs } from '@/components/cms-tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCmsAtomicListSave } from '@/hooks/use-cms-atomic-list-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

async function getAccessToken() {
  const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export type PromotionInitialData = {
  item: {
    label: string
    title: string
    description: string
    cta_text: string
    cta_link: string
    cta_action: 'redirect' | 'reveal_coupon'
    selected_coupon_id: number | string | null
    image_path: string
    mobile_image_path: string
    image_alt: string
    image_only_mode: boolean
    is_active: boolean
    show_once_per_session: boolean
    questions: Array<{ id: number | string | null; field_key: string; question: string; input_type: 'text' | 'email' | 'phone' | 'number' | 'options'; options: Array<{ id: string; label: string; value: string }>; allow_multiple: boolean; validation_pattern: string; validation_message: string; is_required: boolean; is_active: boolean; sort_order: number }>
  }
  coupons: Array<{
    id: number | string
    code: string
    title: string
    usage_limit: number | null
    usage_count: number
  }>
}

type ImageField = 'image_path' | 'mobile_image_path'

type PromotionQuestion = PromotionInitialData['item']['questions'][number]
type PromotionOption = PromotionQuestion['options'][number]

function uniqueIdentifier(source: string, used: Iterable<string>, fallback: string) {
  const taken = new Set(Array.from(used, (value) => value.toLowerCase()))
  let base = source
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!/^[a-z]/.test(base)) base = fallback
  if (base.length < 2) base = `${base}_field`
  base = base.slice(0, 45).replace(/_+$/g, '') || fallback

  let candidate = base
  let suffix = 2
  while (taken.has(candidate.toLowerCase())) {
    const suffixText = `_${suffix++}`
    candidate = `${base.slice(0, 50 - suffixText.length)}${suffixText}`
  }
  return candidate
}

function createBlankOption(existingOptions: PromotionOption[]) {
  return {
    id: crypto.randomUUID(),
    label: '',
    value: uniqueIdentifier('option', existingOptions.map((option) => option.value), 'option'),
  }
}

function createInitialOptions() {
  const first = createBlankOption([])
  return [first, createBlankOption([first])]
}

function publicAssetUrl(path: string) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_COLLECTION_BUCKET || 'hod'
  return projectUrl ? `${projectUrl}/storage/v1/object/public/${bucket}/${path}` : path
}

export function PromotionEditorClient({ initialData, initialRevision }: { initialData: PromotionInitialData; initialRevision: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteQuestionIndex, setDeleteQuestionIndex] = useState<number | null>(null)
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null)
  const [status, setStatus] = useState('Promotion popup loaded')
  const [uploadingField, setUploadingField] = useState<ImageField | null>(null)
  const [form, setForm] = useState(initialData.item)
  const [savedFingerprint, setSavedFingerprint] = useState(() => JSON.stringify(initialData.item))
  const { prepareSave, acceptSave } = useCmsAtomicListSave(initialData.item.questions, initialRevision)
  const dirty = useMemo(() => JSON.stringify(form) !== savedFingerprint, [form, savedFingerprint])
  const unsaved = useUnsavedChanges(dirty)

  const updateQuestion = (index: number, patch: Partial<PromotionInitialData['item']['questions'][number]>) => setForm((current) => ({ ...current, questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question) }))
  const addQuestion = () => {
    const index = form.questions.length
    setForm((current) => ({ ...current, questions: [...current.questions, { id: null, field_key: uniqueIdentifier(`question_${index + 1}`, current.questions.map((question) => question.field_key), 'question'), question: '', input_type: 'text', options: [], allow_multiple: false, validation_pattern: '', validation_message: '', is_required: true, is_active: true, sort_order: index }] }))
    setEditingQuestionIndex(index)
  }
  const removeQuestion = (index: number) => setForm((current) => ({ ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }))
  const moveQuestion = (index: number, direction: -1 | 1) => setForm((current) => { const next = [...current.questions]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return { ...current, questions: next } })
  const applyQuestion = (index: number) => {
    setForm((current) => {
      const question = current.questions[index]
      if (!question) return current

      const isNewQuestion = question.id == null
      const isFallbackKey = /^question(?:_\d+)?$/.test(question.field_key)
      const fieldKey = isNewQuestion && isFallbackKey
        ? uniqueIdentifier(question.question, current.questions.filter((_, questionIndex) => questionIndex !== index).map((item) => item.field_key), 'question')
        : question.field_key

      return {
        ...current,
        questions: current.questions.map((item, questionIndex) => questionIndex === index ? { ...item, field_key: fieldKey } : item),
      }
    })
    setEditingQuestionIndex(null)
  }

  const uploadAsset = async (file: File, field: ImageField) => {

    try {
      const awsPath = await tryUploadAwsImage(file, '/api/cms/uploads/promotion-popup', {},{start:()=>setUploadingField(field),finish:()=>setUploadingField(null)})
      if (awsPath) { setForm(prev => ({...prev,[field]:awsPath})); setStatus('Promotion image uploaded successfully'); return }
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Upload failed.'); return }


    const accessToken = await getAccessToken()
    if (!accessToken) {
      setStatus('Missing access token.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setStatus('File too large. Max size is 5MB.')
      return
    }
    setUploadingField(field)
    setStatus(field === 'mobile_image_path' ? 'Uploading mobile promotion image...' : 'Uploading promotion image...')
    let uploadedPath = ''
    const { supabase } = await import('@/lib/supabase')
    try {
      const preparedFile = await preparePromotionImage(file)
      const signResponse = await fetch('/api/cms/uploads/promotion-popup/sign', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: preparedFile.type, declaredSize: preparedFile.size }),
      })
      const signed = await signResponse.json().catch(() => null) as { bucket?: string; path?: string; token?: string; error?: string } | null
      if (!signResponse.ok || !signed?.bucket || !signed.path || !signed.token) throw new Error(signed?.error ?? 'Unable to prepare upload.')
      const { error } = await supabase.storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, preparedFile, { contentType: preparedFile.type })
      if (error) throw error
      uploadedPath = signed.path
    } catch (directError) {
      try {
        const formData = new FormData();formData.append('file', file)
        const response = await fetch('/api/cms/uploads/promotion-popup', { method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: formData })
        const payload = await response.json().catch(() => null) as { path?: string; error?: string } | null
        if (!response.ok || !payload?.path) throw new Error(payload?.error ?? (directError instanceof Error ? directError.message : 'Unable to upload image.'))
        uploadedPath = payload.path
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Unable to upload image.');setUploadingField(null);return
      }
    }
    setForm((prev) => ({ ...prev, [field]: uploadedPath }))
    setUploadingField(null)
    setStatus(field === 'mobile_image_path' ? 'Mobile promotion image uploaded successfully' : 'Promotion image uploaded successfully')
    toast({ title: 'Uploaded', description: field === 'mobile_image_path' ? 'Mobile promotion image uploaded successfully.' : 'Promotion image uploaded successfully.' })
  }


  const fieldClassName = 'w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15'

  const save = async () => {
    setIsSaving(true)
    try {


      // The save schema is strict: send only its fields (the snapshot also carries step, help_text, etc.).
      const questions = form.questions.map((question, index) => ({ id: question.id, field_key: question.field_key, question: question.question, input_type: question.input_type, options: question.options, allow_multiple: question.allow_multiple, validation_pattern: question.validation_pattern ?? '', validation_message: question.validation_message ?? '', is_required: question.is_required, is_active: question.is_active, sort_order: index }))
      const parent = { label:form.label,title:form.title,description:form.description,cta_text:form.cta_text,cta_link:form.cta_link,cta_action:form.cta_action,selected_coupon_id:form.selected_coupon_id,image_path:form.image_path,mobile_image_path:form.mobile_image_path,image_alt:form.image_alt,image_only_mode:form.image_only_mode,is_active:form.is_active,show_once_per_session:form.show_once_per_session }
      const response = await cmsFetch('/api/cms/promotion', {
        method: 'POST',
        headers: { 'content-type': 'application/json',  },
        body: JSON.stringify(prepareSave({ parent, items: questions }, questions)),
      })
      const payload = await response.json().catch(() => null) as { error?: string; parent?: Omit<PromotionInitialData['item'], 'questions'>; items?: PromotionInitialData['item']['questions']; revision?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save promotion popup.')
      if (!payload?.parent || !Array.isArray(payload.items) || !payload.revision) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      const canonical = { ...payload.parent, questions: payload.items }
      setForm(canonical)
      setSavedFingerprint(JSON.stringify(canonical))
      acceptSave(payload.items, payload.revision)
      setConfirmOpen(false)
      setStatus('Promotion popup saved')
      toast({ title: 'Saved', description: 'Promotion popup updated successfully.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save promotion popup.'
      setStatus(message)
      toast({ title: 'Save failed', description: message, variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-full p-6 lg:p-8">
      <CMSTabs />
      <div className="mb-8 mt-8 flex items-center justify-between gap-4">
        <Link href="/dashboard/cms" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80"><ArrowLeft size={16} />Back to CMS</Link>
        <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || Boolean(uploadingField) || editingQuestionIndex !== null} position="inline" />
      </div>
      <div className="mb-10">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Promotion Popup</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage the first-visit promotional modal shown on the storefront.</p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>
      <div className="w-full space-y-9 rounded-xl border border-border bg-white p-6 shadow-xs sm:p-8"><section aria-labelledby="content-heading" className="border-t border-border pt-8">
          <h2 id="content-heading" className="font-jakarta text-base font-semibold text-foreground">Content</h2>
          <p className="mt-1 text-sm text-muted-foreground">Write the message shoppers will see in the popup.</p>
          <div className="mt-5 space-y-4">
            <div><label htmlFor="promotion-eyebrow" className="mb-2 block text-sm font-semibold text-foreground">Eyebrow text</label><input id="promotion-eyebrow" value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} placeholder="For a limited time" className={fieldClassName} /><p className="mt-1.5 text-xs text-muted-foreground">A short line displayed above the title.</p></div>
            <div><label htmlFor="promotion-title" className="mb-2 block text-sm font-semibold text-foreground">Title</label><input id="promotion-title" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className={fieldClassName} /></div>
            <div><label htmlFor="promotion-description" className="mb-2 block text-sm font-semibold text-foreground">Description</label><textarea id="promotion-description" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={4} className={fieldClassName} /></div>
          </div>
        </section>

        <section aria-labelledby="promotion-media-heading" className="border-t border-border pt-8">
          <h2 id="promotion-media-heading" className="font-jakarta text-base font-semibold text-foreground">Popup images</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use separate desktop and mobile artwork when needed.</p>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">{([['image_path','Desktop image'],['mobile_image_path','Mobile image']] as const).map(([field,label])=><div key={field} className="rounded-lg border border-border p-4"><p className="text-sm font-semibold">{label}</p><div className="mt-3 flex min-h-40 items-center justify-center overflow-hidden bg-secondary/30">{form[field]?<Image unoptimized width={640} height={360} src={publicAssetUrl(form[field])} alt={form.image_alt||label} className="h-40 w-full object-contain"/>:<span className="text-sm text-muted-foreground">No image uploaded</span>}</div><label className="mt-3 inline-flex cursor-pointer rounded-md border border-border px-3 py-2 text-sm font-semibold">{uploadingField===field?'Uploading...':'Upload image'}<input type="file" accept="image/svg+xml,image/jpeg,image/png,image/webp,image/avif" disabled={Boolean(uploadingField)} className="hidden" onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadAsset(file,field);event.target.value='' }}/></label></div>)}</div>
          <label className="mt-5 block text-sm font-semibold">Image alt text<input value={form.image_alt} onChange={(event)=>setForm((current)=>({...current,image_alt:event.target.value}))} className={fieldClassName}/></label>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.image_only_mode} onChange={(event)=>setForm((current)=>({...current,image_only_mode:event.target.checked}))}/>Use image-only presentation</label>
        </section>

        <section aria-labelledby="cta-heading" className="border-t border-border pt-8">
          <h2 id="cta-heading" className="font-jakarta text-base font-semibold text-foreground">Email action</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every promotion shows an email field with its own Submit button first. Choose the CTA shown after a successful submission.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {([
              { value: 'redirect' as const, title: 'Redirect', description: 'Collect the email, then show a CTA linked to a destination.', icon: ExternalLink },
              { value: 'reveal_coupon' as const, title: 'Reveal coupon', description: 'Collect the email, then display a selected coupon.', icon: Gift },
            ]).map((action) => {
              const selected = form.cta_action === action.value
              const Icon = action.icon
              return <button key={action.value} type="button" aria-pressed={selected} onClick={() => setForm((prev) => ({ ...prev, cta_action: action.value }))} className={`flex items-start gap-3 rounded-lg border p-4 text-left outline-none transition focus:ring-2 focus:ring-primary/25 ${selected ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/30'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-primary/30 bg-white text-primary' : 'border-border bg-secondary/30 text-muted-foreground'}`}><Icon size={17} /></span><span><span className="block text-sm font-semibold text-foreground">{action.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{action.description}</span></span></button>
            })}
          </div>
          <div className="mt-5 space-y-4">
            <div><label htmlFor="promotion-cta-text" className="mb-2 block text-sm font-semibold text-foreground">CTA text</label><input id="promotion-cta-text" value={form.cta_text} onChange={(e) => setForm((prev) => ({ ...prev, cta_text: e.target.value }))} placeholder="Shop the collection" className={fieldClassName} /><p className="mt-1.5 text-xs text-muted-foreground">This CTA appears only after the shopper submits their email.</p></div>
            {form.cta_action === 'redirect' ? (
              <div><label htmlFor="promotion-cta-link" className="mb-2 block text-sm font-semibold text-foreground">Destination link</label><input id="promotion-cta-link" value={form.cta_link} onChange={(e) => setForm((prev) => ({ ...prev, cta_link: e.target.value }))} placeholder="/shop" className={fieldClassName} /><p className="mt-1.5 text-xs text-muted-foreground">The shopper is redirected only after their email is saved.</p></div>
            ) : (
              <div><label className="mb-2 block text-sm font-semibold text-foreground">Coupon to reveal</label><Select value={form.selected_coupon_id == null ? undefined : String(form.selected_coupon_id)} onValueChange={(value) => setForm((prev) => ({ ...prev, selected_coupon_id: readCmsId(value) }))}><SelectTrigger className="h-11 w-full bg-white"><SelectValue placeholder="Select an active coupon" /></SelectTrigger><SelectContent>{initialData.coupons.map((coupon) => <SelectItem key={coupon.id} value={String(coupon.id)} disabled={coupon.usage_limit != null && coupon.usage_count >= coupon.usage_limit}>{coupon.code}{coupon.title ? ` — ${coupon.title}` : ''}</SelectItem>)}</SelectContent></Select>{initialData.coupons.length === 0 ? <p className="mt-1.5 text-xs text-destructive">Create and activate a coupon before enabling this action.</p> : <p className="mt-1.5 text-xs text-muted-foreground">The coupon code remains hidden until the email is submitted successfully.</p>}</div>
            )}
          </div>
        </section>

        <section aria-labelledby="questions-heading" className="border-t border-border pt-8">
  <div className="flex items-start justify-between gap-4"><div><h2 id="questions-heading" className="text-base font-semibold">Coupon questions</h2><p className="mt-1 text-sm text-muted-foreground">Manage questions in the table. Click Edit to update a question.</p></div><button type="button" onClick={addQuestion} className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold"><Plus size={14}/>Add question</button></div>
  <div className="mt-5 w-full overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[980px] text-left">
      <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Question</th><th className="px-4 py-3">Answer type</th><th className="min-w-[260px] px-4 py-3">Configured options</th><th className="px-4 py-3">Required</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
      <tbody className="divide-y divide-border bg-white">{form.questions.map((question, index) => <tr key={`${question.id ?? 'new'}-${index}`}><td className="px-4 py-3 text-sm">{index + 1}</td><td className="max-w-[320px] px-4 py-3"><p className="truncate text-sm font-semibold">{question.question || 'Untitled question'}</p></td><td className="px-4 py-3 text-sm capitalize">{question.input_type === 'options' ? question.allow_multiple ? 'Multiple options' : 'Single option' : question.input_type}</td><td className="px-4 py-3">{question.input_type === 'options' ? (question.options.length ? <div className="flex flex-wrap gap-1.5">{question.options.map((option, optionIndex) => <span key={option.id || optionIndex} className="inline-flex max-w-[180px] rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs text-foreground"><span className="truncate">{option.label || `Untitled option ${optionIndex + 1}`}</span></span>)}</div> : <span className="text-xs text-muted-foreground">No options configured</span>) : <span className="text-sm text-muted-foreground">—</span>}</td><td className="px-4 py-3 text-sm">{question.is_required ? 'Yes' : 'No'}</td><td className="px-4 py-3 text-sm">{question.is_active ? 'Active' : 'Inactive'}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" onClick={() => moveQuestion(index,-1)} disabled={index === 0} className="rounded-md border border-border bg-white p-2 text-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"><ArrowUp size={14}/></button><button type="button" onClick={() => moveQuestion(index,1)} disabled={index === form.questions.length-1} className="rounded-md border border-border bg-white p-2 text-foreground transition hover:border-primary hover:text-primary disabled:opacity-30"><ArrowDown size={14}/></button><button type="button" onClick={() => setEditingQuestionIndex(index)} className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary"><Pencil size={13}/>Edit</button><button type="button" onClick={() => setDeleteQuestionIndex(index)} disabled={form.questions.length === 1} className="rounded-md border border-border bg-white p-2 text-destructive transition hover:border-destructive/40 hover:bg-destructive/5 disabled:opacity-30"><Trash2 size={14}/></button></div></td></tr>)}</tbody>
    </table>
  </div>
  {editingQuestionIndex !== null && form.questions[editingQuestionIndex] ? (() => { const question = form.questions[editingQuestionIndex]; return <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-white shadow-2xl"><div className="sticky top-0 flex items-center justify-between border-b border-border bg-white px-6 py-5"><div><h3 className="text-lg font-semibold">{question.id == null ? 'Add question' : 'Edit question'}</h3><p className="text-xs text-muted-foreground">Apply this question, then use Save Changes to publish the promotion.</p></div><button type="button" onClick={() => setEditingQuestionIndex(null)} className="rounded-md border border-border bg-white p-2 text-muted-foreground transition hover:border-primary hover:text-primary"><X size={16}/></button></div><div className="grid gap-4 p-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><label className="mb-2 block text-sm font-semibold">Question</label><input value={question.question} onChange={(e) => updateQuestion(editingQuestionIndex,{question:e.target.value})} className={fieldClassName}/></div>
    <div><label className="mb-2 block text-sm font-semibold">Answer type</label><Select value={question.input_type} onValueChange={(value: PromotionInitialData['item']['questions'][number]['input_type']) => updateQuestion(editingQuestionIndex,{input_type:value,allow_multiple:value === 'options' ? question.allow_multiple : false,options:value === 'options' && question.options.length === 0 ? createInitialOptions() : question.options})}><SelectTrigger className="h-11 bg-white"><SelectValue/></SelectTrigger><SelectContent className="z-[110]"><SelectItem value="text">Text</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="phone">Phone</SelectItem><SelectItem value="number">Number</SelectItem><SelectItem value="options">Options</SelectItem></SelectContent></Select></div>
    {question.input_type === 'options' ? <div className="sm:col-span-2 rounded-lg border border-border bg-secondary/20 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><label className="text-sm font-semibold">Answer options</label><p className="mt-1 text-xs text-muted-foreground">Add at least two choices. Shoppers will see these labels.</p></div><button type="button" onClick={() => updateQuestion(editingQuestionIndex,{options:[...question.options,createBlankOption(question.options)]})} className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-primary"><Plus size={14}/>Add option</button></div><div className="mt-4 space-y-2">{question.options.map((option,optionIndex) => <div key={option.id || optionIndex} className="grid gap-2 rounded-lg border border-border bg-white p-3 sm:grid-cols-[1fr_auto]"><input value={option.label} onChange={(e) => updateQuestion(editingQuestionIndex,{options:question.options.map((item,i) => i === optionIndex ? {...item,label:e.target.value} : item)})} placeholder={`Option ${optionIndex + 1} label`} aria-label={`Option ${optionIndex + 1} label`} className={fieldClassName}/><button type="button" onClick={() => updateQuestion(editingQuestionIndex,{options:question.options.filter((_,i) => i !== optionIndex)})} className="rounded-md border border-border p-3 text-destructive"><Trash2 size={14}/></button></div>)}</div><label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={question.allow_multiple} onChange={(e) => updateQuestion(editingQuestionIndex,{allow_multiple:e.target.checked})}/>Allow multiple selections</label></div> : null}
    <div><label className="mb-2 block text-sm font-semibold">Validation message</label><input value={question.validation_message} onChange={(e) => updateQuestion(editingQuestionIndex,{validation_message:e.target.value})} className={fieldClassName}/></div><div className="flex items-end gap-5 pb-3"><label className="flex gap-2 text-sm"><input type="checkbox" checked={question.is_required} onChange={(e) => updateQuestion(editingQuestionIndex,{is_required:e.target.checked})}/>Required</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={question.is_active} onChange={(e) => updateQuestion(editingQuestionIndex,{is_active:e.target.checked})}/>Active</label></div>
  </div><div className="flex justify-end gap-3 border-t border-border bg-secondary/20 px-6 py-4"><button type="button" onClick={() => setEditingQuestionIndex(null)} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary">Cancel</button><button type="button" onClick={() => applyQuestion(editingQuestionIndex)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs transition hover:bg-primary/90">Apply question</button></div></div></div> })() : null}
</section>
<section aria-labelledby="visibility-heading" className="border-t border-border pt-8">
          <h2 id="visibility-heading" className="font-jakarta text-base font-semibold text-foreground">Visibility</h2>
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            <label className="flex cursor-pointer items-start justify-between gap-5 p-4"><span><span className="block text-sm font-semibold text-foreground">Active</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Display this promotion on the storefront.</span></span><input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} className="mt-1 h-4 w-4 accent-primary" /></label>
            <label className="flex cursor-pointer items-start justify-between gap-5 p-4"><span><span className="block text-sm font-semibold text-foreground">Show once per session</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">After dismissal, do not show it again during the shopper’s current visit.</span></span><input type="checkbox" checked={form.show_once_per_session} onChange={(e) => setForm((prev) => ({ ...prev, show_once_per_session: e.target.checked }))} className="mt-1 h-4 w-4 accent-primary" /></label>
          </div>
        </section>
      </div>
      <ConfirmDialog isOpen={deleteQuestionIndex !== null} title="Delete question?" description="This question will be removed from the popup configuration when you save." confirmText="Delete" cancelText="Cancel" type="delete" onConfirm={() => { if (deleteQuestionIndex !== null) removeQuestion(deleteQuestionIndex); setDeleteQuestionIndex(null) }} onCancel={() => setDeleteQuestionIndex(null)} />
      <ConfirmDialog isOpen={confirmOpen} title="Save promotion popup?" description="This will update the storefront promotional popup." confirmText="Save" cancelText="Cancel" type="confirm" isLoading={isSaving} onConfirm={() => void save()} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved promotion changes?" description="Your promotion popup changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
    </div>
  )
}

async function preparePromotionImage(file: File) {
  if (file.type === 'image/svg+xml') return file
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Invalid image type.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const width = Math.min(bitmap.width, 1600)
    const height = Math.max(1, Math.round(bitmap.height * (width / bitmap.width)))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
    if (!blob) throw new Error('Unable to optimize image.')
    return new File([blob], `${crypto.randomUUID()}.webp`, { type: 'image/webp' })
  } finally {
    bitmap.close()
  }
}
