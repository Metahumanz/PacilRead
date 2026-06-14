export type ReadingStatus = 'unread' | 'reading' | 'finished'

export interface BookMetadataShape {
  progressIndex?: unknown
  progressOffset?: unknown
  lastReadAt?: unknown
  tags?: unknown
  series?: unknown
  seriesIndex?: unknown
  readingStatus?: unknown
}

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return value === 'unread' || value === 'reading' || value === 'finished'
}

export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[，,]/)
      : []

  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    const tag = String(item || '').trim()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
  }
  return result
}

export function normalizeSeriesIndex(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  return num
}

export function inferReadingStatus(book: BookMetadataShape): ReadingStatus {
  if (isReadingStatus(book.readingStatus)) return book.readingStatus

  const progressIndex = Number(book.progressIndex || 0)
  const progressOffset = Number(book.progressOffset || 0)
  const lastReadAt = Number(book.lastReadAt || 0)
  return progressIndex > 0 || progressOffset > 0 || lastReadAt > 0
    ? 'reading'
    : 'unread'
}

export function normalizeBookMetadata<T extends BookMetadataShape>(book: T): T & {
  tags: string[]
  series: string
  seriesIndex?: number
  readingStatus: ReadingStatus
} {
  const seriesIndex = normalizeSeriesIndex(book.seriesIndex)
  const normalized = {
    ...book,
    tags: normalizeTags(book.tags),
    series: String(book.series || '').trim(),
    readingStatus: inferReadingStatus(book),
  } as T & {
    tags: string[]
    series: string
    seriesIndex?: number
    readingStatus: ReadingStatus
  }

  if (seriesIndex === undefined) {
    delete normalized.seriesIndex
  } else {
    normalized.seriesIndex = seriesIndex
  }

  return normalized
}

export function normalizeBookPatch(fields: Record<string, unknown>): Record<string, unknown> {
  const next = { ...fields }
  if ('tags' in next) next.tags = normalizeTags(next.tags)
  if ('series' in next) next.series = String(next.series || '').trim()
  if ('seriesIndex' in next) {
    const seriesIndex = normalizeSeriesIndex(next.seriesIndex)
    if (seriesIndex === undefined) delete next.seriesIndex
    else next.seriesIndex = seriesIndex
  }
  if ('readingStatus' in next && !isReadingStatus(next.readingStatus)) {
    delete next.readingStatus
  }
  return next
}

export function shouldAutoMarkReading(status: unknown): boolean {
  return !isReadingStatus(status) || status === 'unread'
}

export function shouldAutoMarkFinished(args: {
  status: unknown
  chapterCount: number
  progressIndex: number
  progressOffset: number
  totalPages: number
}): boolean {
  if (args.status === 'finished') return false
  if (args.chapterCount <= 0) return false
  const lastChapterIndex = Math.max(0, args.chapterCount - 1)
  const lastPageIndex = Math.max(0, args.totalPages - 1)
  return args.progressIndex >= lastChapterIndex && args.progressOffset >= lastPageIndex
}
