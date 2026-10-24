'use client'

import { measureSeoText, seoLengthStatus, type SeoLengthKind } from '@/lib/seo-length'

const SEO_TONE_CLASS = { empty: 'text-muted-foreground', short: 'text-amber-600', long: 'text-red-600', good: 'text-emerald-700' } as const

export function SeoMeter({ value, kind }: { value: string; kind: SeoLengthKind }) {
  const status = seoLengthStatus(value, kind)
  return (
    <span className={`text-right text-xs ${SEO_TONE_CLASS[status.tone]}`} aria-live="polite">
      {status.characters}/{status.max} characters &middot; {status.words} {status.words === 1 ? 'word' : 'words'} &middot; {status.message}
    </span>
  )
}

const inputClass = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm'

/**
 * Search-result fields shared by every editor: SEO title, meta description, an optional
 * "show in search results" switch and a preview of how the result will read.
 * Empty fields mean the website's own default text is used; the placeholders say what that is.
 */
export function SeoFields({
  idPrefix,
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  indexable,
  onIndexableChange,
  fallbackTitle,
  fallbackDescription,
  path,
}: {
  idPrefix: string
  title: string
  description: string
  onTitleChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  indexable?: boolean
  onIndexableChange?: (value: boolean) => void
  fallbackTitle: string
  fallbackDescription: string
  /** Page address shown in the preview, e.g. "/engagement-rings". */
  path: string
}) {
  const previewTitle = measureSeoText(title).text || measureSeoText(fallbackTitle).text
  const previewDescription = measureSeoText(description).text || measureSeoText(fallbackDescription).text

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-4">
          <label className="text-sm font-semibold text-foreground" htmlFor={`${idPrefix}-seo-title`}>SEO title</label>
          <SeoMeter value={title} kind="title" />
        </div>
        <input id={`${idPrefix}-seo-title`} type="text" maxLength={120} value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder={fallbackTitle} className={inputClass} />
        <p className="mt-1 text-xs text-muted-foreground">&ldquo;| House of Diams&rdquo; is added automatically.</p>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between gap-4">
          <label className="text-sm font-semibold text-foreground" htmlFor={`${idPrefix}-seo-description`}>Meta description</label>
          <SeoMeter value={description} kind="description" />
        </div>
        <textarea id={`${idPrefix}-seo-description`} maxLength={500} rows={3} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder={fallbackDescription} className={inputClass} />
      </div>
      {onIndexableChange ? (
        <label className="flex items-start gap-3 text-sm text-foreground">
          <input type="checkbox" checked={indexable !== false} onChange={(event) => onIndexableChange(event.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="font-semibold">Show in search results</span>
            <span className="block text-xs text-muted-foreground">Untick for pages that are empty or not ready. The page stays reachable but Google is asked not to list it, and it leaves the sitemap.</span>
          </span>
        </label>
      ) : null}
      <div className="rounded-lg border border-border bg-muted/30 p-3" aria-label="Search result preview">
        <p className="text-xs text-muted-foreground">houseofdiams.com{path === '/' ? '' : path}</p>
        <p className="text-[15px] text-[#1a0dab]">{previewTitle ? `${previewTitle} | House of Diams` : 'House of Diams'}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{previewDescription || 'No description yet.'}</p>
        {indexable === false ? <p className="mt-1 text-xs font-semibold text-amber-700">Hidden from search results.</p> : null}
      </div>
    </div>
  )
}
