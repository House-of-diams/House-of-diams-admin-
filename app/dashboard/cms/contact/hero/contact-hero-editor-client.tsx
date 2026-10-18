'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useCmsSingletonSave } from '@/hooks/use-cms-singleton-save'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'

export type ContactHeroInitialData = {
  item: {
    section_key: string
    eyebrow: string
    heading: string
    subtitle: string
  }
}

const fingerprint = (item: ContactHeroInitialData['item']) => JSON.stringify({ section_key: item.section_key, eyebrow: item.eyebrow, heading: item.heading, subtitle: item.subtitle })

export function ContactHeroEditorClient({ initialData, initialRevision }: { initialData: ContactHeroInitialData; initialRevision: string }) {
  const router = useRouter()
  const [eyebrow, setEyebrow] = useState(initialData.item.eyebrow)
  const [heading, setHeading] = useState(initialData.item.heading)
  const [subtitle, setSubtitle] = useState(initialData.item.subtitle)
  const [status, setStatus] = useState('Contact hero loaded')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [savedFingerprint, setSavedFingerprint] = useState(() => fingerprint(initialData.item))
  const { prepareSave, acceptSave } = useCmsSingletonSave(initialRevision)
  const draft = { section_key: 'contact_hero', eyebrow, heading, subtitle }
  const dirty = fingerprint(draft) !== savedFingerprint
  const unsaved = useUnsavedChanges(dirty)

  const save = async () => {
    setIsSaving(true)
    try {



      const response = await cmsFetch('/api/cms/contact/hero', { method: 'POST', headers: { 'content-type': 'application/json',  }, body: JSON.stringify(prepareSave(draft)) })
      const payload = (await response.json().catch(() => null)) as { error?: string; revision?: string; item?: ContactHeroInitialData['item'] } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save contact hero.')
      if (!payload?.revision || !payload.item) throw new Error('Save response was interrupted. Retry to confirm the same save.')
      setEyebrow(payload.item.eyebrow); setHeading(payload.item.heading); setSubtitle(payload.item.subtitle)
      setSavedFingerprint(fingerprint(payload.item)); acceptSave(payload.revision)
      setConfirmOpen(false); setStatus('Contact hero saved')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to save contact hero.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/dashboard/cms/contact" onClick={(event) => { event.preventDefault(); unsaved.confirmNavigation(() => router.push('/dashboard/cms/contact')) }} className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <ArrowLeft size={16} />
          Back to Contact
        </Link>
        <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty} position="inline" />
      </div>

      <div className="mb-10">
        <h1 className="text-3xl font-semibold">Contact Hero</h1>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </div>

      <div className="max-w-2xl space-y-6 rounded-lg border border-border bg-white p-8">
        <div>
          <label className="mb-2 block text-sm font-semibold">Eyebrow</label>
          <input value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} className="w-full rounded-lg border border-border px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold">Heading</label>
          <input value={heading} onChange={(e) => setHeading(e.target.value)} className="w-full rounded-lg border border-border px-4 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold">Subtitle</label>
          <textarea value={subtitle} onChange={(e) => setSubtitle(e.target.value)} rows={5} className="w-full rounded-lg border border-border px-4 py-2.5 text-sm" />
        </div>
      </div>

      <ConfirmDialog isOpen={confirmOpen} title="Save Contact Hero?" description="This will update the contact hero on the live site." confirmText="Save" cancelText="Cancel" type="confirm" isLoading={isSaving} onConfirm={save} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved Contact Hero changes?" description="Your Contact Hero changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
    </div>
  )
}
