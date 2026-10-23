'use client'
import { productRequestHeaders } from './product-transport'

/** Uploads one hover-view frame for an existing product. The server re-encodes it and returns the stored address. */
export async function uploadHoverFrame(productId: string, blob: Blob, index: number, version: number): Promise<string> {
  const headers = await productRequestHeaders(true)
  headers.delete('content-type')
  const form = new FormData()
  const type = blob.type === 'image/png' ? 'image/png' : 'image/webp'
  form.set('file', new File([blob], `frame-${index}.${type === 'image/png' ? 'png' : 'webp'}`, { type }))
  form.set('version', String(version))
  form.set('index', String(index))
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}/hover-frames`, { method: 'POST', credentials: 'same-origin', headers, body: form })
  const payload = await response.json().catch(() => null)
  if (!response.ok || typeof payload?.path !== 'string') throw new Error(typeof payload?.error === 'string' && payload.error ? payload.error : 'Unable to upload a frame.')
  return payload.path
}
