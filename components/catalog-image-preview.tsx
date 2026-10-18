'use client'

import { useState } from 'react'
import { resolveImageReference } from '@/lib/image-reference'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const collectionBucket = process.env.NEXT_PUBLIC_SUPABASE_COLLECTION_BUCKET || 'hod'

export function resolveCatalogImageUrl(path?: string | null) {
  return resolveImageReference(path, supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${collectionBucket}` : undefined)
}

function isSvgImage(path: string) {
  return /\.svg(?:$|[?#])/i.test(path) || /^data:image\/svg\+xml/i.test(path)
}

export function CatalogImagePreview({
  path,
  alt,
  size = 'table',
  className = '',
}: {
  path?: string | null
  alt: string
  size?: 'table' | 'editor' | 'banner'
  className?: string
}) {
  const src = resolveCatalogImageUrl(path)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = Boolean(src && failedSrc === src)

  const dimensions = size === 'table'
    ? 'h-14 w-14'
    : size === 'banner'
      ? 'h-36 w-full'
      : 'h-28 w-28'

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt || 'No image'}
        className={`${dimensions} flex shrink-0 items-center justify-center border border-border bg-secondary/40 px-2 text-center text-[11px] font-medium text-muted-foreground ${className}`}
      >
        No image
      </div>
    )
  }

  return (
    <div className={`${dimensions} shrink-0 overflow-hidden border border-border bg-secondary/30 ${className}`}>
      {/* Native img supports SVG and storage URLs without requiring Next image host configuration. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onError={() => setFailedSrc(src)}
        className={`h-full w-full ${isSvgImage(src) ? 'object-contain p-1.5' : 'object-cover'}`}
      />
    </div>
  )
}
