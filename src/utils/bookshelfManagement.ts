import { normalizeTags, type ReadingStatus } from './bookMetadata'

export interface BookshelfFilterBook {
  title?: string | null
  author?: string | null
  tags?: string[] | null
  series?: string | null
  readingStatus?: ReadingStatus | string | null
}

export interface BookshelfFilters {
  query?: string
  tag?: string
  series?: string
  status?: string
}

export type DuplicateMatchType = 'exact_content' | 'same_title_author'

export interface DuplicateCandidate {
  key: string
  title?: string | null
  author?: string | null
  contentSha256?: string | null
}

const normalizeSearch = (value: unknown) => String(value || '').trim().toLocaleLowerCase()

export function matchesBookshelfFilters(book: BookshelfFilterBook, filters: BookshelfFilters): boolean {
  const query = normalizeSearch(filters.query)
  const queryMatches = !query
    || normalizeSearch(book.title).includes(query)
    || normalizeSearch(book.author).includes(query)
  const tagMatches = !filters.tag || Boolean(book.tags?.includes(filters.tag))
  const seriesMatches = !filters.series || String(book.series || '') === filters.series
  const statusMatches = !filters.status || String(book.readingStatus || '') === filters.status
  return queryMatches && tagMatches && seriesMatches && statusMatches
}

export function addBookTags(current: unknown, additions: unknown): string[] {
  return normalizeTags([...normalizeTags(current), ...normalizeTags(additions)])
}

export function removeBookTags(current: unknown, removals: unknown): string[] {
  const blocked = new Set(normalizeTags(removals))
  return normalizeTags(current).filter(tag => !blocked.has(tag))
}

export function duplicateIdentity(title: unknown, author: unknown): string {
  const normalize = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
  const safeTitle = normalize(title)
  const safeAuthor = normalize(author)
  return safeTitle || safeAuthor ? `${safeTitle}\u0000${safeAuthor}` : ''
}

export function detectDuplicates(
  existing: DuplicateCandidate[],
  incoming: DuplicateCandidate[],
): Map<string, DuplicateMatchType> {
  const result = new Map<string, DuplicateMatchType>()
  const seen = [...existing]
  for (const candidate of incoming) {
    const hash = String(candidate.contentSha256 || '').trim().toLocaleLowerCase()
    const exact = hash && seen.some(item => String(item.contentSha256 || '').trim().toLocaleLowerCase() === hash)
    if (exact) {
      result.set(candidate.key, 'exact_content')
    } else {
      const identity = duplicateIdentity(candidate.title, candidate.author)
      if (identity && seen.some(item => duplicateIdentity(item.title, item.author) === identity)) {
        result.set(candidate.key, 'same_title_author')
      }
    }
    seen.push(candidate)
  }
  return result
}

export function sanitizeExportFileName(value: unknown): string {
  return String(value || '').trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
}

export function uniqueExportFileName(preferredName: string, extension: string, usedNames: Set<string>): string {
  const safeExtension = extension.startsWith('.') ? extension.toLocaleLowerCase() : `.${extension.toLocaleLowerCase()}`
  let preferred = sanitizeExportFileName(preferredName)
  if (!preferred) preferred = `未命名书籍${safeExtension}`
  if (!preferred.toLocaleLowerCase().endsWith(safeExtension)) preferred += safeExtension
  const dot = preferred.lastIndexOf('.')
  const base = dot > 0 ? preferred.slice(0, dot) : preferred
  const suffix = dot > 0 ? preferred.slice(dot) : ''
  const contains = (name: string) => Array.from(usedNames).some(item => item.toLocaleLowerCase() === name.toLocaleLowerCase())
  let candidate = preferred
  let index = 2
  while (contains(candidate)) candidate = `${base} (${index++})${suffix}`
  usedNames.add(candidate)
  return candidate
}
