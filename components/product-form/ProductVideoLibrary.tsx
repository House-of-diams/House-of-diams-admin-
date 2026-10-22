'use client'

import { useRef, useState } from 'react'
import { Film, Loader2, Plus, Trash2 } from 'lucide-react'

// HOD-090: the product's video library. Each video is uploaded once and given a label (for example "Yellow gold");
// every metal option then picks one from this list instead of uploading its own copy.
export const MAX_LIBRARY_VIDEOS = 12

export type LibraryVideo = { id: string; label: string; media_path: string }

const inputClassName =
  'w-full rounded border border-border bg-white px-3 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring'

type Props = {
  videos: LibraryVideo[]
  onChange: (next: LibraryVideo[]) => void
  /** Metal options (by label) that currently use each library video, so a video in use is clearly marked. */
  usedBy: Record<string, string[]>
  uploadVideo: (file: File) => Promise<string>
  previewUrl: (path: string) => string
  disabled?: boolean
}

const newId = () => crypto.randomUUID()

export function ProductVideoLibrary({ videos, onChange, usedBy, uploadVideo, previewUrl, disabled = false }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const atLimit = videos.length >= MAX_LIBRARY_VIDEOS
  const labelCounts = new Map<string, number>()
  for (const video of videos) {
    const key = video.label.trim().toLowerCase()
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1)
  }

  async function handleFile(file: File) {
    setError('')
    setUploading(true)
    try {
      const path = await uploadVideo(file)
      const base = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Video'
      const taken = new Set(videos.map(video => video.label.trim().toLowerCase()))
      let label = base
      for (let n = 2; taken.has(label.toLowerCase()); n++) label = `${base} ${n}`
      onChange([...videos, { id: newId(), label, media_path: path }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload this video.')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="mt-6" data-testid="product-video-library">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Product Videos</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload each video once and give it a label, such as &ldquo;Yellow gold&rdquo;. Each metal option below then picks one of these videos, so the same video is never uploaded twice.
          </p>
        </div>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={disabled || uploading || atLimit}
          className="inline-flex items-center gap-2 rounded bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {uploading ? 'Uploading…' : 'Upload video'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload a product video"
          onChange={event => { const file = event.target.files?.[0]; if (file) void handleFile(file) }}
        />
      </div>

      {error ? <p role="alert" className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}
      {atLimit ? <p className="mb-3 text-xs text-muted-foreground">A product can have up to {MAX_LIBRARY_VIDEOS} library videos.</p> : null}

      {videos.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <Film className="h-5 w-5 shrink-0" aria-hidden="true" />
          No videos yet. Upload one video per metal (for example gold, white gold, rose gold, platinum).
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {videos.map(video => {
            const users = usedBy[video.id] ?? []
            const duplicate = (labelCounts.get(video.label.trim().toLowerCase()) ?? 0) > 1
            const labelId = `library-video-label-${video.id}`
            return (
              <li key={video.id} className="flex gap-3 rounded-lg border border-border bg-white p-3">
                <video
                  src={`${previewUrl(video.media_path)}#t=0.01`}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-20 w-20 shrink-0 rounded bg-black object-cover"
                  aria-label={`${video.label || 'Library video'} preview`}
                />
                <div className="min-w-0 flex-1">
                  <label htmlFor={labelId} className="sr-only">Video label</label>
                  <input
                    id={labelId}
                    value={video.label}
                    maxLength={80}
                    disabled={disabled}
                    aria-invalid={duplicate || !video.label.trim()}
                    onChange={event => onChange(videos.map(entry => (entry.id === video.id ? { ...entry, label: event.target.value } : entry)))}
                    className={inputClassName}
                    placeholder="Label, e.g. Yellow gold"
                  />
                  {duplicate ? <p className="mt-1 text-xs text-destructive">Each video needs a different label.</p> : null}
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {users.length ? `Used by: ${users.join(', ')}` : 'Not used by any metal option yet'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={disabled || users.length > 0}
                  onClick={() => onChange(videos.filter(entry => entry.id !== video.id))}
                  className="self-start rounded p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={users.length ? `${video.label} is in use and cannot be removed` : `Remove ${video.label || 'video'}`}
                  title={users.length ? 'Choose a different video for these metal options first' : 'Remove video'}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** The labels the form must fix before saving, or null when the library is valid. */
export function videoLibraryError(videos: LibraryVideo[]): string | null {
  const seen = new Set<string>()
  for (const video of videos) {
    const label = video.label.trim()
    if (!label) return 'Give every library video a label.'
    if (label.length > 80) return 'A library video label must be 80 characters or fewer.'
    if (seen.has(label.toLowerCase())) return 'Each library video needs a different label.'
    seen.add(label.toLowerCase())
  }
  return videos.length > MAX_LIBRARY_VIDEOS ? `A product can have at most ${MAX_LIBRARY_VIDEOS} library videos.` : null
}
