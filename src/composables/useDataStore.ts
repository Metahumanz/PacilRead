import { ref, toRaw } from 'vue'
import { normalizeBookMetadata, type ReadingStatus } from '../utils/bookMetadata'

// ---- v8 JSON schema types ----

export interface Book {
  id: number
  title: string
  author: string | null
  bookType: string
  readingStatsKey: string
  tags: string[]
  series: string
  seriesIndex?: number
  readingStatus: ReadingStatus
  progressIndex: number
  progressOffset: number
  lastReadAt: number
  pinned: boolean
  chapterCount: number
  currentChapterTitle: string
  createdAt: number
  updatedAt: number
  coverFile: string | null
  sourceFile: string | null
  sourceDisplayName?: string
  contentSha256?: string
}

export interface Chapter {
  id: number
  bookId: number
  title: string
  orderIndex: number
  bodyTextPath: string | null
  bodyTextStorage: 'file_gzip' | 'inline'
  bodyTextSize: number
}

export interface Rule {
  id: number
  pattern: string
  replacement: string
  scope: 'global' | 'book'
  bookId: number | null
  regex: boolean
  active: boolean
  updatedAt: number
}

export interface Theme {
  id: number
  name: string
  configJson: string
  updatedAt: number
}

export interface Bookmark {
  id: number
  uuid: string
  bookId: number | null
  bookIdentity: string
  bookTitle: string
  bookAuthor: string
  chapterOrderIndex: number
  chapterTitle: string
  chapterOffset: number
  progressPercent: number
  summary: string
  createdAt: number
  updatedAt: number
}

export interface ReadingStatsRow {
  date: string
  sourceDeviceId: string
  bookIdentity: string
  bookTitle: string
  bookAuthor: string
  durationSeconds: number
  charCount: number
  updatedAt: number
}

// ---- Entity types for sync ----
export type EntityType = 'books' | 'chapters' | 'rules' | 'themes' | 'bookmarks' | 'readingStats' | 'settings'

// ---- Singleton reactive state ----

const books = ref<Book[]>([])
const chapters = ref<Chapter[]>([])
const rules = ref<Rule[]>([])
const themes = ref<Theme[]>([])
const bookmarks = ref<Bookmark[]>([])
const readingStats = ref<ReadingStatsRow[]>([])
const settingsMap = ref<Record<string, string>>({})
const dataLoaded = ref(false)

function normalizeBooksEntity(items: unknown): Book[] {
  if (!Array.isArray(items)) return []
  return items.map(item => normalizeBookMetadata(item as Book))
}

// ---- ID counter ----
function computeNextId<T extends { id: number }>(items: T[]): number {
  if (items.length === 0) return 1
  return Math.max(...items.map(i => i.id)) + 1
}

// ---- Persistence helpers ----

// toRaw strips Vue reactive proxies so contextBridge can serialize the plain data
async function persistEntity(entityType: EntityType, data: unknown): Promise<void> {
  await window.electronAPI.data.writeEntity(entityType, toRaw(data))
}

async function persistBooks() { await persistEntity('books', books.value) }
async function persistChapters() { await persistEntity('chapters', chapters.value) }
async function persistRules() { await persistEntity('rules', rules.value) }
async function persistThemes() { await persistEntity('themes', themes.value) }
async function persistBookmarks() { await persistEntity('bookmarks', bookmarks.value) }
async function persistReadingStats() { await persistEntity('readingStats', readingStats.value) }
async function persistSettings() { await persistEntity('settings', settingsMap.value) }

// ---- Initialization ----

async function loadAllData(): Promise<void> {
  if (dataLoaded.value) return

  try {
    const [b, c, r, t, bm, rs, s] = await Promise.all([
      window.electronAPI.data.readEntity('books'),
      window.electronAPI.data.readEntity('chapters'),
      window.electronAPI.data.readEntity('rules'),
      window.electronAPI.data.readEntity('themes'),
      window.electronAPI.data.readEntity('bookmarks'),
      window.electronAPI.data.readEntity('readingStats'),
      window.electronAPI.data.readEntity('settings'),
    ])
    books.value = normalizeBooksEntity(b)
    chapters.value = c as Chapter[]
    rules.value = r as Rule[]
    themes.value = t as Theme[]
    bookmarks.value = bm as Bookmark[]
    readingStats.value = rs as ReadingStatsRow[]
    settingsMap.value = s as Record<string, string>
    dataLoaded.value = true
  } catch (e) {
    console.error('[useDataStore] Failed to load data:', e)
    throw e
  }
}

// ---- Book operations ----

function getBook(id: number): Book | undefined {
  return books.value.find(b => b.id === id)
}

function getBooksSorted(): Book[] {
  return [...books.value].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.lastReadAt - a.lastReadAt
  })
}

async function addBook(book: Book): Promise<void> {
  books.value.push(normalizeBookMetadata(book))
  await persistBooks()
}

async function updateBook(id: number, fields: Partial<Book>): Promise<void> {
  const idx = books.value.findIndex(b => b.id === id)
  if (idx === -1) return
  books.value[idx] = normalizeBookMetadata({ ...books.value[idx], ...fields, updatedAt: Date.now() })
  await persistBooks()
}

async function removeBook(id: number): Promise<void> {
  books.value = books.value.filter(b => b.id !== id)
  chapters.value = chapters.value.filter(c => c.bookId !== id)
  rules.value = rules.value.filter(r => r.bookId !== id)
  bookmarks.value = bookmarks.value.filter(bm => bm.bookId !== id)
  await Promise.all([persistBooks(), persistChapters(), persistRules(), persistBookmarks()])
}

// ---- Chapter operations ----

function getChaptersForBook(bookId: number): Chapter[] {
  return chapters.value.filter(c => c.bookId === bookId).sort((a, b) => a.orderIndex - b.orderIndex)
}

function getChapterCountForBook(bookId: number): number {
  return chapters.value.filter(c => c.bookId === bookId).length
}

function getCurrentChapterTitle(bookId: number, progressIndex: number): string {
  const bookChapters = getChaptersForBook(bookId)
  const chapter = bookChapters[Math.min(Math.max(progressIndex, 0), bookChapters.length - 1)]
  return chapter?.title || ''
}

async function addChapters(newChapters: Chapter[]): Promise<void> {
  chapters.value.push(...newChapters)
  await persistChapters()
}

async function removeChaptersForBook(bookId: number): Promise<void> {
  chapters.value = chapters.value.filter(c => c.bookId !== bookId)
  await persistChapters()
}

// ---- Rule operations ----

function getRules(bookId?: number): Rule[] {
  if (bookId === undefined) return [...rules.value].sort((a, b) => a.id - b.id)
  return rules.value
    .filter(r => r.scope === 'global' || (r.scope === 'book' && r.bookId === bookId))
    .sort((a, b) => a.id - b.id)
}

async function addRule(rule: Omit<Rule, 'id' | 'updatedAt'>): Promise<Rule> {
  const newRule: Rule = {
    ...rule,
    id: computeNextId(rules.value),
    updatedAt: Date.now(),
  }
  rules.value.push(newRule)
  await persistRules()
  return newRule
}

async function updateRule(id: number, fields: Partial<Rule>): Promise<void> {
  const idx = rules.value.findIndex(r => r.id === id)
  if (idx === -1) return
  rules.value[idx] = { ...rules.value[idx], ...fields, updatedAt: Date.now() }
  await persistRules()
}

async function deleteRule(id: number): Promise<void> {
  rules.value = rules.value.filter(r => r.id !== id)
  await persistRules()
}

// ---- Theme operations ----

function getThemes(): Theme[] {
  return [...themes.value].sort((a, b) => a.id - b.id)
}

async function addTheme(theme: Omit<Theme, 'id' | 'updatedAt'>): Promise<Theme> {
  const newTheme: Theme = {
    ...theme,
    id: computeNextId(themes.value),
    updatedAt: Date.now(),
  }
  themes.value.push(newTheme)
  await persistThemes()
  return newTheme
}

async function updateTheme(id: number, fields: Partial<Theme>): Promise<void> {
  const idx = themes.value.findIndex(t => t.id === id)
  if (idx === -1) return
  themes.value[idx] = { ...themes.value[idx], ...fields, updatedAt: Date.now() }
  await persistThemes()
}

async function deleteTheme(id: number): Promise<void> {
  themes.value = themes.value.filter(t => t.id !== id)
  await persistThemes()
}

// ---- Bookmark operations ----

function getBookmarks(bookId?: number): Bookmark[] {
  let result = bookmarks.value
  if (bookId !== undefined) {
    result = result.filter(bm => bm.bookId === bookId)
  }
  return [...result].sort((a, b) => b.updatedAt - a.updatedAt)
}

function getBookmarksWithCover(bookId?: number): (Bookmark & { coverFile: string | null })[] {
  let result = bookmarks.value
  if (bookId !== undefined) {
    result = result.filter(bm => bm.bookId === bookId)
  }
  return [...result]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(bm => ({
      ...bm,
      coverFile: bm.bookId ? (getBook(bm.bookId)?.coverFile ?? null) : null,
    }))
}

async function addBookmark(bookmark: Bookmark): Promise<void> {
  bookmarks.value.push(bookmark)
  await persistBookmarks()
}

async function deleteBookmark(uuid: string): Promise<void> {
  bookmarks.value = bookmarks.value.filter(bm => bm.uuid !== uuid)
  await persistBookmarks()
}

async function deleteBookmarksForBook(bookId: number): Promise<void> {
  bookmarks.value = bookmarks.value.filter(bm => bm.bookId !== bookId)
  await persistBookmarks()
}

// ---- Reading stats operations ----

function getReadingStatsRows(deviceId?: string): ReadingStatsRow[] {
  if (deviceId) {
    return readingStats.value.filter(r => r.sourceDeviceId === deviceId)
  }
  return [...readingStats.value]
}

async function upsertReadingStatRow(
  row: Omit<ReadingStatsRow, 'updatedAt'>,
  mode: 'append' | 'overwrite' = 'append'
): Promise<void> {
  const existingIdx = readingStats.value.findIndex(
    r => r.sourceDeviceId === row.sourceDeviceId && r.date === row.date && r.bookIdentity === row.bookIdentity
  )
  const now = Date.now()
  if (existingIdx !== -1) {
    if (mode === 'append') {
      readingStats.value[existingIdx].durationSeconds += row.durationSeconds
      readingStats.value[existingIdx].charCount += row.charCount
    } else {
      readingStats.value[existingIdx].durationSeconds = row.durationSeconds
      readingStats.value[existingIdx].charCount = row.charCount
    }
    readingStats.value[existingIdx].bookTitle = row.bookTitle
    readingStats.value[existingIdx].bookAuthor = row.bookAuthor
    readingStats.value[existingIdx].updatedAt = Math.max(readingStats.value[existingIdx].updatedAt, now)
  } else {
    readingStats.value.push({ ...row, updatedAt: now })
  }
  await persistReadingStats()
}

async function mergeRemoteReadingStatRow(row: ReadingStatsRow): Promise<boolean> {
  const existing = readingStats.value.find(
    r => r.sourceDeviceId === row.sourceDeviceId && r.date === row.date && r.bookIdentity === row.bookIdentity
  )
  if (existing) {
    if (row.updatedAt > existing.updatedAt) {
      existing.bookTitle = row.bookTitle
      existing.bookAuthor = row.bookAuthor
      existing.durationSeconds = row.durationSeconds
      existing.charCount = row.charCount
      existing.updatedAt = row.updatedAt
      return true
    }
    return false
  }
  readingStats.value.push(row)
  return true
}

async function flushRemoteReadingStatsMerge(): Promise<void> {
  await persistReadingStats()
}

async function clearReadingStats(): Promise<void> {
  readingStats.value = []
  await persistReadingStats()
}

// ---- Settings operations ----

function getSetting(key: string): string | undefined {
  return settingsMap.value[key]
}

async function setSetting(key: string, value: string): Promise<void> {
  settingsMap.value[key] = value
  await persistSettings()
}

async function setSettings(entries: Record<string, string>): Promise<void> {
  Object.assign(settingsMap.value, entries)
  await persistSettings()
}

async function saveSettingsMap(entries: Record<string, string>): Promise<void> {
  settingsMap.value = { ...entries }
  await persistSettings()
}

// ---- Bulk read (for sync) ----
function getAllEntities() {
  return {
    books: books.value,
    chapters: chapters.value,
    rules: rules.value,
    themes: themes.value,
    bookmarks: bookmarks.value,
    readingStats: readingStats.value,
    settings: settingsMap.value,
  }
}

async function replaceAllEntities(entities: {
  books?: Book[]
  chapters?: Chapter[]
  rules?: Rule[]
  themes?: Theme[]
  bookmarks?: Bookmark[]
  readingStats?: ReadingStatsRow[]
  settings?: Record<string, string>
}): Promise<void> {
  if (entities.books) books.value = normalizeBooksEntity(entities.books)
  if (entities.chapters) chapters.value = entities.chapters
  if (entities.rules) rules.value = entities.rules
  if (entities.themes) themes.value = entities.themes
  if (entities.bookmarks) bookmarks.value = entities.bookmarks
  if (entities.readingStats) readingStats.value = entities.readingStats
  if (entities.settings) settingsMap.value = entities.settings

  // Persist all modified entities
  const promises: Promise<void>[] = []
  if (entities.books) promises.push(persistBooks())
  if (entities.chapters) promises.push(persistChapters())
  if (entities.rules) promises.push(persistRules())
  if (entities.themes) promises.push(persistThemes())
  if (entities.bookmarks) promises.push(persistBookmarks())
  if (entities.readingStats) promises.push(persistReadingStats())
  if (entities.settings) promises.push(persistSettings())
  await Promise.all(promises)
}

// ---- Export singleton ----

export function useDataStore() {
  return {
    // State
    books,
    chapters,
    rules,
    themes,
    bookmarks,
    readingStats,
    settingsMap,
    dataLoaded,

    // Init
    loadAllData,

    // Book
    getBook,
    getBooksSorted,
    addBook,
    updateBook,
    removeBook,

    // Chapter
    getChaptersForBook,
    getChapterCountForBook,
    getCurrentChapterTitle,
    addChapters,
    removeChaptersForBook,

    // Rule
    getRules,
    addRule,
    updateRule,
    deleteRule,

    // Theme
    getThemes,
    addTheme,
    updateTheme,
    deleteTheme,

    // Bookmark
    getBookmarks,
    getBookmarksWithCover,
    addBookmark,
    deleteBookmark,
    deleteBookmarksForBook,

    // Reading stats
    getReadingStatsRows,
    upsertReadingStatRow,
    mergeRemoteReadingStatRow,
    flushRemoteReadingStatsMerge,
    clearReadingStats,

    // Settings
    getSetting,
    setSetting,
    setSettings,
    saveSettingsMap,

    // Bulk
    getAllEntities,
    replaceAllEntities,
  }
}
