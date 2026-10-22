'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, Trash2, Upload } from 'lucide-react'
import { extractHoverFrames, HOVER_FRAME_COUNT, nextHoverVersion, uploadHoverFrames } from '@/lib/hover-frames'

// HOD-090: the 24-frame "hover to rotate" view. The administrator picks a video; the browser cuts it into 24 frames,
// uploads them, and the new set goes live only when the product is saved. The current set stays until then.
export type HoverView = { version: number; frame_paths: string[] }

type Props = {
  saved: HoverView | null
  /** undefined = unchanged, null = removed, object = a new uploaded set waiting for Save. */
  pending: HoverView | null | undefined
  onChange: (next: HoverView | null | undefined) => void
  uploadFrame: (blob: Blob, index: number, version: number) => Promise<string>
  previewUrl: (path: string) => string
  /** Frames can only be uploaded once the product exists. */
  productReady: boolean
  disabled?: boolean
}

type Phase = { name: 'idle' } | { name: 'extracting' | 'uploading'; done: number } | { name: 'ready'; blobs: Blob[]; urls: string[] }

export function ProductHoverView({ saved, pending, onChange, uploadFrame, previewUrl, productReady, disabled = false }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [error, setError] = useState('')
  const [scrub, setScrub] = useState(Math.floor(HOVER_FRAME_COUNT / 2))
  const urlsRef = useRef<string[]>([])

  useEffect(() => () => { abort.current?.abort(); urlsRef.current.forEach(url => URL.revokeObjectURL(url)) }, [])

  const current = pending === undefined ? saved : pending
  const busy = phase.name === 'extracting' || phase.name === 'uploading'

  function resetPreview() {
    urlsRef.current.forEach(url => URL.revokeObjectURL(url))
    urlsRef.current = []
    setPhase({ name: 'idle' })
  }

  async function handleFile(file: File) {
    setError('')
    resetPreview()
    const controller = new AbortController()
    abort.current = controller
    setPhase({ name: 'extracting', done: 0 })
    try {
      const blobs = await extractHoverFrames(file, { signal: controller.signal, onProgress: done => setPhase({ name: 'extracting', done }) })
      const urls = blobs.map(blob => URL.createObjectURL(blob))
      urlsRef.current = urls
      setScrub(Math.floor(HOVER_FRAME_COUNT / 2))
      setPhase({ name: 'ready', blobs, urls })
    } catch (cause) {
      setPhase({ name: 'idle' })
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to create the frames.')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function startUpload(blobs: Blob[]) {
    setError('')
    const controller = new AbortController()
    abort.current = controller
    // One above the highest version seen so far, so a new upload never reuses a folder that is live or pending.
    const version = nextHoverVersion({ version: Math.max(saved?.version ?? 0, pending?.version ?? 0) })
    setPhase({ name: 'uploading', done: 0 })
    try {
      const paths = await uploadHoverFrames(blobs, version, uploadFrame, done => setPhase({ name: 'uploading', done }), controller.signal)
      onChange({ version, frame_paths: paths })
      resetPreview()
    } catch (cause) {
      setPhase({ name: 'ready', blobs, urls: urlsRef.current })
      if (!controller.signal.aborted) setError(cause instanceof Error ? `${cause.message} Your current hover view was not changed.` : 'Unable to upload the frames. Your current hover view was not changed.')
    }
  }

  const shown = phase.name === 'ready' ? phase.urls : current ? current.frame_paths.map(previewUrl) : []

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-6" data-testid="product-hover-view">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Hover rotation view (24 frames)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick one video of the piece. It is cut into {HOVER_FRAME_COUNT} frames in your browser, and shoppers rotate the piece by moving the mouse or dragging a finger across the product photo. One view per product, shared by every metal option.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || busy || !productReady}
            className="inline-flex items-center gap-2 rounded bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {current ? 'Choose a new video' : 'Choose video'}
          </button>
          {current && !busy ? (
            <button
              type="button"
              onClick={() => { resetPreview(); onChange(saved ? null : undefined) }}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </button>
          ) : null}
          {pending !== undefined && !busy ? (
            <button
              type="button"
              onClick={() => { resetPreview(); onChange(undefined) }}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Undo change
            </button>
          ) : null}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose the video for the hover view"
          onChange={event => { const file = event.target.files?.[0]; if (file) void handleFile(file) }}
        />
      </div>

      {!productReady ? <p className="mb-3 text-xs text-muted-foreground">Save the product first, then come back to add the hover view.</p> : null}
      {error ? <p role="alert" className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}

      {busy ? (
        <div className="mb-3" role="status" aria-live="polite">
          <p className="mb-1 text-xs text-foreground">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden="true" />
            {phase.name === 'extracting' ? `Creating frame ${Math.min(phase.done + 1, HOVER_FRAME_COUNT)} of ${HOVER_FRAME_COUNT}…` : `Uploading frame ${Math.min(phase.done + 1, HOVER_FRAME_COUNT)} of ${HOVER_FRAME_COUNT}…`}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded bg-secondary">
            <div className="h-full bg-foreground transition-all" style={{ width: `${(phase.done / HOVER_FRAME_COUNT) * 100}%` }} />
          </div>
          <button type="button" onClick={() => abort.current?.abort()} className="mt-2 text-xs text-muted-foreground underline">Cancel</button>
        </div>
      ) : null}

      {shown.length === HOVER_FRAME_COUNT && !busy ? (
        <div>
          <div className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-lg border border-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown[scrub]} alt={`Hover view frame ${scrub + 1} of ${HOVER_FRAME_COUNT}`} className="h-full w-full object-contain" />
          </div>
          <label className="mx-auto mt-3 block max-w-xs text-xs text-muted-foreground">
            Preview the rotation
            <input type="range" min={0} max={HOVER_FRAME_COUNT - 1} value={scrub} onChange={event => setScrub(Number(event.target.value))} className="mt-1 w-full" />
          </label>
          {phase.name === 'ready' ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void startUpload(phase.blobs)}
                className="rounded bg-foreground px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-foreground/90"
              >
                Use these 24 frames
              </button>
              <button type="button" onClick={resetPreview} className="text-sm text-muted-foreground underline">Discard</button>
            </div>
          ) : pending ? (
            <p className="mt-3 text-xs text-foreground">New hover view uploaded. It goes live when you save the product.</p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">This is the hover view shoppers see now.</p>
          )}
        </div>
      ) : null}

      {pending === null && !busy ? <p className="mt-3 text-xs text-foreground">The hover view will be removed when you save the product.</p> : null}
      {!current && pending === undefined && !busy && phase.name === 'idle' ? <p className="text-xs text-muted-foreground">No hover view yet.</p> : null}
    </div>
  )
}
