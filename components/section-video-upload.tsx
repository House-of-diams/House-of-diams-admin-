'use client'

import { useRef, useState } from 'react'
import { Film, Loader2 } from 'lucide-react'
import { tryUploadAwsVideo } from '@/lib/video-transport'
import { SECTION_VIDEO_MAX_BYTES, sectionVideoProblem } from '@/lib/video-limits'

type Props = {
  label?: string
  onUploaded: (url: string) => void
  onStatus?: (message: string) => void
  disabled?: boolean
  className?: string
}

// Uploads a short looping banner video through the same protected, create-only path as product videos.
export function SectionVideoUpload({ label = 'Upload video', onUploaded, onStatus, disabled = false, className = '' }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handle(file: File) {
    setError('')
    const problem = sectionVideoProblem(file)
    if (problem) { setError(problem); onStatus?.(problem); return }
    setBusy(true)
    onStatus?.('Uploading video…')
    try {
      const url = await tryUploadAwsVideo(file, '/api/cms/uploads/section-video', { kind: 'video' })
      if (!url) throw new Error('Video uploads are not available in this mode.')
      onUploaded(url)
      onStatus?.('Video uploaded. Save changes to publish it.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to upload this video.'
      setError(message)
      onStatus?.(message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <span className={className}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Film size={16} aria-hidden="true" />}
        {busy ? 'Uploading video…' : label}
      </button>
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void handle(file) }}
      />
      {error ? <span role="alert" className="mt-2 block text-xs text-destructive">{error}</span> : <span className="mt-1 block text-xs text-muted-foreground">Short MP4, up to {Math.floor(SECTION_VIDEO_MAX_BYTES / 1024 / 1024)} MB. Plays silently on a loop.</span>}
    </span>
  )
}
