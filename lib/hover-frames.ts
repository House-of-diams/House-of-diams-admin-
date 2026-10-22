// HOD-090: cuts a product video into 24 still frames in the administrator's browser (video + canvas, no libraries),
// so the server only ever receives 24 small images. Pure helpers are exported separately so they can be tested offline.
export const HOVER_FRAME_COUNT = 24
export const HOVER_MAX_VIDEO_BYTES = 100 * 1024 * 1024
export const HOVER_MAX_VIDEO_SECONDS = 60
export const HOVER_FRAME_MAX_SIZE = 1000
export const HOVER_FRAME_QUALITY = 0.82
const SEEK_TIMEOUT_MS = 10_000
const UPLOAD_ATTEMPTS = 3
const UPLOAD_CONCURRENCY = 3

export function validateHoverVideoFile(file: { size: number; type: string }): string | null {
  if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) return 'Choose an MP4, MOV or WebM video.'
  if (file.size < 1) return 'This video file is empty.'
  if (file.size > HOVER_MAX_VIDEO_BYTES) return `Choose a video of ${Math.floor(HOVER_MAX_VIDEO_BYTES / 1024 / 1024)} MB or smaller.`
  return null
}

/** Evenly spaced moments across the whole video, first frame at the start and last just before the end. */
export function frameTimes(duration: number, count = HOVER_FRAME_COUNT): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count < 1) return []
  if (count === 1) return [0]
  const last = Math.max(0, duration - Math.min(0.05, duration / 100))
  return Array.from({ length: count }, (_, index) => Math.round((index / (count - 1)) * last * 1000) / 1000)
}

export function fitWithin(width: number, height: number, max = HOVER_FRAME_MAX_SIZE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export function nextHoverVersion(saved: { version: number } | null | undefined) {
  return (saved?.version ?? 0) + 1
}

export class HoverExtractionError extends Error {}

type ExtractOptions = { onProgress?: (done: number, total: number) => void; signal?: AbortSignal }

function waitForEvent(target: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => cleanup(() => reject(new HoverExtractionError('The video could not be read. Try another file.'))), SEEK_TIMEOUT_MS)
    const onDone = () => cleanup(resolve)
    const onError = () => cleanup(() => reject(new HoverExtractionError('This video could not be read. Try an MP4 (H.264) file.')))
    const onAbort = () => cleanup(() => reject(new HoverExtractionError('Cancelled.')))
    function cleanup(next: () => void) {
      clearTimeout(timer)
      target.removeEventListener(event, onDone)
      target.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      next()
    }
    target.addEventListener(event, onDone, { once: true })
    target.addEventListener('error', onError, { once: true })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    // Browsers that cannot encode WebP return a PNG; the server accepts both and stores WebP.
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new HoverExtractionError('A frame could not be created.'))), 'image/webp', HOVER_FRAME_QUALITY)
  })
}

export async function extractHoverFrames(file: File, { onProgress, signal }: ExtractOptions = {}): Promise<Blob[]> {
  const invalid = validateHoverVideoFile(file)
  if (invalid) throw new HoverExtractionError(invalid)
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  try {
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = url
    await waitForEvent(video, 'loadeddata', signal)
    const duration = video.duration
    if (!Number.isFinite(duration) || duration <= 0) throw new HoverExtractionError('This video has no readable length.')
    if (duration > HOVER_MAX_VIDEO_SECONDS) throw new HoverExtractionError(`Choose a video of ${HOVER_MAX_VIDEO_SECONDS} seconds or less.`)
    const { width, height } = fitWithin(video.videoWidth, video.videoHeight)
    if (!width || !height) throw new HoverExtractionError('This video has no picture.')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new HoverExtractionError('This browser cannot create frames.')
    const frames: Blob[] = []
    for (const time of frameTimes(duration)) {
      const seeked = waitForEvent(video, 'seeked', signal)
      video.currentTime = time
      await seeked
      context.drawImage(video, 0, 0, width, height)
      frames.push(await canvasToBlob(canvas))
      onProgress?.(frames.length, HOVER_FRAME_COUNT)
    }
    return frames
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

type UploadFrame = (blob: Blob, index: number, version: number) => Promise<string>

/** Uploads the frames a few at a time, retrying each one, and returns their addresses in order. Stops at the first frame that keeps failing. */
export async function uploadHoverFrames(frames: Blob[], version: number, uploadFrame: UploadFrame, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<string[]> {
  if (frames.length !== HOVER_FRAME_COUNT) throw new Error(`The hover view needs exactly ${HOVER_FRAME_COUNT} frames.`)
  const paths: string[] = new Array(frames.length)
  let next = 0
  let done = 0
  let failure: unknown = null
  async function worker() {
    while (!failure && !signal?.aborted) {
      const index = next++
      if (index >= frames.length) return
      let lastError: unknown = null
      for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
        try { paths[index] = await uploadFrame(frames[index], index, version); lastError = null; break }
        catch (error) { lastError = error }
      }
      if (lastError) { failure = lastError; return }
      onProgress?.(++done, frames.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, frames.length) }, worker))
  if (signal?.aborted) throw new Error('Cancelled.')
  if (failure) throw failure instanceof Error ? failure : new Error('A frame could not be uploaded.')
  return paths
}
