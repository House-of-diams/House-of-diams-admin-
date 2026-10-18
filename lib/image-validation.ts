/** Conservative XML subset: quoted attributes, no declarations/entities, active elements or external references. */
export function validateAwsSvg(buffer: Buffer) {
  let text = buffer.toString('utf8').trim()
  if (buffer.includes(0) || text.includes('\ufffd')) return false
  text = text.replace(/^<\?xml\s+[^?]*\?>\s*/i, '').replace(/<!--[\s\S]*?-->/g, '')
  if (/<!|<\?|&(?:#|[a-z]+;)/i.test(text)) return false
  const tags = new Set(['svg','g','defs','path','rect','circle','ellipse','line','polyline','polygon','title','desc','text','tspan','use','symbol','clipPath','mask','linearGradient','radialGradient','stop','pattern'])
  const stack: string[] = []
  let root = false, end = 0
  for (const match of text.matchAll(/<([^<>]+)>/g)) {
    if (text.slice(end, match.index).includes('<')) return false
    const token = match[1], closing = token.startsWith('/'), self = token.endsWith('/')
    const parsed = /^(\/)?([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/)?$/.exec(token)
    if (!parsed || !tags.has(parsed[2])) return false
    const name = parsed[2], attrs = parsed[3]
    if (closing) {
      if (attrs.trim() || self || stack.pop() !== name) return false
    } else {
      if (!root) { if (name !== 'svg') return false; root = true }
      else if (!stack.length) return false
      let offset = 0
      const seen = new Set<string>()
      for (const attr of attrs.matchAll(/\s+([A-Za-z_:][A-Za-z0-9_:.-]*)\s*=\s*(["'])([\s\S]*?)\2/g)) {
        if (attrs.slice(offset, attr.index).trim()) return false
        const key = attr[1], value = attr[3]
        if (seen.has(key) || /^on/i.test(key) || key === 'style' || /[<>&\\]|javascript:|data:|https?:|\/\/|@/i.test(value)) {
          if (!(key === 'xmlns' && value === 'http://www.w3.org/2000/svg') && !(key === 'xmlns:xlink' && value === 'http://www.w3.org/1999/xlink')) return false
        }
        if ((key.includes(':') && !['xmlns:xlink','xlink:href','xml:space'].includes(key)) || (key === 'href' || key === 'xlink:href') && !/^#[A-Za-z0-9_-]+$/.test(value)) return false
        if (/url\(/i.test(value) && !/^url\(#[A-Za-z0-9_-]+\)$/.test(value)) return false
        seen.add(key); offset = attr.index + attr[0].length
      }
      if (attrs.slice(offset).trim()) return false
      if (!self) stack.push(name)
    }
    end = match.index + match[0].length
  }
  return root && stack.length === 0 && !text.slice(end).trim()
}

export class ImageBodyTooLarge extends Error {}
export async function boundedImageForm(request: Request, maxBytes: number): Promise<FormData | null> {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > maxBytes) { await reader.cancel(); throw new ImageBodyTooLarge() }
      chunks.push(chunk.value)
    }
    return await new Response(Buffer.concat(chunks), { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
  } catch (error) { if (error instanceof ImageBodyTooLarge) throw error; return null }
  finally { reader.releaseLock() }
}
