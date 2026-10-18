import sanitizeHtml from 'sanitize-html'

const LOVE_LETTER_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
] as const

export function sanitizeLoveLetterHtml(value: string | null | undefined) {
  return sanitizeHtml(value ?? '', {
    allowedTags: [...LOVE_LETTER_ALLOWED_TAGS],
    allowedAttributes: {},
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
  })
}
