'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Film, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { canSelectLibraryVideo, fetchVideoLibrary, selectLibraryVideo, type ClientVideoAsset } from '@/lib/video-transport'

type VideoAsset = ClientVideoAsset

const displayName = (key: string) => key.split('/').pop() || key
const displayFolder = (key: string) => {
  const parts = key.split('/')
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : 'Library root'
}
function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size'
  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex > 1 ? 1 : 0)} ${units[unitIndex]}`
}

function LazyVideoThumbnail({ video }: { video: VideoAsset }) {
  const [previewRequested, setPreviewRequested] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#EEF7FF] via-[#F7FBFF] to-[#E7F2FC]"
      onPointerEnter={() => setPreviewRequested(true)}
    >
      {previewRequested && !failed ? (
        <video
          src={video.url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onLoadedMetadata={(event) => {
            const element = event.currentTarget
            if (Number.isFinite(element.duration) && element.duration > 0) element.currentTime = Math.min(0.08, element.duration / 2)
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#C9E1F5] bg-white/90 text-[#3779B5] shadow-sm"><Film size={22} /></span>
      )}
    </div>
  )
}

export function VideoLibraryDialog({ open, onClose, onSelect }: {
  open: boolean
  onClose: () => void
  onSelect: (video: VideoAsset) => void
}) {
  const [items, setItems] = useState<VideoAsset[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const loadVersion = useRef(0)

  const loadLibrary = async (forceRefresh = false) => {
    const version = ++loadVersion.current
    if (forceRefresh) setRefreshing(true)
    else setLoading(true)
    setError('')
    try { const next = await fetchVideoLibrary(forceRefresh); if (version === loadVersion.current) setItems(next) }
    catch (loadError) { if (version === loadVersion.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load videos.') }
    finally { if (version === loadVersion.current) { setLoading(false); setRefreshing(false) } }
  }

  useEffect(() => {
    if (!open) return
    const version = ++loadVersion.current
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return
      setLoading(true)
      setError('')
      try { const next = await fetchVideoLibrary(false); if (active && version === loadVersion.current) setItems(next) }
      catch (loadError) { if (active && version === loadVersion.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load videos.') }
      finally { if (active && version === loadVersion.current) { setLoading(false); setRefreshing(false) } }
    })
    return () => { active = false }
  }, [open])

  const closeDialog = () => {
    setQuery('')
    setError('')
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setQuery('')
      setError('')
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return items
    return items.filter((item) => `${displayName(item.key)} ${displayFolder(item.key)}`.toLowerCase().includes(normalizedQuery))
  }, [items, query])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="video-library-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close video library" onClick={closeDialog} />
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div><h2 id="video-library-title" className="text-xl font-bold text-foreground">Choose a video</h2><p className="mt-1 text-sm text-muted-foreground">Search the central video library by filename or folder. Selecting affects only this media slot.</p></div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={refreshing} onClick={() => void loadLibrary(true)} className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />Refresh</button>
            <button type="button" onClick={closeDialog} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground hover:bg-secondary" aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <div className="border-b border-border px-6 py-4"><div className="relative"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search videos by filename or folder" className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring" /></div></div>
        <div className="min-h-[320px] flex-1 overflow-y-auto p-6">
          {loading ? <div className="flex min-h-[300px] items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 size={20} className="animate-spin" />Loading the video library...</div>
          : error ? <div className="flex min-h-[300px] flex-col items-center justify-center text-center"><p className="text-sm font-medium text-destructive">{error}</p><button type="button" onClick={() => void loadLibrary(false)} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Try again</button></div>
          : filteredItems.length === 0 ? <div className="flex min-h-[300px] flex-col items-center justify-center text-center text-muted-foreground"><Film size={28} /><p className="mt-3 text-sm">No matching videos found.</p></div>
          : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{filteredItems.map((item) => (
              <button key={item.url} type="button" disabled={!canSelectLibraryVideo(item)} onClick={() => { void selectLibraryVideo(item).then(onSelect).catch(e => setError(e instanceof Error ? e.message : 'Unable to select video.')) }} className="group overflow-hidden rounded-xl border border-border bg-white text-left transition hover:border-[#86B8E8] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60">
                <div className="relative aspect-video overflow-hidden bg-[#EEF7FF]"><LazyVideoThumbnail video={item} /><span className="absolute bottom-2 left-2 rounded bg-[#0A1628]/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Video</span><span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[#3779B5] opacity-0 shadow transition-opacity group-hover:opacity-100"><Check size={16} /></span></div>
                <div className="p-3"><p className="truncate text-sm font-semibold text-foreground" title={displayName(item.key)}>{displayName(item.key)}</p><p className="mt-1 truncate text-[11px] text-muted-foreground" title={displayFolder(item.key)}>{displayFolder(item.key)}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(item.size)}{item.lastModified ? ` · ${new Date(item.lastModified).toLocaleDateString()}` : ''}</p>{item.verification === 'unknown' ? <p className="mt-2 text-xs text-muted-foreground">Discovered video. Approval is required before selecting it. Existing saved videos are retained.</p> : null}</div>
              </button>
            ))}</div>}
        </div>
      </div>
    </div>
  )
}
