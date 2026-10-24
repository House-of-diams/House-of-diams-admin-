'use client'

import { SeoFields } from '@/components/seo-fields'

/** Search-engine copy for a category, subcategory or option page. Empty fields use the website's built-in text. */
export type CatalogSeoState = {
  title: string
  description: string
  h1: string
  introHtml: string
  bodyHtml: string
  guidePath: string
  indexable: boolean
}

type SeoSource = {
  seo_title?: string | null
  seo_description?: string | null
  seo_h1?: string | null
  seo_intro_html?: string | null
  seo_body_html?: string | null
  seo_guide_path?: string | null
  seo_indexable?: boolean
}

export const emptyCatalogSeo: CatalogSeoState = { title: '', description: '', h1: '', introHtml: '', bodyHtml: '', guidePath: '', indexable: true }

export function catalogSeoFromItem(item: SeoSource): CatalogSeoState {
  return {
    title: item.seo_title ?? '',
    description: item.seo_description ?? '',
    h1: item.seo_h1 ?? '',
    introHtml: item.seo_intro_html ?? '',
    bodyHtml: item.seo_body_html ?? '',
    guidePath: item.seo_guide_path ?? '',
    indexable: item.seo_indexable !== false,
  }
}

/**
 * Only the fields the editor actually changed are sent, so a list that did not carry the SEO columns
 * can never blank stored copy by accident. Returns undefined when nothing changed.
 */
export function catalogSeoPayload(current: CatalogSeoState, initial: CatalogSeoState): Record<string, string | boolean> | undefined {
  const changes: Record<string, string | boolean> = {}
  if (current.title !== initial.title) changes.seo_title = current.title
  if (current.description !== initial.description) changes.seo_description = current.description
  if (current.h1 !== initial.h1) changes.seo_h1 = current.h1
  if (current.introHtml !== initial.introHtml) changes.seo_intro_html = current.introHtml
  if (current.bodyHtml !== initial.bodyHtml) changes.seo_body_html = current.bodyHtml
  if (current.guidePath !== initial.guidePath) changes.seo_guide_path = current.guidePath
  if (current.indexable !== initial.indexable) changes.seo_indexable = current.indexable
  return Object.keys(changes).length > 0 ? changes : undefined
}

const inputClass = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'

export function CatalogSeoSection({
  idPrefix,
  value,
  onChange,
  name,
  slug,
  disabled,
}: {
  idPrefix: string
  value: CatalogSeoState
  onChange: (next: CatalogSeoState) => void
  name: string
  slug: string
  disabled?: boolean
}) {
  const set = (patch: Partial<CatalogSeoState>) => onChange({ ...value, ...patch })
  const label = name.trim() || 'this page'
  return (
    <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">Search results (SEO)</legend>
      <SeoFields
        idPrefix={idPrefix}
        title={value.title}
        description={value.description}
        onTitleChange={(title) => set({ title })}
        onDescriptionChange={(description) => set({ description })}
        indexable={value.indexable}
        onIndexableChange={(indexable) => set({ indexable })}
        fallbackTitle={name.trim()}
        fallbackDescription={`Shop ${label} at House of Diams.`}
        path={slug ? `/${slug}` : '/'}
      />
      <div>
        <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor={`${idPrefix}-seo-h1`}>Page heading (H1)</label>
        <input id={`${idPrefix}-seo-h1`} type="text" maxLength={200} value={value.h1} onChange={(event) => set({ h1: event.target.value })} placeholder={`Explore ${name.trim()}`} className={inputClass} />
        <p className="mt-1 text-xs text-muted-foreground">The main heading on the page. Leave empty for the default.</p>
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor={`${idPrefix}-seo-intro`}>Intro text (above the products)</label>
        <textarea id={`${idPrefix}-seo-intro`} rows={4} maxLength={10000} value={value.introHtml} onChange={(event) => set({ introHtml: event.target.value })} placeholder="<p>Two or three sentences that say what this page is.</p>" className={`${inputClass} font-mono`} />
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor={`${idPrefix}-seo-body`}>Buying guide text (below the products)</label>
        <textarea id={`${idPrefix}-seo-body`} rows={8} maxLength={50000} value={value.bodyHtml} onChange={(event) => set({ bodyHtml: event.target.value })} placeholder="<h2>How to choose</h2><p>…</p>" className={`${inputClass} font-mono`} />
        <p className="mt-1 text-xs text-muted-foreground">Simple HTML only: p, h2, h3, ul, li, a, strong. Anything unsafe is removed when you save. Shown on the first page only.</p>
      </div>
      <div>
        <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor={`${idPrefix}-seo-guide`}>Guide link</label>
        <input id={`${idPrefix}-seo-guide`} type="text" maxLength={300} value={value.guidePath} onChange={(event) => set({ guidePath: event.target.value })} placeholder="/blog/your-guide-slug" className={inputClass} />
        <p className="mt-1 text-xs text-muted-foreground">Page on this site, starting with /. Shown as &ldquo;Read our guide&rdquo; once that article is published.</p>
      </div>
    </fieldset>
  )
}
