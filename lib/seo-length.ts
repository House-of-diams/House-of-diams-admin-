/** Counting and guidance for search-result text, so editors see what search engines will actually show. */
export type SeoLengthKind = 'title' | 'description'

const LIMITS = {
  title: { min: 30, max: 60 },
  description: { min: 70, max: 160 },
} as const

/** Counts what a search engine counts: leading/trailing spaces are dropped and runs of whitespace collapse to one space. */
export function measureSeoText(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  return { text, characters: text.length, words: text ? text.split(' ').length : 0 }
}

export function seoLengthStatus(value: string, kind: SeoLengthKind) {
  const { characters, words } = measureSeoText(value)
  const { min, max } = LIMITS[kind]
  if (characters === 0) return { characters, words, max, tone: 'empty' as const, message: 'Empty: the website default is used.' }
  if (characters > max) return { characters, words, max, tone: 'long' as const, message: `${characters - max} over: search results will cut the end off.` }
  if (characters < min) return { characters, words, max, tone: 'short' as const, message: `Short: aim for ${min}-${max} characters.` }
  return { characters, words, max, tone: 'good' as const, message: 'Good length.' }
}
