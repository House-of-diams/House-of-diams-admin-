// HOD-091: banners can be an image or a short looping video. The kind is read from the file address (same rule as the storefront).
const VIDEO_FILE_PATTERN = /\.(?:mp4|webm|ogg|ogv|mov|m4v)$/i

export function isVideoAddress(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    return VIDEO_FILE_PATTERN.test(decodeURIComponent(new URL(value, 'https://example.invalid').pathname))
  } catch {
    return false
  }
}
