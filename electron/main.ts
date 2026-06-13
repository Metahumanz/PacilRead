import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen } from 'electron'
import { dirname, join, extname, isAbsolute } from 'path'
import { is } from '@electron-toolkit/utils'
import { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, mkdirSync, renameSync, rmSync } from 'fs'
import { gzipSync, gunzipSync } from 'zlib'
import { createHash } from 'crypto'
import AdmZip from 'adm-zip'
import { parseTxt, parseEpub, parsePdf, type Chapter } from './parsers'
import { synthesizeEdgeTTS, EDGE_VOICES, synthesizeMimoStreaming } from './tts'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
let mimoAbortController: AbortController | null = null

const MIN_DISPLAY_REFRESH_RATE = 24
const MAX_DISPLAY_REFRESH_RATE = 360
const DEFAULT_DISPLAY_REFRESH_RATE = 60
const CHAPTER_TEXT_DIR = 'chapter_text'
const DATA_DIR = join(app.getPath('userData'), 'data')
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

const jsonEntityCache = new Map<JsonEntityType, unknown>()
let chaptersByBookIdCache: Map<number, any[]> | null = null

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

// ---- Window bounds persistence ----
const boundsFile = join(app.getPath('userData'), 'window-bounds.json')
function loadBounds(): Electron.Rectangle | null {
  try { if (existsSync(boundsFile)) return JSON.parse(readFileSync(boundsFile, 'utf8')) } catch {}
  return null
}
function saveBounds(): void {
  if (!mainWindow) return
  try {
    const b = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    writeFileSync(boundsFile, JSON.stringify(b))
  } catch {}
}

let lastDisplayRefreshRate = 0

function normalizeDisplayRefreshRate(value: unknown): number {
  const hz = Number(value)
  if (!Number.isFinite(hz) || hz < MIN_DISPLAY_REFRESH_RATE || hz > MAX_DISPLAY_REFRESH_RATE) {
    return DEFAULT_DISPLAY_REFRESH_RATE
  }
  return Math.round(hz)
}

function getCurrentDisplayRefreshRate(): number {
  try {
    const display = mainWindow && !mainWindow.isDestroyed()
      ? screen.getDisplayMatching(mainWindow.getBounds())
      : screen.getPrimaryDisplay()
    return normalizeDisplayRefreshRate(display.displayFrequency)
  } catch {
    return DEFAULT_DISPLAY_REFRESH_RATE
  }
}

function notifyDisplayRefreshRate(force = false): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const hz = getCurrentDisplayRefreshRate()
  if (!force && Math.abs(hz - lastDisplayRefreshRate) < 1) return
  lastDisplayRefreshRate = hz
  mainWindow.webContents.send('win:displayRefreshRateChanged', hz)
}

function saveBoundsAndNotifyDisplay(): void {
  saveBounds()
  notifyDisplayRefreshRate()
}

// ---- Migrate data from old EleWinReader installation ----
function migrateOldData(): void {
  const newUserData = app.getPath('userData')
  const newBoundsPath = join(newUserData, 'window-bounds.json')
  if (existsSync(newBoundsPath)) return

  const parentDir = join(newUserData, '..')
  const oldNames = ['EleWinReader', 'ele-win-reader']
  let oldUserData: string | null = null
  for (const name of oldNames) {
    const candidate = join(parentDir, name)
    if (existsSync(join(candidate, 'window-bounds.json'))) {
      oldUserData = candidate
      break
    }
  }
  if (!oldUserData) return

  console.log(`[Migration] Found old data at: ${oldUserData}`)
  try {
    // Ensure new directory exists
    if (!existsSync(newUserData)) mkdirSync(newUserData, { recursive: true })
    const src = join(oldUserData, 'window-bounds.json')
    const dst = join(newUserData, 'window-bounds.json')
    if (existsSync(src) && !existsSync(dst)) {
      copyFileSync(src, dst)
      console.log('[Migration] Copied: window-bounds.json')
    }
    console.log('[Migration] Data migration completed successfully')
  } catch (e) {
    console.error('[Migration] Failed to migrate old data:', e)
  }
}

// ---- Auto updater setup ----
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:status', { status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:status', { status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:status', { status: 'up-to-date' })
  })
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:status', { status: 'downloading', percent: Math.round(progress.percent) })
  })
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('updater:status', { status: 'downloaded' })
  })
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:status', { status: 'error', message: String(err) })
  })
}

function createWindow(): void {
  let saved = loadBounds()
  // Requirement 2: validate saved bounds against available screens
  if (saved) {
    const displays = screen.getAllDisplays()
    const target = displays.find(d => {
      const b = d.bounds
      return saved!.x >= b.x - 50 && saved!.x < b.x + b.width &&
             saved!.y >= b.y - 50 && saved!.y < b.y + b.height
    })
    if (!target) {
      const primary = screen.getPrimaryDisplay()
      const wa = primary.workArea
      const pw = Math.round(wa.width * 0.8)
      const ph = Math.round(wa.height * 0.8)
      saved = {
        x: wa.x + Math.round((wa.width - pw) / 2),
        y: wa.y + Math.round((wa.height - ph) / 2),
        width: pw, height: ph
      }
    } else {
      // Clamp size to not exceed the target screen's work area
      const wa = target.workArea
      saved.width = Math.min(saved.width, wa.width)
      saved.height = Math.min(saved.height, wa.height)
      // Clamp position so the window doesn't overflow
      if (saved.x + saved.width > wa.x + wa.width) saved.x = wa.x + wa.width - saved.width
      if (saved.y + saved.height > wa.y + wa.height) saved.y = wa.y + wa.height - saved.height
      if (saved.x < wa.x) saved.x = wa.x
      if (saved.y < wa.y) saved.y = wa.y
    }
  }
  mainWindow = new BrowserWindow({
    width: saved?.width || 1200,
    height: saved?.height || 800,
    x: saved?.x,
    y: saved?.y,
    minWidth: 300,
    minHeight: 300,
    show: true,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    icon: join(app.getAppPath(), 'public/icon.png'),
    backgroundMaterial: process.platform === 'win32' ? 'mica' : 'none',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  // mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('resize', saveBoundsAndNotifyDisplay)
  mainWindow.on('move', saveBoundsAndNotifyDisplay)
  mainWindow.on('close', saveBounds)
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('did-finish-load', () => notifyDisplayRefreshRate(true))
  
  // Send window state to renderer for custom window controls
  mainWindow.on('maximize', () => mainWindow?.webContents.send('win:isMaximized', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win:isMaximized', false))
  mainWindow.on('restore', () => mainWindow?.webContents.send('win:isMaximized', false))
  mainWindow.on('enter-full-screen', () => mainWindow?.webContents.send('win:isFullScreen', true))
  mainWindow.on('leave-full-screen', () => mainWindow?.webContents.send('win:isFullScreen', false))
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['VITE_DEV_SERVER_URL']) {
    mainWindow.loadURL(process.env['VITE_DEV_SERVER_URL'])
  } else if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
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

function textToHtml(text: string): string {
  return text
    .split(/\n/)
    .filter(l => l.trim())
    .map(l => `<p>${l.trim()}</p>`)
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
    zip.extractEntryTo(entry, dirname(absolutePath), false, true)
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
  const booksDir = join(app.getPath('userData'), 'books')
  mkdirSync(booksDir, { recursive: true })
  const originalName = safeAssetFileName(filePath)
  const filename = `book_${bookId}_${originalName}`
  copyFileSync(filePath, join(booksDir, filename))
  return filename
}

async function importBookJson(filePath: string): Promise<{ bookId: number; chapterCount: number }> {
  let bookId = 0
  try {
    const ext = extname(filePath).toLowerCase()
    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown'
    const parsed = parseBookNameAndAuthor(fileName)
    const title = parsed.title || fileName.replace(/\.[^/.]+$/, '')
    const author = parsed.author
    const readingStatsKey = buildReadingStatsKey(title, author)
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

    const books = readJsonEntity('books', []) as any[]
    const chapters = readJsonEntity('chapters', []) as any[]
    const now = Date.now()
    bookId = nextJsonId(books)
    let nextChapterId = nextJsonId(chapters)
    const sourceFile = copyImportedBookSource(bookId, filePath)
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
    })

    writeJsonEntity('books', books)
    writeJsonEntity('chapters', [...chapters, ...chapterRows])
    return { bookId, chapterCount: chapterRows.length }
  } catch (error) {
    if (bookId > 0) {
      rmSync(getBookChapterTextDir(bookId), { recursive: true, force: true })
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
    progressIndex,
    progressOffset: Number(book.progressOffset || 0),
    lastReadAt: Number(book.lastReadAt || 0),
    pinned: Boolean(book.pinned),
    currentChapterTitle: String(currentChapter?.title || book.currentChapterTitle || ''),
    chapterCount,
    coverFile: book.coverFile === undefined || book.coverFile === null ? null : String(book.coverFile),
    sourceFile: book.sourceFile === undefined || book.sourceFile === null ? null : String(book.sourceFile),
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
  ])
  const books = readJsonEntity('books', []) as any[]
  const idx = books.findIndex(book => Number(book.id) === Number(bookId))
  if (idx < 0) return null

  const next = { ...books[idx] }
  for (const [key, value] of Object.entries(fields || {})) {
    if (!allowedFields.has(key)) continue
    next[key] = value
  }
  next.updatedAt = Date.now()
  books[idx] = next
  writeJsonEntity('books', books)
  const result = bookRowToSummary(next)
  perfLog('library:updateBook', startedAt, `book=${bookId}`)
  return result
}

function deleteBookJson(bookId: number): { success: boolean } {
  const books = readJsonEntity('books', []) as any[]
  const target = books.find(book => Number(book.id) === bookId)
  writeJsonEntity('books', books.filter(book => Number(book.id) !== bookId))
  writeJsonEntity('chapters', (readJsonEntity('chapters', []) as any[]).filter(chapter => Number(chapter.bookId) !== bookId))
  writeJsonEntity('rules', (readJsonEntity('rules', []) as any[]).filter(rule => Number(rule.bookId) !== bookId))
  writeJsonEntity('bookmarks', (readJsonEntity('bookmarks', []) as any[]).filter(bookmark => Number(bookmark.bookId) !== bookId))
  rmSync(getBookChapterTextDir(bookId), { recursive: true, force: true })
  if (target?.sourceFile) {
    rmSync(join(app.getPath('userData'), 'books', safeAssetFileName(String(target.sourceFile))), { force: true })
  }
  return { success: true }
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

// Requirement 1: Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  migrateOldData()
  createWindow()
  screen.on('display-added', () => notifyDisplayRefreshRate(true))
  screen.on('display-removed', () => notifyDisplayRefreshRate(true))
  screen.on('display-metrics-changed', () => notifyDisplayRefreshRate(true))
  try {
    initializeJsonStore()
    console.log('JSON data store initialized successfully')
  } catch (error) {
    console.error('JSON data store init failed:', String(error))
    dialog.showErrorBox('数据初始化失败', String(error))
  }
  setupAutoUpdater()

  // Clean up old updater files
  try {
    const { rmSync } = require('fs')
    const updaterCacheDirs = [
      join(app.getPath('userData'), '../pacil-read-updater'),
      join(app.getPath('userData'), '../ele-win-reader-updater')
    ]
    for (const dir of updaterCacheDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
        console.log('Cleaned up old updater cache:', dir)
      }
    }
  } catch (e) { console.error('Failed to clean updater cache:', e) }

  // Check for updates on startup (silent)
  if (!is.dev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  saveBounds()
  if (process.platform !== 'darwin') app.quit()
})

// ---- IPC handlers ----
ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'E-books', extensions: ['txt', 'epub', 'pdf'] }, { name: 'All Files', extensions: ['*'] }] })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('dialog:openImage', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'] }] })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('win:setAspectRatio', async (_, ratio: number) => {
  // We explicitly do not call setAspectRatio(ratio) to avoid locking the window.
  // We only resize it to match the ratio once upon user request.
  if (mainWindow) { const [w] = mainWindow.getSize(); mainWindow.setSize(w, Math.round(w / ratio)) }
})

ipcMain.handle('win:setFullScreen', async (_, isFull: boolean) => {
  if (mainWindow) {
    mainWindow.setFullScreen(isFull)
  }
})

ipcMain.handle('win:setAlwaysOnTop', async (_, isTop: boolean) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(isTop)
  }
})

// Requirement 4: hide/show titlebar (no-op since we use custom buttons now, but kept for compatibility)
ipcMain.handle('win:setControlsVisible', async (_, visible: boolean) => {
  // titleBarOverlay is disabled, so we only need to return if the frontend should hide buttons
  return visible
})

ipcMain.handle('win:minimize', () => mainWindow?.minimize())
ipcMain.handle('win:toggleMaximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('win:close', () => mainWindow?.close())
ipcMain.handle('win:getIsMaximized', () => mainWindow?.isMaximized() || false)
ipcMain.handle('win:getDisplayRefreshRate', () => getCurrentDisplayRefreshRate())

ipcMain.handle('font:getSystemFonts', async () => {
  if (process.platform !== 'win32') return []
  const { execSync } = require('child_process')
  try {
    const cmd = 'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
    const output = execSync(`powershell -command "${cmd}"`, { encoding: 'utf8', timeout: 15000 })
    return output.split(/\r?\n/).filter((f: string) => f.trim()).sort()
  } catch (e) { console.error('Font error:', e); return [] }
})

ipcMain.handle('updater:check', async () => {
  try { await autoUpdater.checkForUpdates(); return true } catch (e) { return false }
})

ipcMain.handle('updater:download', async () => {
  try { await autoUpdater.downloadUpdate(); return true } catch (e) { return false }
})

ipcMain.handle('updater:install', async (_, silent?: boolean) => {
  autoUpdater.quitAndInstall(silent === true, true)
})

ipcMain.handle('app:getVersion', async () => app.getVersion())
ipcMain.handle('app:getPath', async (_, name: any) => app.getPath(name))
ipcMain.handle('app:quit', async () => app.quit())

ipcMain.handle('library:importBook', async (_, filePath: string) => importBookJson(filePath))
ipcMain.handle('library:deleteBook', async (_, bookId: number) => deleteBookJson(bookId))
ipcMain.handle('library:getBookshelfBooks', async () => getBookshelfBooksJson())
ipcMain.handle('library:getBookSummary', async (_, bookId: number) => getBookSummaryJson(bookId))
ipcMain.handle('library:getMostRecentBook', async () => getMostRecentBookJson())
ipcMain.handle('library:updateBook', async (_, bookId: number, fields: Record<string, unknown>) => updateBookJson(bookId, fields))
ipcMain.handle('library:getBookChapterList', async (_, bookId: number) => getBookChapterListJson(bookId))
ipcMain.handle('library:getChapterContentBatch', async (_, bookId: number, chapterIds: number[]) => getChapterContentBatchJson(bookId, chapterIds))
ipcMain.handle('library:getSize', async () => getStorageSizeInfo())
ipcMain.handle('library:getBookIdsWithFileGzipChapters', async () => getBookIdsWithFileGzipChapters())
ipcMain.handle('library:hasBookChapterTextFiles', async (_, bookId: number) => hasBookChapterTextFiles(bookId))
ipcMain.handle('library:createBookChapterTextZip', async (_, bookId: number) => createBookChapterTextZip(bookId))
ipcMain.handle('library:extractBookChapterTextZip', async (_, zipPath: string) => extractBookChapterTextZip(zipPath))

ipcMain.handle('webdav:uploadFile', async (_, localPath: string, remoteUrl: string, auth: string) => {
  try {
    const data = readFileSync(localPath)
    const res = await fetch(remoteUrl, {
      method: 'PUT',
      headers: { 'Authorization': `Basic ${auth}` },
      body: data
    })
    return { success: res.ok, status: res.status }
  } catch (error: any) {
    return { success: false, error: error.message || String(error) }
  }
})

ipcMain.handle('webdav:downloadFile', async (_, remoteUrl: string, localPath: string, auth: string) => {
  try {
    const res = await fetch(remoteUrl, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buffer = await res.arrayBuffer()
    mkdirSync(dirname(localPath), { recursive: true })
    writeFileSync(localPath, Buffer.from(buffer))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || String(error) }
  }
})

ipcMain.handle('fs:copyCover', async (_, sourcePath: string) => {
  try {
    const ext = extname(sourcePath).toLowerCase()
    const coversDir = join(app.getPath('userData'), 'covers')
    if (!existsSync(coversDir)) mkdirSync(coversDir, { recursive: true })
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    const filename = `manual_${uniqueId}${ext}`
    const destPath = join(coversDir, filename)
    copyFileSync(sourcePath, destPath)
    return { success: true, filename }
  } catch (error: any) {
    return { success: false, error: error.message || String(error) }
  }
})

ipcMain.handle('webdav:request', async (_, opts: { url: string; method: string; headers?: any; body?: string }) => {
  try {
    const res = await fetch(opts.url, {
      method: opts.method,
      headers: opts.headers || {},
      body: opts.body
    })
    const text = await res.text()
    return { status: res.status, data: text }
  } catch (error: any) {
    return { error: error.message || String(error) }
  }
})

ipcMain.handle('tts:getEdgeVoices', async () => {
  return EDGE_VOICES
})

ipcMain.handle('tts:synthesize', async (_, args: { text: string; voice?: string; rate?: number }) => {
  try {
    const buffer = await synthesizeEdgeTTS(args.text, args.voice, args.rate)
    console.log(`[TTS IPC] Synthesized ${buffer.length} bytes for: "${args.text.substring(0, 30)}..."`)
    // Return as Uint8Array — Electron IPC serializes this correctly
    return { success: true, audioBuffer: new Uint8Array(buffer) }
  } catch (err: any) {
    console.error('TTS error:', err)
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('tts:start-mimo', async (event, args: { text: string; apiKey: string; voice?: string }) => {
  if (mimoAbortController) mimoAbortController.abort()
  mimoAbortController = new AbortController()

  synthesizeMimoStreaming(
    args.text,
    args.apiKey,
    args.voice,
    (chunk) => {
      event.sender.send('tts:mimo-chunk', new Uint8Array(chunk))
    },
    () => {
      event.sender.send('tts:mimo-done')
      mimoAbortController = null
    },
    (err) => {
      event.sender.send('tts:mimo-error', String(err))
      mimoAbortController = null
    },
    mimoAbortController.signal
  )
})

ipcMain.handle('tts:stop-mimo', async () => {
  if (mimoAbortController) {
    mimoAbortController.abort()
    mimoAbortController = null
  }
})

// ---- v8 JSON data IPC handlers ----
const ENTITY_DEFAULTS: Record<string, unknown> = {
  books: [],
  chapters: [],
  rules: [],
  themes: [],
  bookmarks: [],
  readingStats: [],
  settings: {},
}

ipcMain.handle('data:readEntity', async (_, entityType: string) => {
  if (!(entityType in ENTITY_DEFAULTS)) throw new Error(`Unknown entity type: ${entityType}`)
  return readJsonEntity(entityType as keyof typeof JSON_FILES, ENTITY_DEFAULTS[entityType])
})

ipcMain.handle('data:writeEntity', async (_, entityType: string, data: unknown) => {
  if (!(entityType in JSON_FILES)) throw new Error(`Unknown entity type: ${entityType}`)
  writeJsonEntity(entityType as keyof typeof JSON_FILES, data)
})

