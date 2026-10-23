// Safe to import in browser code: no server-only dependencies.
/** Banner videos (home sections, product page banner) are short silent loops; keeping them small keeps uploads light on the server. */
export const SECTION_VIDEO_MAX_BYTES = 40 * 1024 * 1024
export const SECTION_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm']

/** A message when the file cannot be used as a banner video, otherwise null. Checked in the browser first so a too-big file is never sent. */
export function sectionVideoProblem(file: { size: number; type: string }): string | null {
  if (!SECTION_VIDEO_TYPES.includes(file.type)) return 'Choose an MP4, MOV or WebM video.'
  if (file.size < 1) return 'This video file is empty.'
  if (file.size > SECTION_VIDEO_MAX_BYTES) return `This video is ${(file.size / 1024 / 1024).toFixed(1)} MB. Banner videos must be ${Math.floor(SECTION_VIDEO_MAX_BYTES / 1024 / 1024)} MB or smaller. Export a shorter or lower-quality MP4 (H.264) and try again.`
  return null
}
