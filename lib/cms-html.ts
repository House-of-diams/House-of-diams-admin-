import sanitizeHtml from 'sanitize-html'
/** Rich text allowed by the existing article/docs editors; executable markup never reaches a save. */
export function sanitizeCmsHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'h3', 'h4', 's', 'u'],
    allowedAttributes: { a: ['href','title','target','rel'], img: ['src','alt','title','width','height'], '*': ['class'] },
    allowedSchemes: ['http','https','mailto','tel'],
    allowProtocolRelative: false,
  })
}
