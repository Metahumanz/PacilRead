export interface QuoteContextExcerpt {
  before: string
  after: string
}

export function quoteTextFromPageLines(
  lines: Array<{ kind?: string; text?: string | null }> | null | undefined,
  fallback = '',
): string {
  const body = (lines || [])
    .filter(line => line.kind === 'body')
    .map(line => String(line.text || ''))
    .join('')
    .trim()
  return body || String(fallback || '').trim()
}

const CONTEXT_LIMIT = 40

const normalizeContext = (value: string) => value.trim()
  .replace(/[\t\v\f\r ]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')

export function quoteContextExcerpt(
  chapterText: string,
  selectionStart: number,
  selectionEnd: number,
): QuoteContextExcerpt {
  const source = String(chapterText || '')
  const safeStart = Math.max(0, Math.min(selectionStart, source.length))
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, source.length))
  return {
    before: normalizeContext(source.slice(Math.max(0, safeStart - CONTEXT_LIMIT), safeStart)),
    after: normalizeContext(source.slice(safeEnd, Math.min(source.length, safeEnd + CONTEXT_LIMIT))),
  }
}
