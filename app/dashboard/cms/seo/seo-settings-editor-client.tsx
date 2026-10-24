'use client'

import { useEffect, useMemo, useState } from 'react'
import { CMSTabs } from '@/components/cms-tabs'
import { CmsSaveAction } from '@/components/cms-save-action'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SeoFields } from '@/components/seo-fields'
import { useToast } from '@/hooks/use-toast'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { cmsFetch } from '@/lib/cms-transport'

type PageRow = { page_key: string; seo_title: string; seo_description: string; og_image_path: string; seo_indexable: boolean }
type SiteRow = {
  org_name: string; org_logo_path: string; org_same_as: string[]; default_og_image_path: string
  google_site_verification: string; bing_site_verification: string
}
type Snapshot = { pages: PageRow[]; site: SiteRow; revision: string }

// Where each page lives on the website, for the search-result preview.
const PAGES: Record<string, { label: string; path: string }> = {
  about: { label: 'About', path: '/about' },
  b2b: { label: 'B2B / trade', path: '/b2b' },
  bespoke: { label: 'Bespoke', path: '/bespoke' },
  blog: { label: 'Blog index', path: '/blog' },
  collection: { label: 'Collection', path: '/collection' },
  contact: { label: 'Contact', path: '/contact' },
  education: { label: 'Education index', path: '/education' },
  faq: { label: 'FAQ', path: '/faq' },
  'privacy-policy': { label: 'Privacy policy', path: '/privacy-policy' },
  returns: { label: 'Returns', path: '/returns' },
  shipping: { label: 'Shipping', path: '/shipping' },
  shop: { label: 'Shop', path: '/shop' },
  terms: { label: 'Terms', path: '/terms' },
}

const inputClass = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'

export function SeoSettingsEditorClient() {
  const { toast } = useToast()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [pages, setPages] = useState<PageRow[]>([])
  const [site, setSite] = useState<SiteRow | null>(null)
  const [sameAsText, setSameAsText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState('Loading SEO settings...')

  const load = async () => {
    const response = await cmsFetch('/api/cms/seo-settings')
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload) throw new Error(payload?.error ?? 'Unable to load SEO settings.')
    const loaded = payload as Snapshot
    setSnapshot(loaded)
    setPages(loaded.pages)
    setSite(loaded.site)
    setSameAsText(loaded.site.org_same_as.join('\n'))
    setStatus('Empty fields use the website’s built-in text.')
  }

  useEffect(() => {
    let active = true
    load()
      .catch((error) => { if (active) setStatus(error instanceof Error ? error.message : 'Unable to load SEO settings.') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sameAs = useMemo(() => sameAsText.split('\n').map((line) => line.trim()).filter(Boolean), [sameAsText])
  const draft = useMemo(() => (site ? JSON.stringify({ pages, site: { ...site, org_same_as: sameAs } }) : ''), [pages, site, sameAs])
  const saved = useMemo(() => (snapshot ? JSON.stringify({ pages: snapshot.pages, site: snapshot.site }) : ''), [snapshot])
  const dirty = Boolean(snapshot) && draft !== saved
  const unsaved = useUnsavedChanges(dirty)

  const setPage = (key: string, patch: Partial<PageRow>) =>
    setPages((current) => current.map((page) => (page.page_key === key ? { ...page, ...patch } : page)))
  const setSiteField = (patch: Partial<SiteRow>) => setSite((current) => (current ? { ...current, ...patch } : current))

  const save = async () => {
    if (!snapshot || !site) return
    setIsSaving(true)
    try {
      const response = await cmsFetch('/api/cms/seo-settings', {
        method: 'POST',
        body: JSON.stringify({ expected_revision: snapshot.revision, pages, site: { ...site, org_same_as: sameAs } }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to save SEO settings.')
      unsaved.release()
      setSnapshot(payload as Snapshot)
      setPages((payload as Snapshot).pages)
      setSite((payload as Snapshot).site)
      setSameAsText((payload as Snapshot).site.org_same_as.join('\n'))
      setConfirmOpen(false)
      toast({ title: 'SEO settings saved', description: 'The website shows the new text within a few minutes.' })
    } catch (error) {
      setConfirmOpen(false)
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : 'Unable to save SEO settings.' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <CMSTabs />
      <div className="p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="font-jakarta text-3xl font-semibold text-foreground">SEO</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">How the fixed pages and the whole business appear in search results. Category, subcategory, product, blog and education pages have their own SEO fields in their editors.</p>
            <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{status}</p>
          </div>
          <CmsSaveAction onClick={() => setConfirmOpen(true)} isSaving={isSaving} disabled={!dirty || isLoading} position="inline" />
        </div>

        {site ? (
          <div className="space-y-8">
            <section className="space-y-4 rounded-xl border border-border bg-white p-6">
              <h2 className="text-lg font-semibold text-foreground">Business details for search engines</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="org-name">Business name</label>
                  <input id="org-name" maxLength={120} value={site.org_name} onChange={(event) => setSiteField({ org_name: event.target.value })} placeholder="House of Diams" className={inputClass} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="org-logo">Logo address</label>
                  <input id="org-logo" maxLength={2000} value={site.org_logo_path} onChange={(event) => setSiteField({ org_logo_path: event.target.value })} placeholder="/images/logo.png or https://…" className={inputClass} />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="og-image">Default share image</label>
                  <input id="og-image" maxLength={2000} value={site.default_og_image_path} onChange={(event) => setSiteField({ default_og_image_path: event.target.value })} placeholder="/images/share.jpg or https://…" className={inputClass} />
                  <p className="mt-1 text-xs text-muted-foreground">Used when a page has no picture of its own (about 1200 by 630 pixels).</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="org-same-as">Official profile links</label>
                  <textarea id="org-same-as" rows={4} value={sameAsText} onChange={(event) => setSameAsText(event.target.value)} placeholder={'https://www.instagram.com/…\nhttps://www.linkedin.com/company/…'} className={inputClass} />
                  <p className="mt-1 text-xs text-muted-foreground">One https:// link per line. Only profiles you own.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="google-verification">Google Search Console code</label>
                  <input id="google-verification" maxLength={200} value={site.google_site_verification} onChange={(event) => setSiteField({ google_site_verification: event.target.value })} className={inputClass} />
                  <p className="mt-1 text-xs text-muted-foreground">Only the code from the HTML-tag method (the content=&quot;…&quot; part).</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-semibold" htmlFor="bing-verification">Bing Webmaster code</label>
                  <input id="bing-verification" maxLength={200} value={site.bing_site_verification} onChange={(event) => setSiteField({ bing_site_verification: event.target.value })} className={inputClass} />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">Fixed pages</h2>
              <div className="grid gap-6 xl:grid-cols-2">
                {pages.map((page) => {
                  const meta = PAGES[page.page_key] ?? { label: page.page_key, path: `/${page.page_key}` }
                  return (
                    <div key={page.page_key} className="space-y-4 rounded-xl border border-border bg-white p-6">
                      <h3 className="text-base font-semibold text-foreground">{meta.label}</h3>
                      <SeoFields
                        idPrefix={`page-${page.page_key}`}
                        title={page.seo_title}
                        description={page.seo_description}
                        onTitleChange={(seo_title) => setPage(page.page_key, { seo_title })}
                        onDescriptionChange={(seo_description) => setPage(page.page_key, { seo_description })}
                        indexable={page.seo_indexable}
                        onIndexableChange={(seo_indexable) => setPage(page.page_key, { seo_indexable })}
                        fallbackTitle={meta.label}
                        fallbackDescription="The website's built-in description is used."
                        path={meta.path}
                      />
                      <div>
                        <label className="mb-2 block text-sm font-semibold" htmlFor={`page-${page.page_key}-image`}>Share image</label>
                        <input id={`page-${page.page_key}-image`} maxLength={2000} value={page.og_image_path} onChange={(event) => setPage(page.page_key, { og_image_path: event.target.value })} placeholder="Default share image" className={inputClass} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <ConfirmDialog isOpen={confirmOpen} title="Save SEO settings?" description="This changes how these pages appear in search results." confirmText="Save" onConfirm={() => void save()} onCancel={() => setConfirmOpen(false)} />
      <ConfirmDialog isOpen={unsaved.showWarning} title="Discard unsaved SEO changes?" description="Your SEO changes have not been saved." confirmText="Discard changes" cancelText="Keep editing" type="warning" onConfirm={unsaved.handleDiscard} onCancel={() => unsaved.setShowWarning(false)} />
    </div>
  )
}
