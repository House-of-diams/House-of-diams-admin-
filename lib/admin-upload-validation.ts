export function validateSafeSvg(buffer: Buffer) {
  const text = buffer.toString('utf8').trim()
  if (!text || buffer.includes(0) || !/^<\?xml[\s\S]*?\?>\s*<svg\b|^<svg\b/i.test(text)) return false
  const unsafe = /<!doctype|<!entity|<script\b|<foreignObject\b|<iframe\b|<object\b|<embed\b|<audio\b|<video\b|<style\b|\son[a-z]+\s*=|javascript:|data:text\/html|(?:href|xlink:href)\s*=\s*["'](?!#)|url\(\s*["']?(?!#)/i
  return !unsafe.test(text)
}
