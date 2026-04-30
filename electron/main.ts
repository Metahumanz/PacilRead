import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen } from 'electron'
import { dirname, join, extname } from 'path'
import { is } from '@electron-toolkit/utils'
import initSqlJs, { Database } from 'sql.js'
import { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'fs'
import { gzipSync, gunzipSync } from 'zlib'
import { createHash } from 'crypto'
import { parseTxt, parseEpub, parsePdf, stripHtmlTags, type Chapter } from './parsers'
import { synthesizeEdgeTTS, EDGE_VOICES, synthesizeMimoStreaming } from './tts'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
let db: Database | null = null
let SQL: any = null
let dbPath: string = ''
let mimoAbortController: AbortController | null = null

const CHAPTER_TEXT_DIR = 'chapter_text'

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

// ---- Migrate data from old EleWinReader installation ----
function migrateOldData(): void {
  const newUserData = app.getPath('userData')
  const newDbPath = join(newUserData, 'reader.db')
  // If the new location already has a database, skip migration
  if (existsSync(newDbPath)) return

  // Possible old userData directories (production: EleWinReader, dev: ele-win-reader)
  const parentDir = join(newUserData, '..')
  const oldNames = ['EleWinReader', 'ele-win-reader']
  let oldUserData: string | null = null
  for (const name of oldNames) {
    const candidate = join(parentDir, name)
    if (existsSync(join(candidate, 'reader.db'))) {
      oldUserData = candidate
      break
    }
  }
  if (!oldUserData) return

  console.log(`[Migration] Found old data at: ${oldUserData}`)
  try {
    // Ensure new directory exists
    if (!existsSync(newUserData)) mkdirSync(newUserData, { recursive: true })
    // Copy key files
    const filesToMigrate = ['reader.db', 'window-bounds.json']
    for (const file of filesToMigrate) {
      const src = join(oldUserData, file)
      const dst = join(newUserData, file)
      if (existsSync(src) && !existsSync(dst)) {
        copyFileSync(src, dst)
        console.log(`[Migration] Copied: ${file}`)
      }
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
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)
  
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

function saveDatabase(): void {
  if (db) { writeFileSync(dbPath, Buffer.from(db.export())) }
}

function getWasmPath(): string {
  const wasmFileName = 'sql-wasm.wasm'
  const paths = [
    join(process.resourcesPath, 'sql.js', wasmFileName),
    join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', wasmFileName),
    join(app.getAppPath(), 'node_modules/sql.js/dist/', wasmFileName),
    join(process.cwd(), 'node_modules/sql.js/dist/', wasmFileName),
    join(__dirname, '../node_modules/sql.js/dist/', wasmFileName),
    join(__dirname, '../../node_modules/sql.js/dist/', wasmFileName)
  ]
  for (const p of paths) { if (existsSync(p)) return p }
  throw new Error(`WASM not found. Tried:\n${paths.join('\n')}`)
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

function getChapterTextRelativePath(bookId: number, chapterId: number): string {
  return `book_${bookId}/chapter_${chapterId}.txt.gz`
}

function getChapterTextAbsolutePath(relativePath: string): string {
  const safePath = normalizeChapterTextRelativePath(relativePath)
  if (!safePath) throw new Error(`Invalid chapter text path: ${relativePath}`)
  return join(getChapterTextRoot(), ...safePath.split('/'))
}

function getBookChapterTextDir(bookId: number): string {
  return join(getChapterTextRoot(), `book_${bookId}`)
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

function readChapterTextGzip(relativePath: unknown): string | null {
  const safePath = normalizeChapterTextRelativePath(relativePath)
  if (!safePath) return null

  const absolutePath = getChapterTextAbsolutePath(safePath)
  if (!existsSync(absolutePath)) return null

  try {
    return gunzipSync(readFileSync(absolutePath)).toString('utf8')
  } catch (error) {
    console.error('[DB] Failed to read chapter text file:', safePath, error)
    return null
  }
}

function getReadableChapterText(chapter: any): { bodyText: string; missing: boolean } {
  const storage = String(chapter.body_text_storage || 'db')
  if (storage === 'file_gzip' && chapter.body_text_path) {
    const fileText = readChapterTextGzip(chapter.body_text_path)
    if (fileText !== null) return { bodyText: fileText, missing: false }
  }

  const inlineText = String(chapter.body_text || '')
  if (inlineText) return { bodyText: inlineText, missing: false }

  return { bodyText: '', missing: true }
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

function getStorageSizeInfo(): { sizeBytes: number; databaseBytes: number; chapterTextBytes: number; totalBytes: number } {
  let databaseBytes = 0
  try {
    databaseBytes = statSync(dbPath).size
  } catch {}
  const chapterTextBytes = directorySizeBytes(getChapterTextRoot())
  return {
    sizeBytes: databaseBytes,
    databaseBytes,
    chapterTextBytes,
    totalBytes: databaseBytes + chapterTextBytes
  }
}

function listFilesRecursive(rootPath: string, prefix = ''): Array<{ relativePath: string; localPath: string; sizeBytes: number }> {
  if (!existsSync(rootPath)) return []
  const files: Array<{ relativePath: string; localPath: string; sizeBytes: number }> = []
  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const localPath = join(rootPath, entry.name)
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(localPath, relativePath))
    } else if (entry.isFile()) {
      files.push({ relativePath, localPath, sizeBytes: statSync(localPath).size })
    }
  }
  return files
}

function getCurrentUserVersion(database: Database): number {
  try {
    const result = database.exec('PRAGMA user_version')
    if (result.length > 0 && result[0].values.length > 0) {
      return Number(result[0].values[0][0]) || 0
    }
  } catch (_) {}
  return 0
}

function createChaptersTable(database: Database, tableName = 'chapters'): void {
  database.run(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body_html TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL,
    body_text_path TEXT,
    body_text_storage TEXT NOT NULL DEFAULT 'db',
    body_text_size INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
  )`)
}

function ensureChapterV7Columns(database: Database): void {
  const addColumn = (column: string, sql: string) => {
    const columns = getTableColumns(database, 'chapters')
    if (!columns.includes(column)) database.run(sql)
  }

  addColumn('body_text', "ALTER TABLE chapters ADD COLUMN body_text TEXT NOT NULL DEFAULT ''")
  addColumn('body_html', "ALTER TABLE chapters ADD COLUMN body_html TEXT NOT NULL DEFAULT ''")
  addColumn('body_text_path', 'ALTER TABLE chapters ADD COLUMN body_text_path TEXT')
  addColumn('body_text_storage', "ALTER TABLE chapters ADD COLUMN body_text_storage TEXT NOT NULL DEFAULT 'db'")
  addColumn('body_text_size', 'ALTER TABLE chapters ADD COLUMN body_text_size INTEGER NOT NULL DEFAULT 0')
}

function backfillChapterTextFromLegacyColumns(database: Database): number {
  const columns = getTableColumns(database, 'chapters')
  const bodyExpression = columns.includes('body') ? 'body' : "'' AS body"
  const bodyHtmlExpression = columns.includes('body_html') ? 'body_html' : "'' AS body_html"
  const rows = queryRows(
    database,
    `SELECT id, body_text, ${bodyExpression}, ${bodyHtmlExpression}
     FROM chapters
     WHERE (body_text IS NULL OR body_text = '')`
  )

  let updated = 0
  for (const row of rows) {
    const bodyHtml = String(row.body_html || '')
    const body = String(row.body || '')
    const bodyText = bodyHtml ? stripHtmlTags(bodyHtml) : (body ? stripHtmlTags(body) : '')
    if (!bodyText) continue
    database.run('UPDATE chapters SET body_text = ? WHERE id = ?', [bodyText, row.id])
    updated += database.getRowsModified()
  }
  return updated
}

function rebuildChaptersTableToV7(database: Database): boolean {
  const desiredColumns = [
    'id',
    'book_id',
    'title',
    'body_html',
    'body_text',
    'order_index',
    'body_text_path',
    'body_text_storage',
    'body_text_size'
  ]
  const columns = getTableColumns(database, 'chapters')
  const needsRebuild = columns.length !== desiredColumns.length ||
    columns.some(column => !desiredColumns.includes(column)) ||
    desiredColumns.some(column => !columns.includes(column))
  if (!needsRebuild) return false

  database.run('PRAGMA foreign_keys = OFF')
  database.run('DROP TABLE IF EXISTS chapters_v7_old')
  database.run('ALTER TABLE chapters RENAME TO chapters_v7_old')
  createChaptersTable(database, 'chapters')
  database.run(`INSERT INTO chapters (
      id, book_id, title, body_html, body_text, order_index,
      body_text_path, body_text_storage, body_text_size
    )
    SELECT
      id,
      book_id,
      title,
      COALESCE(body_html, ''),
      COALESCE(body_text, ''),
      order_index,
      body_text_path,
      COALESCE(NULLIF(body_text_storage, ''), 'db'),
      COALESCE(body_text_size, 0)
    FROM chapters_v7_old`)
  database.run('DROP TABLE chapters_v7_old')
  database.run('PRAGMA foreign_keys = ON')
  return true
}

function recoverInterruptedChapterRebuild(database: Database): void {
  if (!tableExists(database, 'chapters') && tableExists(database, 'chapters_v7_old')) {
    database.run('ALTER TABLE chapters_v7_old RENAME TO chapters')
  }
}

function runV7Migration(
  database: Database,
  onProgress?: (step: number, total: number, message: string) => void
): { migrated: boolean } {
  const currentVersion = getCurrentUserVersion(database)

  const totalSteps = 5
  let step = 0
  const progress = (message: string) => {
    step++
    onProgress?.(step, totalSteps, message)
  }

  console.log(`[DB Migration] Ensuring v7 schema (current user_version = ${currentVersion})`)
  try {
    progress('正在补齐 v7 正文字段...')
    ensureChapterV7Columns(database)

    progress('正在从旧正文列回填纯文本...')
    const backfilled = backfillChapterTextFromLegacyColumns(database)

    progress('正在清理 body_html 与存储状态...')
    database.run("UPDATE chapters SET body_html = '' WHERE body_html IS NOT NULL AND body_html <> ''")
    database.run("UPDATE chapters SET body_text_storage = 'db' WHERE body_text_storage IS NULL OR body_text_storage = ''")
    database.run(`UPDATE chapters
      SET body_text_size = length(CAST(body_text AS BLOB))
      WHERE (body_text_size IS NULL OR body_text_size = 0)
        AND body_text IS NOT NULL
        AND body_text <> ''`)

    progress('正在移除旧版冗余列...')
    const rebuilt = rebuildChaptersTableToV7(database)

    progress('正在设置数据库版本号...')
    database.run('PRAGMA user_version = 7')

    database.run('CREATE INDEX IF NOT EXISTS idx_chapters_book_order ON chapters(book_id, order_index)')
    console.log('[DB Migration] v7 schema ready')
    return { migrated: currentVersion < 7 || backfilled > 0 || rebuilt }
  } catch (e) {
    console.error('[DB Migration] v7 migration error:', e)
    throw e
  }
}

function runDatabaseMigrations(database: Database): void {
  database.run(`CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, author TEXT, cover_path TEXT, path TEXT,
    progress_index INTEGER DEFAULT 0, progress_offset INTEGER DEFAULT 0,
    last_read DATETIME DEFAULT CURRENT_TIMESTAMP, source_id INTEGER,
    pinned INTEGER DEFAULT 0, reading_stats_key TEXT NOT NULL DEFAULT ''
  )`)
  try { database.run('ALTER TABLE books ADD COLUMN pinned INTEGER DEFAULT 0') } catch (_) {}
  try { database.run("ALTER TABLE books ADD COLUMN reading_stats_key TEXT NOT NULL DEFAULT ''") } catch (_) {}
  database.run('CREATE INDEX IF NOT EXISTS idx_books_reading_stats_key ON books (reading_stats_key)')

  recoverInterruptedChapterRebuild(database)
  createChaptersTable(database)
  database.run('CREATE INDEX IF NOT EXISTS idx_chapters_book_order ON chapters(book_id, order_index)')

  database.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`)
  database.run(`CREATE TABLE IF NOT EXISTS replacement_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL, replacement TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global', book_id INTEGER,
    is_regex INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
  )`)
  try { database.run('ALTER TABLE replacement_rules ADD COLUMN book_id INTEGER') } catch (_) {}

  database.run(`CREATE TABLE IF NOT EXISTS reading_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source_device_id TEXT NOT NULL,
    book_identity TEXT NOT NULL,
    book_title TEXT NOT NULL,
    book_author TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`)
  database.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_stats_bucket ON reading_stats (source_device_id, date, book_identity)')
  database.run('CREATE INDEX IF NOT EXISTS idx_reading_stats_date ON reading_stats (date)')
  database.run('CREATE INDEX IF NOT EXISTS idx_reading_stats_identity ON reading_stats (book_identity)')

  database.run(`CREATE TABLE IF NOT EXISTS bookmarks (
    uuid TEXT PRIMARY KEY,
    book_id INTEGER,
    book_identity TEXT NOT NULL,
    book_title TEXT NOT NULL,
    book_author TEXT,
    chapter_order_index INTEGER NOT NULL DEFAULT 0,
    chapter_title TEXT NOT NULL DEFAULT '',
    chapter_offset INTEGER NOT NULL DEFAULT 0,
    progress_percent INTEGER NOT NULL DEFAULT 0,
    summary TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE SET NULL
  )`)
  database.run('CREATE INDEX IF NOT EXISTS idx_bookmarks_book_identity ON bookmarks (book_identity)')
  database.run('CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON bookmarks (book_id)')

  // ---- v7 schema migration ----
  runV7Migration(database)

  // Existing title/author normalization
  try {
    const books = database.exec('SELECT id, title, author, reading_stats_key FROM books')
    if (books.length > 0) {
      const { values } = books[0]
      for (const row of values) {
        const id = row[0] as number
        const oldTitle = row[1] as string
        const oldAuthor = row[2] as string | null
        const oldReadingStatsKey = row[3] as string | null

        let nextTitle = oldTitle
        let nextAuthor = oldAuthor

        if (!oldAuthor || oldAuthor === '未知' || oldTitle.includes('作者') || oldTitle.includes('《') || oldTitle.includes('(') || oldTitle.includes('（')) {
          const parsed = parseBookNameAndAuthor(oldTitle)
          if (parsed.title !== oldTitle || parsed.author) {
            nextTitle = parsed.title
            nextAuthor = parsed.author || oldAuthor
          }
        }

        const nextReadingStatsKey = oldReadingStatsKey || buildReadingStatsKey(nextTitle, nextAuthor)

        if (nextTitle !== oldTitle || nextAuthor !== oldAuthor || nextReadingStatsKey !== oldReadingStatsKey) {
          database.run(
            'UPDATE books SET title = ?, author = ?, reading_stats_key = ? WHERE id = ?',
            [nextTitle, nextAuthor, nextReadingStatsKey, id]
          )
        }
      }
    }
  } catch (_) {}
}

async function initDatabase(): Promise<void> {
  const wasmPath = getWasmPath()
  const wasmBuffer = readFileSync(wasmPath)
  SQL = await initSqlJs({ wasmBinary: wasmBuffer.buffer })
  dbPath = join(app.getPath('userData'), 'reader.db')
  db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database()

  runDatabaseMigrations(db)

  saveDatabase()
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
  try {
    await initDatabase()
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Database init failed:', String(error))
    dialog.showErrorBox('数据库初始化失败', String(error))
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
  saveDatabase()
  if (process.platform !== 'darwin') app.quit()
})

// ---- IPC handlers ----
ipcMain.handle('db:query', async (_, sql: string, params?: any[]) => {
  if (!db) throw new Error('Database not initialized')
  try {
    const t = sql.trim().toUpperCase()
    if (t.startsWith('SELECT')) {
      const result = db.exec(sql, params || [])
      if (result.length === 0) return []
      const { columns, values } = result[0]
      return values.map(row => { const o: any = {}; columns.forEach((c, i) => o[c] = row[i]); return o })
    } else {
      db.run(sql, params || [])
      saveDatabase()
      const r = db.exec('SELECT last_insert_rowid() as id')
      return { lastInsertRowid: r[0]?.values[0]?.[0] || 0, changes: db.getRowsModified() }
    }
  } catch (error) { console.error('DB error:', error); throw error }
})

ipcMain.handle('db:importBook', async (_, filePath: string) => {
  if (!db) throw new Error('Database not initialized')
  let bookId: number | null = null
  try {
    const ext = extname(filePath).toLowerCase()
    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown'
    const parsed = parseBookNameAndAuthor(fileName)
    const title = parsed.title || fileName.replace(/\.[^/.]+$/, '')
    const author = parsed.author
    const readingStatsKey = buildReadingStatsKey(title, author)
    let chapters: Chapter[]
    let coverBuffer: Buffer | undefined
    let coverExtension: string | undefined
    if (ext === '.txt') {
      chapters = parseTxt(filePath)
    } else if (ext === '.epub') {
      const epubResult = await parseEpub(filePath)
      chapters = epubResult.chapters
      coverBuffer = epubResult.coverBuffer
      coverExtension = epubResult.coverExtension
    } else if (ext === '.pdf') {
      chapters = await parsePdf(filePath)
    } else {
      throw new Error(`Unsupported: ${ext}`)
    }

    db.run('BEGIN TRANSACTION')
    try {
      db.run(
        'INSERT INTO books (title, author, path, last_read, reading_stats_key) VALUES (?, ?, ?, ?, ?)',
        [title, author, filePath, new Date().toISOString(), readingStatsKey]
      )
      const result = db.exec('SELECT last_insert_rowid() as id')
      bookId = result[0].values[0][0] as number

      if (coverBuffer && coverExtension) {
        try {
          const coversDir = join(app.getPath('userData'), 'covers')
          if (!existsSync(coversDir)) mkdirSync(coversDir, { recursive: true })
          const coverFilename = `epub_cover_${bookId}.${coverExtension}`
          const coverDestPath = join(coversDir, coverFilename)
          writeFileSync(coverDestPath, coverBuffer)
          const coverUrl = 'file:///' + coverDestPath.replace(/\\/g, '/')
          db.run('UPDATE books SET cover_path = ? WHERE id = ?', [coverUrl, bookId])
        } catch (e) { console.error('Failed to save EPUB cover:', e) }
      }

      for (const ch of chapters) {
        const bodyText = ch.bodyText || ''
        const bodyTextSize = Buffer.byteLength(bodyText, 'utf8')
        db.run(
          `INSERT INTO chapters (
            book_id, title, body_html, body_text, order_index,
            body_text_storage, body_text_size
          ) VALUES (?, ?, '', ?, ?, 'db', ?)`,
          [bookId, ch.title, bodyText, ch.orderIndex, bodyTextSize]
        )
        const chapterIdResult = db.exec('SELECT last_insert_rowid() as id')
        const chapterId = Number(chapterIdResult[0].values[0][0])
        const stored = writeChapterTextGzip(bookId, chapterId, bodyText)
        db.run(
          `UPDATE chapters
           SET body_text = '',
             body_text_path = ?,
             body_text_storage = 'file_gzip',
             body_text_size = ?,
             body_html = ''
           WHERE id = ?`,
          [stored.relativePath, stored.sizeBytes, chapterId]
        )
      }

      db.run('COMMIT')
    } catch (error) {
      try { db.run('ROLLBACK') } catch {}
      if (bookId !== null) {
        rmSync(getBookChapterTextDir(bookId), { recursive: true, force: true })
      }
      throw error
    }

    if (bookId === null) throw new Error('导入失败：未生成书籍 ID')
    saveDatabase()
    return { bookId, chapterCount: chapters.length }
  } catch (error) { console.error('Import error:', error); throw error }
})

ipcMain.handle('dialog:openFile', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'E-books', extensions: ['txt', 'epub', 'pdf'] }, { name: 'All Files', extensions: ['*'] }] })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('dialog:openImage', async () => {
  const r = await dialog.showOpenDialog(mainWindow!, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'] }] })
  return r.canceled ? null : r.filePaths[0]
})

ipcMain.handle('shell:openPath', async (_, path: string) => shell.openPath(path))

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
ipcMain.handle('db:getSize', async () => {
  saveDatabase()
  return getStorageSizeInfo()
})

ipcMain.handle('db:getBookChapters', async (_, bookId: number) => {
  if (!db) throw new Error('Database not initialized')
  const rows = queryRows(
    db,
    `SELECT id, book_id, title, body_html, body_text, order_index,
      body_text_path, body_text_storage, body_text_size
     FROM chapters
     WHERE book_id = ?
     ORDER BY order_index`,
    [bookId]
  )

  return rows.map(row => {
    const readable = getReadableChapterText(row)
    return {
      id: Number(row.id),
      title: String(row.title || ''),
      order_index: Number(row.order_index || 0),
      body: readable.bodyText ? textToHtml(readable.bodyText) : '',
      body_text: readable.bodyText,
      body_text_storage: String(row.body_text_storage || 'db'),
      body_text_missing: readable.missing ? 1 : 0
    }
  })
})

ipcMain.handle('db:optimizeStorage', async (event) => {
  if (!db) throw new Error('Database not initialized')
  runV7Migration(db)
  saveDatabase()
  const before = getStorageSizeInfo()
  const rows = queryRows(
    db,
    `SELECT id, book_id, body_text
     FROM chapters
     WHERE COALESCE(body_text_storage, 'db') = 'db'
       AND body_text IS NOT NULL
       AND body_text <> ''
     ORDER BY book_id, order_index`
  )

  const total = rows.length + 4
  let step = 0
  const progress = (message: string) => {
    step += 1
    event.sender.send('db:optimize-progress', { step, total, message })
  }

  let optimizedChapters = 0
  for (const row of rows) {
    const chapterId = Number(row.id)
    const bookId = Number(row.book_id)
    const bodyText = String(row.body_text || '')
    const stored = writeChapterTextGzip(bookId, chapterId, bodyText)
    db.run(
      `UPDATE chapters
       SET body_text = '',
         body_text_path = ?,
         body_text_storage = 'file_gzip',
         body_text_size = ?,
         body_html = ''
       WHERE id = ?`,
      [stored.relativePath, stored.sizeBytes, chapterId]
    )
    optimizedChapters += db.getRowsModified()
    progress(`正在外置章节正文 ${optimizedChapters}/${rows.length}`)
  }

  progress('正在清理 body_html...')
  db.run("UPDATE chapters SET body_html = '' WHERE body_html IS NOT NULL AND body_html <> ''")
  const clearedBodyHtml = db.getRowsModified()

  progress('正在同步数据库状态...')
  try { db.run('PRAGMA wal_checkpoint(TRUNCATE)') } catch (_) {}

  progress('正在回收 reader.db 空间...')
  try { db.run('VACUUM') } catch (error) { console.error('[DB] VACUUM failed:', error) }

  progress('正在刷新空间统计...')
  saveDatabase()
  const after = getStorageSizeInfo()
  return { optimizedChapters, clearedBodyHtml, before, after }
})

ipcMain.handle('db:export', async () => {
  if (!db) throw new Error('Database not initialized')
  const data = db.export()
  const tempPath = join(app.getPath('temp'), `pacilread_export_${Date.now()}.db`)
  writeFileSync(tempPath, Buffer.from(data))
  return tempPath
})

ipcMain.handle('db:exportLite', async () => {
  if (!db || !SQL) throw new Error('Database not initialized')
  // Clone current database
  const data = db.export()
  const tempDb = new SQL.Database(data)
  try {
    runDatabaseMigrations(tempDb)
    tempDb.run("UPDATE chapters SET body_text = '', body_html = ''")
    tempDb.run('VACUUM')
  } catch (e) {
    console.error('Lite export cleanup failed:', e)
  }
  const liteData = tempDb.export()
  const tempPath = join(app.getPath('temp'), `pacilread_lite_${Date.now()}.db`)
  writeFileSync(tempPath, Buffer.from(liteData))
  tempDb.close()
  return tempPath
})

ipcMain.handle('db:deleteBook', async (_, bookId: number) => {
  if (!db) throw new Error('Database not initialized')
  db.run('BEGIN TRANSACTION')
  try {
    db.run('DELETE FROM replacement_rules WHERE book_id = ?', [bookId])
    db.run('DELETE FROM bookmarks WHERE book_id = ?', [bookId])
    db.run('DELETE FROM chapters WHERE book_id = ?', [bookId])
    db.run('DELETE FROM books WHERE id = ?', [bookId])
    db.run('COMMIT')
  } catch (error) {
    try { db.run('ROLLBACK') } catch {}
    throw error
  }
  rmSync(getBookChapterTextDir(bookId), { recursive: true, force: true })
  saveDatabase()
  return { success: true }
})

ipcMain.handle('db:listChapterTextFiles', async () => {
  return listFilesRecursive(getChapterTextRoot())
})

ipcMain.handle('db:getRequiredChapterTextFiles', async () => {
  if (!db) throw new Error('Database not initialized')
  const rows = queryRows(
    db,
    `SELECT DISTINCT body_text_path AS relativePath
     FROM chapters
     WHERE body_text_storage = 'file_gzip'
       AND body_text_path IS NOT NULL
       AND body_text_path <> ''
     ORDER BY body_text_path`
  )

  return rows
    .map(row => normalizeChapterTextRelativePath(row.relativePath))
    .filter((relativePath): relativePath is string => Boolean(relativePath))
    .map(relativePath => ({
      relativePath,
      localPath: getChapterTextAbsolutePath(relativePath)
    }))
})

ipcMain.handle('db:getMissingChapterTextFiles', async () => {
  if (!db) throw new Error('Database not initialized')
  const rows = queryRows(
    db,
    `SELECT DISTINCT body_text_path AS relativePath
     FROM chapters
     WHERE body_text_storage = 'file_gzip'
       AND body_text_path IS NOT NULL
       AND body_text_path <> ''
       AND (body_text IS NULL OR body_text = '')
     ORDER BY body_text_path`
  )

  return rows
    .map(row => normalizeChapterTextRelativePath(row.relativePath))
    .filter((relativePath): relativePath is string => Boolean(relativePath))
    .filter(relativePath => !existsSync(getChapterTextAbsolutePath(relativePath)))
    .map(relativePath => ({ relativePath, localPath: getChapterTextAbsolutePath(relativePath) }))
})

function quoteIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid database identifier: ${name}`)
  }
  return `"${name}"`
}

function tableExists(database: Database, tableName: string): boolean {
  const result = database.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  )
  return result.length > 0 && result[0].values.length > 0
}

function countRows(database: Database, tableName: string): number {
  if (!tableExists(database, tableName)) return 0
  const result = database.exec(`SELECT COUNT(*) as count FROM ${quoteIdentifier(tableName)}`)
  return Number(result[0]?.values[0]?.[0] || 0)
}

function queryRows(database: Database, sql: string, params?: any[]): any[] {
  const result = database.exec(sql, params || [])
  if (result.length === 0) return []
  const { columns, values } = result[0]
  return values.map(row => {
    const item: any = {}
    columns.forEach((column, index) => { item[column] = row[index] })
    return item
  })
}

function getTableColumns(database: Database, tableName: string): string[] {
  const result = database.exec(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
  if (result.length === 0) return []
  const nameIndex = result[0].columns.indexOf('name')
  return result[0].values.map(row => String(row[nameIndex]))
}

function readTableRows(database: Database, tableName: string, columns: string[]): any[][] {
  if (columns.length === 0) return []
  const columnSql = columns.map(quoteIdentifier).join(', ')
  const result = database.exec(`SELECT ${columnSql} FROM ${quoteIdentifier(tableName)}`)
  return result[0]?.values || []
}

function replaceTableFromDatabase(targetDb: Database, sourceDb: Database, tableName: string): number {
  if (!tableExists(sourceDb, tableName) || !tableExists(targetDb, tableName)) return 0
  const targetColumns = getTableColumns(targetDb, tableName)
  const sourceColumns = getTableColumns(sourceDb, tableName)
  const commonColumns = targetColumns.filter(column => sourceColumns.includes(column))
  if (commonColumns.length === 0) return 0

  const rows = readTableRows(sourceDb, tableName, commonColumns)
  targetDb.run(`DELETE FROM ${quoteIdentifier(tableName)}`)
  if (rows.length === 0) return 0

  const columnSql = commonColumns.map(quoteIdentifier).join(', ')
  const placeholders = commonColumns.map(() => '?').join(', ')
  const insertSql = `INSERT INTO ${quoteIdentifier(tableName)} (${columnSql}) VALUES (${placeholders})`
  for (const row of rows) {
    targetDb.run(insertSql, row)
  }
  return rows.length
}

function normalizeBookIdentityPart(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function bookFallbackIdentity(book: any): string {
  return `${normalizeBookIdentityPart(book.title)}\n${normalizeBookIdentityPart(book.author)}`
}

function countChaptersForBook(database: Database, bookId: number): number {
  const result = database.exec('SELECT COUNT(*) AS count FROM chapters WHERE book_id = ?', [bookId])
  return Number(result[0]?.values[0]?.[0] || 0)
}

function detachCachedChapters(database: Database, previousBooks: any[]): number {
  if (!tableExists(database, 'chapters')) return 0
  let detachedChapters = 0
  for (const book of previousBooks) {
    const bookId = Number(book.id)
    if (!Number.isFinite(bookId) || countChaptersForBook(database, bookId) === 0) continue
    database.run('UPDATE chapters SET book_id = ? WHERE book_id = ?', [-bookId, bookId])
    detachedChapters += database.getRowsModified()
  }
  return detachedChapters
}

function countDetachedChaptersForBook(database: Database, bookId: number): number {
  const result = database.exec('SELECT COUNT(*) AS count FROM chapters WHERE book_id = ?', [-bookId])
  return Number(result[0]?.values[0]?.[0] || 0)
}

function restoreUnmatchedDetachedChapters(database: Database): number {
  if (!tableExists(database, 'chapters')) return 0
  database.run('UPDATE chapters SET book_id = ABS(book_id) WHERE book_id < 0')
  return database.getRowsModified()
}

function remapCachedChaptersToImportedBooks(database: Database, previousBooks: any[]): number {
  if (!tableExists(database, 'chapters')) return 0
  const booksByStatsKey = new Map<string, any>()
  const booksByFallback = new Map<string, any>()
  for (const book of previousBooks) {
    if (book.reading_stats_key) booksByStatsKey.set(String(book.reading_stats_key), book)
    booksByFallback.set(bookFallbackIdentity(book), book)
  }

  const importedBooks = queryRows(database, 'SELECT id, title, author, reading_stats_key FROM books')
  const usedPreviousBookIds = new Set<number>()
  let movedChapters = 0
  for (const importedBook of importedBooks) {
    const previousBook = (importedBook.reading_stats_key && booksByStatsKey.get(String(importedBook.reading_stats_key))) ||
      booksByFallback.get(bookFallbackIdentity(importedBook))
    if (!previousBook || usedPreviousBookIds.has(previousBook.id)) continue
    if (countDetachedChaptersForBook(database, Number(previousBook.id)) === 0) continue
    database.run('UPDATE chapters SET book_id = ? WHERE book_id = ?', [importedBook.id, -Number(previousBook.id)])
    movedChapters += database.getRowsModified()
    usedPreviousBookIds.add(previousBook.id)
  }
  return movedChapters
}

function remapBookmarksToImportedBooks(database: Database): number {
  if (!tableExists(database, 'bookmarks') || !tableExists(database, 'books')) return 0
  database.run(`UPDATE bookmarks
    SET book_id = (
      SELECT books.id
      FROM books
      WHERE books.reading_stats_key = bookmarks.book_identity
      LIMIT 1
    )
    WHERE book_identity <> ''
      AND EXISTS (
        SELECT 1
        FROM books
        WHERE books.reading_stats_key = bookmarks.book_identity
      )`)
  return database.getRowsModified()
}

function assertFullDatabaseHasReadableContent(database: Database): void {
  const bookCount = countRows(database, 'books')
  const chapterCount = countRows(database, 'chapters')
  if (bookCount > 0 && chapterCount === 0) {
    throw new Error('导入文件包含书籍列表但没有章节正文。已阻止覆盖本地数据库；请使用增量恢复或选择完整备份。')
  }
}

ipcMain.handle('db:importFromFile', async (_, filePath: string) => {
  if (!SQL) throw new Error('SQL.js not initialized')
  const data = readFileSync(filePath)
  const nextDb = new SQL.Database(data)
  runDatabaseMigrations(nextDb)
  assertFullDatabaseHasReadableContent(nextDb)
  const oldDb = db
  db = nextDb
  try { oldDb?.close() } catch {}
  saveDatabase()
})

ipcMain.handle('db:importLiteFromFile', async (_, filePath: string) => {
  if (!db || !SQL) throw new Error('Database not initialized')
  const data = readFileSync(filePath)
  const liteDb = new SQL.Database(data)
  try {
    runDatabaseMigrations(liteDb)
    runDatabaseMigrations(db)

    const preservedChapters = countRows(db, 'chapters')
    const importedBookCount = countRows(liteDb, 'books')
    const previousBooks = queryRows(db, 'SELECT id, title, author, reading_stats_key FROM books')

    db.run('PRAGMA foreign_keys = OFF')
    db.run('BEGIN TRANSACTION')
    try {
      const detachedChapters = detachCachedChapters(db, previousBooks)
      const imported = {
        books: replaceTableFromDatabase(db, liteDb, 'books'),
        settings: 0,
        replacementRules: replaceTableFromDatabase(db, liteDb, 'replacement_rules'),
        readingStats: replaceTableFromDatabase(db, liteDb, 'reading_stats'),
        bookmarks: replaceTableFromDatabase(db, liteDb, 'bookmarks')
      }
      const remappedChapters = remapCachedChaptersToImportedBooks(db, previousBooks)
      const remappedBookmarks = remapBookmarksToImportedBooks(db)
      const unmatchedChapters = restoreUnmatchedDetachedChapters(db)
      db.run('COMMIT')
      saveDatabase()
      return { ...imported, importedBookCount, preservedChapters, currentChapters: countRows(db, 'chapters'), detachedChapters, remappedChapters, remappedBookmarks, unmatchedChapters }
    } catch (error) {
      try { db.run('ROLLBACK') } catch {}
      throw error
    }
  } finally {
    liteDb.close()
  }
})

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
