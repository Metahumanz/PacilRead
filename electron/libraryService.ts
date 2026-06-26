import { app, BrowserWindow, dialog } from 'electron'
import { dirname, extname, isAbsolute, join } from 'path'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { createGunzip, gunzipSync, gzipSync } from 'zlib'
import AdmZip from 'adm-zip'
import { is } from '@electron-toolkit/utils'
import { parseEpub, parsePdf, parseTxt, type Chapter } from './parsers'
import { PersistentBookSearchIndex, type SearchIndexChapter, type SearchIndexRule } from './searchIndex'
import { normalizeBookMetadata, normalizeBookPatch } from '../src/utils/bookMetadata'
import {
  addBookTags,
  detectDuplicates,
  removeBookTags,
  sanitizeExportFileName,
  uniqueExportFileName,
  type DuplicateMatchType,
} from '../src/utils/bookshelfManagement'
import { buildRemoteProgressExcerpt } from '../src/utils/remoteProgress'
import { ALLOWED_BOOK_EXTENSIONS, assertAllowedLocalReadPath, assertFileExtension, assertNonEmptyString } from './ipcGuards'

const CHAPTER_TEXT_DIR = 'chapter_text'
const DATA_DIR = join(app.getPath('userData'), 'data')
const SNAPSHOT_DIR = join(app.getPath('userData'), 'snapshots')
const SEARCH_INDEX_DIR = join(app.getPath('userData'), 'search_index')
const EMPTY_CHAPTER_TEXT_PLACEHOLDER = '章节正文为空或外置正文文件缺失。'
const JSON_FILES: Record<string, string> = {
  books: 'books.json',
  chapters: 'chapters.json',
  rules: 'rules.json',
  themes: 'themes.json',
  bookmarks: 'bookmarks.json',
  readingStats: 'reading_stats.json',
  settings: 'settings.json',
}

type JsonEntityType = keyof typeof JSON_FILES

interface SnapshotManifest {
  id: string
  reason: string
  createdAt: number
  schemaVersion: number
  entityCounts: Record<string, number>
  chapterTextFiles: number
  sizeBytes: number
}

interface SnapshotBundle {
  schemaVersion: number
  createdAt: number
  reason: string
  entities: Record<string, unknown>
  chapterTextFiles: Array<{ path: string; dataBase64: string }>
}

const jsonEntityCache = new Map<JsonEntityType, unknown>()
let chaptersByBookIdCache: Map<number, any[]> | null = null
const bookSearchIndex = new PersistentBookSearchIndex(SEARCH_INDEX_DIR)
function perfLog(label: string, startedAt: number, extra = ''): void {
  if (!is.dev && process.env.PACILREAD_PERF !== '1') return
  const elapsed = Math.round((performance.now() - startedAt) * 10) / 10
  console.log(`[Perf] ${label}: ${elapsed}ms${extra ? ` ${extra}` : ''}`)
}
function invalidateDerivedEntityCache(entityType: JsonEntityType): void {
  if (entityType === 'chapters') {
    chaptersByBookIdCache = null
  }
}

function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true })
}

function readJsonEntity<T>(entityType: JsonEntityType, defaultVal: T): T {
  if (jsonEntityCache.has(entityType)) {
    return jsonEntityCache.get(entityType) as T
  }
  const filePath = join(DATA_DIR, JSON_FILES[entityType])
  if (!existsSync(filePath)) {
    jsonEntityCache.set(entityType, defaultVal)
    return defaultVal
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
    jsonEntityCache.set(entityType, parsed)
    return parsed
  } catch (e) {
    console.error(`[DataStore] Failed to read ${entityType}.json:`, e)
    return defaultVal
  }
}

function writeJsonEntity(entityType: JsonEntityType, data: unknown): void {
  const filePath = join(DATA_DIR, JSON_FILES[entityType])
  mkdirSync(DATA_DIR, { recursive: true })
  const tmpPath = filePath + '.tmp'
  const jsonStr = JSON.stringify(data, null, 2)
  writeFileSync(tmpPath, jsonStr, 'utf8')
  renameSync(tmpPath, filePath)
  jsonEntityCache.set(entityType, data)
  invalidateDerivedEntityCache(entityType)
}

function writeJsonEntitiesAtomic(entries: Partial<Record<JsonEntityType, unknown>>): void {
  const entityTypes = Object.keys(entries) as JsonEntityType[]
  if (entityTypes.length === 0) return
  mkdirSync(DATA_DIR, { recursive: true })
  const txId = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const paths = entityTypes.map((entityType) => {
    const filePath = join(DATA_DIR, JSON_FILES[entityType])
    return {
      entityType,
      filePath,
      tmpPath: `${filePath}.${txId}.tmp`,
      backupPath: `${filePath}.${txId}.bak`,
      data: entries[entityType],
      existed: existsSync(filePath),
    }
  })

  try {
    for (const item of paths) {
      writeFileSync(item.tmpPath, JSON.stringify(item.data, null, 2), 'utf8')
    }
    for (const item of paths) {
      if (item.existed) copyFileSync(item.filePath, item.backupPath)
    }
    for (const item of paths) {
      renameSync(item.tmpPath, item.filePath)
    }
    for (const item of paths) {
      jsonEntityCache.set(item.entityType, item.data)
      invalidateDerivedEntityCache(item.entityType)
    }
  } catch (error) {
    for (const item of paths) {
      try {
        if (existsSync(item.backupPath)) copyFileSync(item.backupPath, item.filePath)
        else rmSync(item.filePath, { force: true })
      } catch (restoreError) {
        console.error('[DataStore] Failed to restore JSON backup:', item.entityType, restoreError)
      }
      jsonEntityCache.delete(item.entityType)
      invalidateDerivedEntityCache(item.entityType)
    }
    throw error
  } finally {
    for (const item of paths) {
      rmSync(item.tmpPath, { force: true })
      rmSync(item.backupPath, { force: true })
    }
  }
}

function fileSizeBytes(filePath: string): number {
  try { return statSync(filePath).size } catch { return 0 }
}

function extractFileName(path: string | null): string | null {
  if (!path) return null
  try {
    const url = new URL(path)
    if (url.protocol === 'file:') {
      const basename = url.pathname.split('/').pop() || url.pathname.split('\\').pop()
      return basename || null
    }
  } catch {}
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || null
}

function detectBookType(path: string | null): string {
  if (!path) return 'text'
  const ext = extname(path).toLowerCase()
  switch (ext) {
    case '.epub': return 'epub'
    case '.txt': return 'txt'
    case '.pdf': return 'pdf'
    default: return 'text'
  }
}

function parseDateToEpochMillis(dateStr: string | null): number {
  if (!dateStr) return Date.now()
  const parsed = Date.parse(dateStr)
  return Number.isNaN(parsed) ? Date.now() : parsed
}
function parseBookNameAndAuthor(rawName: string): { title: string, author: string | null } {
  let title = rawName.replace(/\.[^/.]+$/, '').trim()
  let author: string | null = null

  const authorMatch = title.match(/作者[:：\s]*([^\s_()（）\[\]《》]+)/)
  if (authorMatch) {
    author = authorMatch[1].trim()
    title = title.replace(authorMatch[0], '')
  }

  const titleMatch = title.match(/《([^》]+)》/)
  if (titleMatch) {
    title = titleMatch[1].trim()
  }

  if (!author && !titleMatch) {
    const bracketMatch = title.match(/^\[([^\]]+)\]\s*(.*)$/) || title.match(/^【([^】]+)】\s*(.*)$/)
    if (bracketMatch) {
      author = bracketMatch[1].trim()
      title = bracketMatch[2].trim()
    }
  }

  if (!author && !titleMatch) {
    const dashMatch = title.match(/^(.*?)\s*-\s*([^-]+)$/)
    if (dashMatch) {
      title = dashMatch[1].trim()
      author = dashMatch[2].trim()
    }
  }

  title = title.replace(/[（\(][^）\)]*(校对|全本|精校|番外|完整|修改)[^）\)]*[）\)]/g, '')
  title = title.replace(/第.*部/, '')
  
  if (!author && !titleMatch && title.includes('_')) {
    const parts = title.split('_')
    const possibleAuthor = parts.pop()!.trim()
    if (possibleAuthor && possibleAuthor !== '未知') {
       author = possibleAuthor
       title = parts.join('_').trim()
    }
  } else {
    title = title.replace(/_.*$/, '')
  }

  title = title.replace(/_/g, '').trim()
  if (title.startsWith('《') && title.endsWith('》')) {
    title = title.substring(1, title.length - 1).trim()
  }

  if (author === '未知' || author === '') author = null

  return { title, author }
}

function normalizeReadingStatsComponent(value: string | null | undefined): string {
  return (value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function buildReadingStatsKey(title: string, author: string | null): string {
  const normalizedTitle = normalizeReadingStatsComponent(title)
  const normalizedAuthor = normalizeReadingStatsComponent(author)
  return createHash('sha256')
    .update(`${normalizedTitle}\n${normalizedAuthor}`, 'utf8')
    .digest('hex')
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToHtml(text: string): string {
  return text
    .split(/\n/)
    .filter(l => l.trim())
    .map(l => `<p>${escapeHtmlText(l.trim())}</p>`)
    .join('\n')
}

function getChapterTextRoot(): string {
  return join(app.getPath('userData'), CHAPTER_TEXT_DIR)
}

function normalizeChapterTextRelativePath(value: unknown): string | null {
  const raw = String(value || '').replace(/\\/g, '/').trim()
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null
  const parts = raw.split('/').filter(Boolean)
  if (parts.length === 0 || parts.some(part => part === '.' || part === '..')) return null
  return parts.join('/')
}

function normalizeChapterTextStoragePath(value: unknown): string | null {
  const normalized = normalizeChapterTextRelativePath(value)
  if (!normalized) return null
  const chapterTextPrefix = `${CHAPTER_TEXT_DIR}/`
  if (normalized === CHAPTER_TEXT_DIR) return null
  return normalized.startsWith(chapterTextPrefix)
    ? normalized.slice(chapterTextPrefix.length)
    : normalized
}

function getChapterTextRelativePath(bookId: number, chapterId: number): string {
  return `book_${bookId}/chapter_${chapterId}.txt.gz`
}

function getChapterTextAbsolutePath(relativePath: string): string {
  const safePath = normalizeChapterTextStoragePath(relativePath)
  if (!safePath) throw new Error(`Invalid chapter text path: ${relativePath}`)
  return join(getChapterTextRoot(), ...safePath.split('/'))
}

function getBookChapterTextDir(bookId: number): string {
  return join(getChapterTextRoot(), `book_${bookId}`)
}

function resolveChapterTextPath(bodyTextPath: string, dataDir: string): string | null {
  if (isAbsolute(bodyTextPath) && existsSync(bodyTextPath)) return bodyTextPath
  const normalized = normalizeChapterTextRelativePath(bodyTextPath)
  const storagePath = normalizeChapterTextStoragePath(bodyTextPath)
  if (!normalized || !storagePath) return null

  const candidates = [
    join(getChapterTextRoot(), ...storagePath.split('/')),
    join(dataDir, ...normalized.split('/')),
  ]
  if (normalized.startsWith(`${CHAPTER_TEXT_DIR}/`)) {
    candidates.push(join(getChapterTextRoot(), ...normalized.split('/')))
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function getFileGzipChapterRowsForBook(bookId: number): any[] {
  return getChapterRowsForBook(bookId)
    .filter((chapter) => chapter.bodyTextStorage === 'file_gzip'
      && chapter.bodyTextPath)
    .sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0))
}

function createBookChapterTextZip(bookId: number): string | null {
  const rows = getFileGzipChapterRowsForBook(bookId)
  if (rows.length === 0) return null

  const zip = new AdmZip()
  for (const row of rows) {
    const relativePath = normalizeChapterTextStoragePath(row.bodyTextPath)
    if (!relativePath) continue
    const absolutePath = getChapterTextAbsolutePath(relativePath)
    if (!existsSync(absolutePath)) continue
    zip.addLocalFile(absolutePath, dirname(relativePath))
  }
  if (zip.getEntryCount() === 0) return null

  const tempDir = app.getPath('temp')
  const zipPath = join(tempDir, `book_${bookId}_${Date.now()}.zip`)
  zip.writeZip(zipPath)
  return zipPath
}

function extractBookChapterTextZip(zipPath: string): number {
  assertAllowedLocalReadPath(zipPath)
  const chapterTextRoot = getChapterTextRoot()
  const zip = new AdmZip(zipPath)
  const entries = zip.getEntries()
  let extracted = 0

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const normalized = normalizeChapterTextStoragePath(entry.entryName)
    if (!normalized) {
      console.warn('[Library] Skipping unsafe ZIP entry:', entry.entryName)
      continue
    }
    const absolutePath = join(chapterTextRoot, ...normalized.split('/'))
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, entry.getData())
    extracted++
  }
  return extracted
}

function getBookIdsWithFileGzipChapters(): number[] {
  const ids = new Set<number>()
  for (const chapter of readJsonEntity('chapters', []) as any[]) {
    if (chapter.bodyTextStorage === 'file_gzip' && chapter.bodyTextPath) {
      ids.add(Number(chapter.bookId))
    }
  }
  return Array.from(ids).filter(Number.isFinite).sort((a, b) => a - b)
}

function hasBookChapterTextFiles(bookId: number): boolean {
  const rows = getFileGzipChapterRowsForBook(bookId)
  if (rows.length === 0) return true
  const dataDir = app.getPath('userData')
  return rows.every((chapter) => {
    const bodyTextPath = String(chapter.bodyTextPath || '')
    if (!bodyTextPath) return false
    return resolveChapterTextPath(bodyTextPath, dataDir) !== null
  })
}

function writeChapterTextGzip(bookId: number, chapterId: number, bodyText: string): {
  relativePath: string
  sizeBytes: number
} {
  const relativePath = getChapterTextRelativePath(bookId, chapterId)
  const absolutePath = getChapterTextAbsolutePath(relativePath)
  const source = Buffer.from(bodyText, 'utf8')
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, gzipSync(source))

  const restored = gunzipSync(readFileSync(absolutePath))
  if (!restored.equals(source)) {
    throw new Error(`章节正文压缩校验失败: ${relativePath}`)
  }

  return { relativePath, sizeBytes: source.byteLength }
}

function readChapterTextGzip(bodyTextPath: string): string | null {
  const dataDir = app.getPath('userData')
  const resolvedPath = resolveChapterTextPath(bodyTextPath, dataDir)
  if (!resolvedPath) return null

  try {
    return gunzipSync(readFileSync(resolvedPath)).toString('utf8')
  } catch (error) {
    console.error('[Library] Failed to read chapter text file:', resolvedPath, error)
    return null
  }
}

async function getChapterTextExcerptJson(
  bookId: number,
  chapterId: number,
  charOffset: number,
  requestedMaxChars = 64,
): Promise<string> {
  const chapter = getChapterRowsForBook(bookId).find(row => Number(row.id) === Number(chapterId))
  if (!chapter) return ''

  const maxChars = Math.max(16, Math.min(240, Math.floor(Number(requestedMaxChars) || 64)))
  const knownLength = Math.max(0, Number(chapter.bodyTextSize || 0))
  const offset = Math.max(0, Math.min(Math.floor(Number(charOffset) || 0), knownLength || Number.MAX_SAFE_INTEGER))

  if (chapterRowTextStorage(chapter) !== 'file_gzip') {
    return buildRemoteProgressExcerpt(String(chapter.bodyText || ''), offset, maxChars)
  }

  const bodyTextPath = String(chapter.bodyTextPath || '')
  const resolvedPath = bodyTextPath ? resolveChapterTextPath(bodyTextPath, app.getPath('userData')) : null
  if (!resolvedPath) return ''

  const start = Math.max(0, offset - Math.max(1, Math.floor(maxChars / 3)))
  const stream = createReadStream(resolvedPath).pipe(createGunzip())
  stream.setEncoding('utf8')
  let consumed = 0
  let excerpt = ''
  let hasTrailingText = false

  try {
    for await (const value of stream) {
      const chunk = String(value)
      const chunkStart = consumed
      const chunkEnd = chunkStart + chunk.length
      consumed = chunkEnd
      if (chunkEnd <= start) continue

      const localStart = Math.max(0, start - chunkStart)
      const remaining = maxChars - excerpt.length
      if (remaining > 0) excerpt += chunk.slice(localStart, localStart + remaining)
      if (chunk.length - localStart > remaining || excerpt.length >= maxChars) {
        hasTrailingText = true
        break
      }
    }
  } catch (error) {
    console.error('[Library] Failed to stream chapter excerpt:', resolvedPath, error)
    return ''
  } finally {
    stream.destroy()
  }

  const normalized = excerpt.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return `${start > 0 ? '…' : ''}${normalized}${hasTrailingText ? '…' : ''}`
}

function directorySizeBytes(dirPath: string): number {
  if (!existsSync(dirPath)) return 0
  let total = 0
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) total += directorySizeBytes(entryPath)
    else if (entry.isFile()) total += statSync(entryPath).size
  }
  return total
}

function getStorageSizeInfo(): { sizeBytes: number; chapterTextBytes: number; jsonDataBytes: number; totalBytes: number } {
  const chapterTextBytes = directorySizeBytes(getChapterTextRoot())
  const jsonDataBytes = directorySizeBytes(DATA_DIR)
  const totalBytes = chapterTextBytes + jsonDataBytes
  return {
    sizeBytes: totalBytes,
    chapterTextBytes,
    jsonDataBytes,
    totalBytes
  }
}

function getSnapshotPaths(id: string): { bundlePath: string; manifestPath: string } {
  const safeId = String(id || '').replace(/[^A-Za-z0-9_-]/g, '')
  return {
    bundlePath: join(SNAPSHOT_DIR, `${safeId}.json.gz`),
    manifestPath: join(SNAPSHOT_DIR, `${safeId}.manifest.json`),
  }
}

function collectChapterTextSnapshotFiles(): Array<{ path: string; dataBase64: string }> {
  const root = getChapterTextRoot()
  const files: Array<{ path: string; dataBase64: string }> = []
  if (!existsSync(root)) return files

  const walk = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolutePath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath)
      } else if (entry.isFile() && normalizeChapterTextStoragePath(relativePath)) {
        files.push({
          path: relativePath,
          dataBase64: readFileSync(absolutePath).toString('base64'),
        })
      }
    }
  }
  walk(root)
  return files
}

function writeChapterTextSnapshotFiles(files: Array<{ path: string; dataBase64: string }>): void {
  const root = getChapterTextRoot()
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })

  for (const file of files) {
    const relativePath = normalizeChapterTextStoragePath(file.path)
    if (!relativePath) continue
    const absolutePath = join(root, ...relativePath.split('/'))
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, Buffer.from(file.dataBase64, 'base64'))
  }
}

function countEntityRows(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).length
  return 0
}

function createLocalSnapshot(reason = '手动创建'): SnapshotManifest {
  ensureDataDir()
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const createdAt = Date.now()
  const id = `${createdAt}-${createHash('sha1').update(`${reason}:${createdAt}`).digest('hex').slice(0, 8)}`
  const entities: Record<string, unknown> = {}
  const entityCounts: Record<string, number> = {}

  for (const entityType of Object.keys(JSON_FILES) as JsonEntityType[]) {
    const defaultValue = entityType === 'settings' ? {} : []
    const value = readJsonEntity(entityType, defaultValue)
    entities[entityType] = value
    entityCounts[entityType] = countEntityRows(value)
  }

  const chapterTextFiles = collectChapterTextSnapshotFiles()
  const bundle: SnapshotBundle = {
    schemaVersion: 1,
    createdAt,
    reason,
    entities,
    chapterTextFiles,
  }
  const { bundlePath, manifestPath } = getSnapshotPaths(id)
  writeFileSync(bundlePath, gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8')))

  const manifest: SnapshotManifest = {
    id,
    reason,
    createdAt,
    schemaVersion: 1,
    entityCounts,
    chapterTextFiles: chapterTextFiles.length,
    sizeBytes: fileSizeBytes(bundlePath),
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  return manifest
}

function listLocalSnapshots(): SnapshotManifest[] {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const snapshots: SnapshotManifest[] = []
  for (const entry of readdirSync(SNAPSHOT_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.manifest.json')) continue
    try {
      const manifest = JSON.parse(readFileSync(join(SNAPSHOT_DIR, entry.name), 'utf8')) as SnapshotManifest
      const { bundlePath } = getSnapshotPaths(manifest.id)
      manifest.sizeBytes = fileSizeBytes(bundlePath)
      snapshots.push(manifest)
    } catch {}
  }
  return snapshots.sort((a, b) => b.createdAt - a.createdAt)
}

function restoreLocalSnapshot(id: string): SnapshotManifest {
  const { bundlePath } = getSnapshotPaths(id)
  if (!existsSync(bundlePath)) throw new Error('恢复点文件不存在')
  createLocalSnapshot('恢复前自动快照')

  const bundle = JSON.parse(gunzipSync(readFileSync(bundlePath)).toString('utf8')) as SnapshotBundle
  if (!bundle || bundle.schemaVersion !== 1 || !bundle.entities) {
    throw new Error('恢复点格式不兼容')
  }

  const restoredEntities: Partial<Record<JsonEntityType, unknown>> = {}
  for (const entityType of Object.keys(JSON_FILES) as JsonEntityType[]) {
    const defaultValue = entityType === 'settings' ? {} : []
    restoredEntities[entityType] = bundle.entities[entityType] ?? defaultValue
  }
  writeJsonEntitiesAtomic(restoredEntities)
  writeChapterTextSnapshotFiles(Array.isArray(bundle.chapterTextFiles) ? bundle.chapterTextFiles : [])
  chaptersByBookIdCache = null
  return getSnapshotManifest(id)
}

function getSnapshotManifest(id: string): SnapshotManifest {
  const { manifestPath, bundlePath } = getSnapshotPaths(id)
  if (!existsSync(manifestPath)) throw new Error('恢复点清单不存在')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as SnapshotManifest
  manifest.sizeBytes = fileSizeBytes(bundlePath)
  return manifest
}

function deleteLocalSnapshot(id: string): { success: boolean } {
  const { bundlePath, manifestPath } = getSnapshotPaths(id)
  rmSync(bundlePath, { force: true })
  rmSync(manifestPath, { force: true })
  return { success: true }
}

function initializeJsonStore(): void {
  ensureDataDir()
  for (const [entityType, fileName] of Object.entries(JSON_FILES)) {
    const filePath = join(DATA_DIR, fileName)
    if (!existsSync(filePath)) {
      const defaultValue = entityType === 'settings' ? {} : []
      writeJsonEntity(entityType as keyof typeof JSON_FILES, defaultValue)
    }
  }
  const markerPath = join(DATA_DIR, '.migrated')
  if (!existsSync(markerPath)) {
    writeFileSync(markerPath, JSON.stringify({
      migratedAt: Date.now(),
      toSchemaVersion: 8,
      storage: 'json',
    }, null, 2), 'utf8')
  }

  const books = readJsonEntity('books', []) as any[]
  const normalizedBooks = books.map(book => normalizeBookMetadata(book))
  if (JSON.stringify(books) !== JSON.stringify(normalizedBooks)) {
    writeJsonEntity('books', normalizedBooks)
  }
}

function nextJsonId(items: Array<{ id: number }>): number {
  return items.length === 0 ? 1 : Math.max(...items.map(item => Number(item.id) || 0)) + 1
}

function safeAssetFileName(value: string): string {
  const fallback = 'book'
  const raw = value.split(/[/\\]/).pop() || fallback
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}

function copyImportedBookSource(bookId: number, filePath: string): string {
  assertAllowedLocalReadPath(filePath)
  assertFileExtension(filePath, ALLOWED_BOOK_EXTENSIONS, '书籍文件')
  const booksDir = join(app.getPath('userData'), 'books')
  mkdirSync(booksDir, { recursive: true })
  const originalName = safeAssetFileName(filePath)
  const filename = `book_${bookId}_${originalName}`
  copyFileSync(filePath, join(booksDir, filename))
  return filename
}

type ImportBookResult =
  | { status: 'imported'; bookId: number; chapterCount: number }
  | { status: 'duplicate'; matchType: DuplicateMatchType; title: string; author: string | null }

function importedSourceAbsolutePath(book: any): string | null {
  if (!book?.sourceFile) return null
  const target = join(app.getPath('userData'), 'books', safeAssetFileName(String(book.sourceFile)))
  return existsSync(target) ? target : null
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function backfillBookContentHashes(books: any[]): boolean {
  let changed = false
  for (const book of books) {
    if (String(book.contentSha256 || '').trim()) continue
    const sourcePath = importedSourceAbsolutePath(book)
    if (!sourcePath) continue
    try {
      book.contentSha256 = sha256File(sourcePath)
      changed = true
    } catch (error) {
      console.warn('[Library] Failed to backfill source hash:', book.id, error)
    }
  }
  return changed
}

async function importBookJson(filePath: string, allowDuplicate = false): Promise<ImportBookResult> {
  let bookId = 0
  let copiedSourceFile: string | null = null
  try {
    assertAllowedLocalReadPath(filePath)
    const ext = extname(filePath).toLowerCase()
    assertFileExtension(filePath, ALLOWED_BOOK_EXTENSIONS, '书籍文件')
    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown'
    const parsed = parseBookNameAndAuthor(fileName)
    const title = parsed.title || fileName.replace(/\.[^/.]+$/, '')
    const author = parsed.author
    const readingStatsKey = buildReadingStatsKey(title, author)
    const contentSha256 = sha256File(filePath)
    const books = readJsonEntity('books', []) as any[]
    if (backfillBookContentHashes(books)) writeJsonEntity('books', books)
    const duplicate = detectDuplicates(
      books.map(book => ({
        key: `existing-${book.id}`,
        title: book.title,
        author: book.author,
        contentSha256: book.contentSha256,
      })),
      [{ key: 'incoming', title, author, contentSha256 }],
    ).get('incoming')
    if (duplicate && !allowDuplicate) {
      return { status: 'duplicate', matchType: duplicate, title, author }
    }
    let parsedChapters: Chapter[]
    let coverBuffer: Buffer | undefined
    let coverExtension: string | undefined

    if (ext === '.txt') {
      parsedChapters = parseTxt(filePath)
    } else if (ext === '.epub') {
      const epubResult = await parseEpub(filePath)
      parsedChapters = epubResult.chapters
      coverBuffer = epubResult.coverBuffer
      coverExtension = epubResult.coverExtension
    } else if (ext === '.pdf') {
      parsedChapters = await parsePdf(filePath)
    } else {
      throw new Error(`Unsupported: ${ext}`)
    }

    const chapters = readJsonEntity('chapters', []) as any[]
    const now = Date.now()
    bookId = nextJsonId(books)
    let nextChapterId = nextJsonId(chapters)
    const sourceFile = copyImportedBookSource(bookId, filePath)
    copiedSourceFile = sourceFile
    let coverFile: string | null = null

    if (coverBuffer && coverExtension) {
      const coversDir = join(app.getPath('userData'), 'covers')
      mkdirSync(coversDir, { recursive: true })
      coverFile = `epub_cover_${bookId}.${coverExtension}`
      writeFileSync(join(coversDir, coverFile), coverBuffer)
    }

    const chapterRows = parsedChapters.map((chapter, index) => {
      const chapterId = nextChapterId++
      const bodyText = chapter.bodyText || ''
      const stored = writeChapterTextGzip(bookId, chapterId, bodyText)
      return {
        id: chapterId,
        bookId,
        title: String(chapter.title || `第 ${index + 1} 章`),
        orderIndex: Number.isFinite(chapter.orderIndex) ? chapter.orderIndex : index,
        bodyTextPath: stored.relativePath,
        bodyTextStorage: 'file_gzip',
        bodyTextSize: stored.sizeBytes,
      }
    })

    books.push({
      id: bookId,
      title,
      author,
      bookType: detectBookType(filePath),
      readingStatsKey,
      tags: [],
      series: '',
      readingStatus: 'unread',
      progressIndex: 0,
      progressOffset: 0,
      lastReadAt: now,
      pinned: false,
      chapterCount: chapterRows.length,
      currentChapterTitle: chapterRows[0]?.title || '',
      createdAt: now,
      updatedAt: now,
      coverFile,
      sourceFile,
      sourceDisplayName: fileName,
      contentSha256,
    })

    writeJsonEntitiesAtomic({
      books,
      chapters: [...chapters, ...chapterRows],
    })
    const result: ImportBookResult = { status: 'imported', bookId, chapterCount: chapterRows.length }
    setTimeout(() => {
      try { warmBookSearchIndex(bookId) } catch (error) { console.warn('[Search] Import warmup failed:', error) }
    }, 0)
    return result
  } catch (error) {
    if (bookId > 0) {
      rmSync(getBookChapterTextDir(bookId), { recursive: true, force: true })
      if (copiedSourceFile) rmSync(join(app.getPath('userData'), 'books', safeAssetFileName(copiedSourceFile)), { force: true })
    }
    console.error('Import error:', error)
    throw error
  }
}

function getBookChapterListJson(bookId: number) {
  const startedAt = performance.now()
  const result = getChapterRowsForBook(bookId).map(chapterRowToMeta)
  perfLog('library:getBookChapterList', startedAt, `book=${bookId} chapters=${result.length}`)
  return result
}

function getChapterContentBatchJson(bookId: number, chapterIds: number[]) {
  const startedAt = performance.now()
  const requestedIds = Array.from(new Set(
    (Array.isArray(chapterIds) ? chapterIds : [])
      .map(id => Number(id))
      .filter(Number.isFinite)
  ))
  if (requestedIds.length === 0) return []

  const byId = new Map<number, any>()
  for (const chapter of getChapterRowsForBook(bookId)) {
    byId.set(Number(chapter.id), chapter)
  }
  const result = requestedIds
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(chapterRowToContent)
  perfLog('library:getChapterContentBatch', startedAt, `book=${bookId} requested=${requestedIds.length} found=${result.length}`)
  return result
}

function bookRowToSummary(book: any) {
  const normalizedBook = normalizeBookMetadata(book || {})
  const bookId = Number(book.id)
  const chapterCount = Number(book.chapterCount || 0)
  const progressIndex = Math.max(0, Math.min(Number(book.progressIndex || 0), Math.max(0, chapterCount - 1)))
  const currentChapter = getChapterRowsForBook(bookId)[progressIndex]
  return {
    id: bookId,
    title: String(book.title || '未命名'),
    author: book.author === undefined || book.author === null ? null : String(book.author),
    bookType: String(book.bookType || 'text'),
    readingStatsKey: String(book.readingStatsKey || ''),
    tags: normalizedBook.tags,
    series: normalizedBook.series,
    seriesIndex: normalizedBook.seriesIndex,
    readingStatus: normalizedBook.readingStatus,
    progressIndex,
    progressOffset: Number(book.progressOffset || 0),
    lastReadAt: Number(book.lastReadAt || 0),
    pinned: Boolean(book.pinned),
    currentChapterTitle: String(currentChapter?.title || book.currentChapterTitle || ''),
    chapterCount,
    coverFile: book.coverFile === undefined || book.coverFile === null ? null : String(book.coverFile),
    sourceFile: book.sourceFile === undefined || book.sourceFile === null ? null : String(book.sourceFile),
    sourceDisplayName: book.sourceDisplayName === undefined ? undefined : String(book.sourceDisplayName),
    contentSha256: book.contentSha256 === undefined ? undefined : String(book.contentSha256),
    createdAt: Number(book.createdAt || 0),
    updatedAt: Number(book.updatedAt || 0),
  }
}

function sortBookSummaries<T extends { pinned: boolean; lastReadAt: number; title: string }>(books: T[]): T[] {
  return [...books].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (a.lastReadAt !== b.lastReadAt) return b.lastReadAt - a.lastReadAt
    return a.title.localeCompare(b.title, 'zh-CN')
  })
}

function sortBookRows(books: any[]): any[] {
  return [...books].sort((a, b) => {
    const aPinned = Boolean(a.pinned)
    const bPinned = Boolean(b.pinned)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    const aLastReadAt = Number(a.lastReadAt || 0)
    const bLastReadAt = Number(b.lastReadAt || 0)
    if (aLastReadAt !== bLastReadAt) return bLastReadAt - aLastReadAt
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN')
  })
}

function getBookshelfBooksJson() {
  const startedAt = performance.now()
  const books = readJsonEntity('books', []) as any[]
  const result = sortBookSummaries(books.map(bookRowToSummary))
  perfLog('library:getBookshelfBooks', startedAt, `books=${result.length}`)
  return result
}

function getBookSummaryJson(bookId: number) {
  const startedAt = performance.now()
  const books = readJsonEntity('books', []) as any[]
  const book = books.find(row => Number(row.id) === Number(bookId))
  const result = book ? bookRowToSummary(book) : null
  perfLog('library:getBookSummary', startedAt, `book=${bookId} found=${result ? 1 : 0}`)
  return result
}

function getMostRecentBookJson() {
  const startedAt = performance.now()
  const book = sortBookRows(readJsonEntity('books', []) as any[])[0]
  const result = book ? bookRowToSummary(book) : null
  perfLog('library:getMostRecentBook', startedAt, `found=${result ? 1 : 0}`)
  return result
}

function getSearchIndexRules(bookId: number): SearchIndexRule[] {
  return (readJsonEntity('rules', []) as any[])
    .filter(rule => rule.scope === 'global' || (rule.scope === 'book' && Number(rule.bookId) === bookId))
    .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
    .map(rule => ({
      id: Number(rule.id || 0),
      updatedAt: Number(rule.updatedAt || 0),
      active: Boolean(rule.active),
      regex: Boolean(rule.regex),
      pattern: String(rule.pattern || ''),
      replacement: String(rule.replacement || ''),
    }))
}

function getSearchIndexChapters(bookId: number, includeText = true): SearchIndexChapter[] {
  return getChapterRowsForBook(bookId).map((chapter, index) => {
    const bodyTextPath = String(chapter.bodyTextPath || '')
    const resolvedPath = bodyTextPath ? resolveChapterTextPath(bodyTextPath, app.getPath('userData')) : null
    const stats = resolvedPath && existsSync(resolvedPath) ? statSync(resolvedPath) : null
    const storage = chapterRowTextStorage(chapter)
    const inlineText = storage === 'inline' ? String(chapter.bodyText || '') : ''
    const text = includeText
      ? (storage === 'file_gzip' && bodyTextPath
        ? (readChapterTextGzip(bodyTextPath) || '')
        : inlineText)
      : inlineText
    return {
      id: Number(chapter.id),
      title: String(chapter.title || `第 ${index + 1} 章`),
      orderIndex: Number(chapter.orderIndex || index),
      fingerprint: `${chapter.bodyTextSize || stats?.size || inlineText.length}|${bodyTextPath}|${stats?.size || 0}|${stats?.mtimeMs || 0}`,
      text,
    }
  })
}

function warmBookSearchIndex(bookId: number): void {
  bookSearchIndex.build(bookId, getSearchIndexChapters(bookId), getSearchIndexRules(bookId))
}

function isBookSearchIndexReady(bookId: number): boolean {
  return bookSearchIndex.isReady(bookId, getSearchIndexChapters(bookId, false), getSearchIndexRules(bookId))
}

function searchBookJson(bookId: number, query: string) {
  return bookSearchIndex.search(bookId, getSearchIndexChapters(bookId), getSearchIndexRules(bookId), query)
}

function updateBookJson(bookId: number, fields: Record<string, unknown>) {
  const startedAt = performance.now()
  const allowedFields = new Set([
    'title',
    'author',
    'coverFile',
    'sourceFile',
    'progressIndex',
    'progressOffset',
    'lastReadAt',
    'pinned',
    'currentChapterTitle',
    'bookType',
    'readingStatsKey',
    'tags',
    'series',
    'seriesIndex',
    'readingStatus',
  ])
  const books = readJsonEntity('books', []) as any[]
  const idx = books.findIndex(book => Number(book.id) === Number(bookId))
  if (idx < 0) return null

  const next = { ...books[idx] }
  for (const [key, value] of Object.entries(normalizeBookPatch(fields || {}))) {
    if (!allowedFields.has(key)) continue
    next[key] = value
  }
  next.updatedAt = Date.now()
  books[idx] = normalizeBookMetadata(next)
  writeJsonEntity('books', books)
  const result = bookRowToSummary(next)
  perfLog('library:updateBook', startedAt, `book=${bookId}`)
  return result
}

type BatchClassificationOperation =
  | { type: 'addTags' | 'removeTags'; tags: string[] }
  | { type: 'setSeries'; series: string }
  | { type: 'setReadingStatus'; status: 'unread' | 'reading' | 'finished' }

function batchClassifyBooksJson(bookIds: number[], operation: BatchClassificationOperation): { updated: number } {
  const ids = new Set(bookIds.map(Number).filter(Number.isFinite))
  const books = readJsonEntity('books', []) as any[]
  let updated = 0
  const next = books.map(book => {
    if (!ids.has(Number(book.id))) return book
    const value = { ...book, updatedAt: Date.now() }
    if (operation.type === 'addTags') value.tags = addBookTags(value.tags, operation.tags)
    else if (operation.type === 'removeTags') value.tags = removeBookTags(value.tags, operation.tags)
    else if (operation.type === 'setSeries') value.series = String(operation.series || '').trim()
    else if (operation.type === 'setReadingStatus') value.readingStatus = operation.status
    updated++
    return normalizeBookMetadata(value)
  })
  if (updated > 0) writeJsonEntity('books', next)
  return { updated }
}

function deleteBooksJson(bookIds: number[]): { deleted: number } {
  const ids = new Set(bookIds.map(Number).filter(Number.isFinite))
  if (ids.size === 0) return { deleted: 0 }
  createLocalSnapshot(ids.size > 1 ? '批量删除书籍前自动快照' : '删除书籍前自动快照')
  const books = readJsonEntity('books', []) as any[]
  const targets = books.filter(book => ids.has(Number(book.id)))
  writeJsonEntitiesAtomic({
    books: books.filter(book => !ids.has(Number(book.id))),
    chapters: (readJsonEntity('chapters', []) as any[]).filter(chapter => !ids.has(Number(chapter.bookId))),
    rules: (readJsonEntity('rules', []) as any[]).filter(rule => !ids.has(Number(rule.bookId))),
    bookmarks: (readJsonEntity('bookmarks', []) as any[]).filter(bookmark => !ids.has(Number(bookmark.bookId))),
  })
  for (const target of targets) {
    const bookId = Number(target.id)
    rmSync(getBookChapterTextDir(bookId), { recursive: true, force: true })
    const source = importedSourceAbsolutePath(target)
    if (source) rmSync(source, { force: true })
    bookSearchIndex.delete(bookId)
  }
  return { deleted: targets.length }
}

function deleteBookJson(bookId: number): { success: boolean } {
  deleteBooksJson([bookId])
  return { success: true }
}

function exportExtension(book: any): string {
  const sourceName = String(book.sourceDisplayName || book.sourceFile || '')
  const sourceExt = extname(sourceName).toLocaleLowerCase()
  if (sourceExt) return sourceExt
  if (String(book.bookType).toLocaleLowerCase() === 'epub') return '.epub'
  if (String(book.bookType).toLocaleLowerCase() === 'pdf') return '.pdf'
  return '.txt'
}

async function exportBooksJson(bookIds: number[], ownerWindow: BrowserWindow | null) {
  const dialogOptions: Electron.OpenDialogOptions = { properties: ['openDirectory', 'createDirectory'] }
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  if (result.canceled || !result.filePaths[0]) return { canceled: true, success: 0, failed: 0 }
  const directory = result.filePaths[0]
  const ids = new Set(bookIds.map(Number).filter(Number.isFinite))
  const books = (readJsonEntity('books', []) as any[]).filter(book => ids.has(Number(book.id)))
  const usedNames = new Set(readdirSync(directory))
  let success = 0
  let failed = 0
  for (const book of books) {
    try {
      const source = importedSourceAbsolutePath(book)
      if (!source) throw new Error('原文件不存在')
      const extension = exportExtension(book)
      const prefixedFallback = String(book.sourceFile || '').replace(new RegExp(`^book_${Number(book.id)}_`), '')
      const preferred = String(book.sourceDisplayName || prefixedFallback || '').trim()
        || `${sanitizeExportFileName(book.title || '未命名书籍')}${book.author ? ` - ${sanitizeExportFileName(book.author)}` : ''}${extension}`
      const filename = uniqueExportFileName(preferred, extension, usedNames)
      copyFileSync(source, join(directory, filename))
      success++
    } catch (error) {
      failed++
      console.warn('[Library] Export failed:', book.id, error)
    }
  }
  return { canceled: false, success, failed }
}

function getChaptersByBookIdMap(): Map<number, any[]> {
  if (chaptersByBookIdCache) return chaptersByBookIdCache
  const startedAt = performance.now()
  const map = new Map<number, any[]>()
  for (const chapter of readJsonEntity('chapters', []) as any[]) {
    const bookId = Number(chapter.bookId)
    if (!Number.isFinite(bookId)) continue
    const list = map.get(bookId) || []
    list.push(chapter)
    map.set(bookId, list)
  }
  for (const list of Array.from(map.values())) {
    list.sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0))
  }
  chaptersByBookIdCache = map
  perfLog('chapters:index', startedAt, `books=${map.size}`)
  return map
}

function getChapterRowsForBook(bookId: number): any[] {
  return getChaptersByBookIdMap().get(bookId) || []
}

function chapterRowTextStorage(chapter: any): 'file_gzip' | 'inline' {
  const rawStorage = String(chapter.bodyTextStorage || (chapter.bodyTextPath ? 'file_gzip' : 'inline'))
  return rawStorage === 'file_gzip' ? 'file_gzip' : 'inline'
}

function chapterRowToMeta(chapter: any) {
  const storage = chapterRowTextStorage(chapter)
  const bodyTextPath = chapter.bodyTextPath ? String(chapter.bodyTextPath) : ''
  const inlineBody = String(chapter.bodyText || '')
  const missing = storage === 'file_gzip'
    ? (bodyTextPath ? 0 : 1)
    : (inlineBody ? 0 : 1)

  return {
    id: Number(chapter.id),
    title: String(chapter.title || ''),
    order_index: Number(chapter.orderIndex || 0),
    body_text_storage: storage,
    body_text_missing: missing,
    body_text_size: Number(chapter.bodyTextSize || inlineBody.length || 0),
  }
}

function chapterRowToContent(chapter: any) {
  const meta = chapterRowToMeta(chapter)
  const bodyTextPath = chapter.bodyTextPath ? String(chapter.bodyTextPath) : ''
  const bodyText = meta.body_text_storage === 'file_gzip' && bodyTextPath
    ? readChapterTextGzip(bodyTextPath)
    : String(chapter.bodyText || '')
  const missing = bodyText === null || bodyText === ''
  const readableText = missing ? EMPTY_CHAPTER_TEXT_PLACEHOLDER : bodyText
  return {
    ...meta,
    body: readableText ? textToHtml(readableText) : '',
    body_text: readableText,
    body_text_missing: missing ? 1 : 0,
    body_text_fallback: missing ? 'placeholder' : null,
  }
}

export {
  batchClassifyBooksJson,
  createBookChapterTextZip,
  createLocalSnapshot,
  deleteBookJson,
  deleteBooksJson,
  deleteLocalSnapshot,
  exportBooksJson,
  extractBookChapterTextZip,
  getBookChapterListJson,
  getBookIdsWithFileGzipChapters,
  getBookSummaryJson,
  getChapterContentBatchJson,
  getChapterTextExcerptJson,
  getMostRecentBookJson,
  getBookshelfBooksJson,
  getStorageSizeInfo,
  hasBookChapterTextFiles,
  importBookJson,
  initializeJsonStore,
  isBookSearchIndexReady,
  listLocalSnapshots,
  readJsonEntity,
  restoreLocalSnapshot,
  searchBookJson,
  updateBookJson,
  writeJsonEntity,
}

export type {
  BatchClassificationOperation,
  ImportBookResult,
  JsonEntityType,
  SnapshotManifest,
}
