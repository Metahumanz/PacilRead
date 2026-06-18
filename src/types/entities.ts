import type { Book, Chapter, Rule } from '../composables/useDataStore'
import type { ReadingStatus } from '../utils/bookMetadata'

export type LibraryBook = Book
export type LibraryChapter = Chapter
export type ReplacementRule = Rule

export type BatchClassificationOperation =
  | { type: 'addTags' | 'removeTags'; tags: string[] }
  | { type: 'setSeries'; series: string }
  | { type: 'setReadingStatus'; status: ReadingStatus }

export interface BookSearchResult {
  chapterIndex: number
  chapterTitle: string
  snippet: string
  charOffset: number
}

export interface ReaderBook {
  id: number
  title: string
  author: string | null
  bookType: string
  tags: string[]
  series: string
  seriesIndex?: number
  readingStatus: ReadingStatus
  progressIndex: number
  progressOffset: number
  lastReadAt: number
  readingStatsKey: string
  chapterCount: number
}

export interface ReaderChapter {
  id: number
  title: string
  body?: string
  body_text?: string
  order_index: number
  body_text_storage?: string
  body_text_missing?: number
  body_text_fallback?: string | null
  body_text_size?: number
  body_text_loaded?: boolean
}

export interface ChapterContentPayload {
  id: number
  title: string
  order_index: number
  body: string
  body_text: string
  body_text_storage: string
  body_text_missing: number
  body_text_fallback: string | null
  body_text_size?: number
}

export interface ReplacementRuleView {
  id: number
  pattern: string
  replacement: string
  scope: 'global' | 'book'
  bookId: number | null
  regex: boolean
  active: boolean
}

export function toReplacementRuleView(rule: Rule): ReplacementRuleView {
  return {
    id: rule.id,
    pattern: rule.pattern,
    replacement: rule.replacement,
    scope: rule.scope,
    bookId: rule.bookId,
    regex: rule.regex,
    active: rule.active,
  }
}

export function replacementRuleViewToPatch(rule: ReplacementRuleView): Pick<Rule, 'active'> {
  return { active: !rule.active }
}
