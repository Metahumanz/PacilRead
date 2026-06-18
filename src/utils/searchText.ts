export function normalizeSearchText(value: unknown): string {
  return String(value || '').toLocaleLowerCase()
}

export function findAllSearchMatches(text: string, query: string): number[] {
  const normalizedText = normalizeSearchText(text)
  const normalizedQuery = normalizeSearchText(query.trim())
  if (!normalizedQuery) return []
  const result: number[] = []
  let from = 0
  while (from <= normalizedText.length - normalizedQuery.length) {
    const match = normalizedText.indexOf(normalizedQuery, from)
    if (match < 0) break
    result.push(match)
    from = match + 1
  }
  return result
}
