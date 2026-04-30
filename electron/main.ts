import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen } from 'electron'
import { join, extname } from 'path'
import { is } from '@electron-toolkit/utils'
import initSqlJs, { Database } from 'sql.js'
import { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { parseTxt, parseEpub, parsePdf, stripHtmlTags, type Chapter } from './parsers'
import { synthesizeEdgeTTS, EDGE_VOICES, synthesizeMimoStreaming } from './tts'
import { autoUpdater } from 'electron-updater'

let mainWindow: BrowserWindow | null = null
let db: Database | null = null
let SQL: any = null
let dbPath: string = ''
let mimoAbortController: AbortController | null = null

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

function getCurrentUserVersion(database: Database): number {
  try {
    const result = database.exec('PRAGMA user_version')
    if (result.length > 0 && result[0].values.length > 0) {
      return Number(result[0].values[0][0]) || 0
    }
  } catch (_) {}
  return 0
}

function runV6Migration(
  database: Database,
  onProgress?: (step: number, total: number, message: string) => void
): { migrated: boolean } {
  const currentVersion = getCurrentUserVersion(database)
  if (currentVersion >= 6) {
    onProgress?.(6, 6, '数据库已是 v6 版本，无需迁移')
    return { migrated: false }
  }

  const totalSteps = 6
  let step = 0
  const progress = (message: string) => {
    step++
    onProgress?.(step, totalSteps, message)
  }

  console.log(`[DB Migration] Running v6 migration (current user_version = ${currentVersion})`)
  try {
    progress('正在从 body 列提取纯文本正文...')

    const chaptersResult = database.exec(
      "SELECT id, body, body_text, body_html FROM chapters WHERE (body_text IS NULL OR body_text = '') AND (body IS NOT NULL AND body <> '' OR body_html IS NOT NULL AND body_html <> '')"
    )
    let hadBodyHtmlContent = false
    if (chaptersResult.length > 0) {
      const { columns, values } = chaptersResult[0]
      const idIdx = columns.indexOf('id')
      const bodyIdx = columns.indexOf('body')
      const bodyTextIdx = columns.indexOf('body_text')
      const bodyHtmlIdx = columns.indexOf('body_html')
      for (const row of values) {
        const id = row[idIdx]
        const body = String(row[bodyIdx] || '')
        const bodyHtml = String(row[bodyHtmlIdx] || '')
        let newBodyText = String(row[bodyTextIdx] || '')
        if (!newBodyText) {
          if (bodyHtml) {
            newBodyText = stripHtmlTags(bodyHtml)
            hadBodyHtmlContent = true
          } else if (body) {
            newBodyText = stripHtmlTags(body)
          }
          if (newBodyText) {
            database.run('UPDATE chapters SET body_text = ? WHERE id = ?', [newBodyText, id])
          }
        }
      }
    }

    progress('正在为移动端库补齐渲染用 body 列...')

    const missingBodyResult = database.exec(
      "SELECT id, body_text FROM chapters WHERE (body IS NULL OR body = '') AND body_text IS NOT NULL AND body_text <> ''"
    )
    if (missingBodyResult.length > 0) {
      const { columns, values } = missingBodyResult[0]
      const idIdx = columns.indexOf('id')
      const bodyTextIdx = columns.indexOf('body_text')
      for (const row of values) {
        const id = row[idIdx]
        const bodyText = String(row[bodyTextIdx] || '')
        if (bodyText) {
          database.run('UPDATE chapters SET body = ? WHERE id = ?', [textToHtml(bodyText), id])
        }
      }
    }

    progress('正在清理冗余的 body_html 列...')

    const bodyHtmlResult = database.exec(
      "SELECT id FROM chapters WHERE body_html IS NOT NULL AND body_html <> ''"
    )
    if (bodyHtmlResult.length > 0 && bodyHtmlResult[0].values.length > 0) {
      database.run("UPDATE chapters SET body_html = ''")
      hadBodyHtmlContent = true
    }

    progress('正在设置数据库版本号...')
    database.run('PRAGMA user_version = 6')

    progress('正在回收存储空间 (VACUUM)...')
    if (hadBodyHtmlContent) {
      try { database.run('VACUUM') } catch (e) { console.error('[DB Migration] VACUUM failed:', e) }
    }

    progress('数据库迁移完成')
    console.log('[DB Migration] v6 migration complete')
    return { migrated: true }
  } catch (e) {
    console.error('[DB Migration] v6 migration error:', e)
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

  // v6 schema: chapters with body_text (source of truth), body_html (shadow, kept empty), body (desktop rendering shadow)
  database.run(`CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    body_html TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL, link TEXT,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
  )`)
  try { database.run("ALTER TABLE chapters ADD COLUMN body_text TEXT NOT NULL DEFAULT ''") } catch (_) {}
  try { database.run("ALTER TABLE chapters ADD COLUMN body_html TEXT NOT NULL DEFAULT ''") } catch (_) {}
  // Android v6 DBs may lack the body column
  try { database.run("ALTER TABLE chapters ADD COLUMN body TEXT NOT NULL DEFAULT ''") } catch (_) {}

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

  // ---- v6 data migration ----
  runV6Migration(database)

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
  try {
    const ext = extname(filePath).toLowerCase()
    const fileName = filePath.split(/[/\\]/).pop() || 'Unknown'
    const parsed = parseBookNameAndAuthor(fileName)
    const title = parsed.title || fileName.replace(/\.[^/.]+$/, '')
    const author = parsed.author
    const readingStatsKey = buildReadingStatsKey(title, author)
    db.run(
      'INSERT INTO books (title, author, path, last_read, reading_stats_key) VALUES (?, ?, ?, ?, ?)',
      [title, author, filePath, new Date().toISOString(), readingStatsKey]
    )
    const result = db.exec('SELECT last_insert_rowid() as id')
    const bookId = result[0].values[0][0] as number
    let chapters: Chapter[]
    if (ext === '.txt') {
      chapters = parseTxt(filePath)
    } else if (ext === '.epub') {
      const epubResult = await parseEpub(filePath)
      chapters = epubResult.chapters
      // Save extracted cover
      if (epubResult.coverBuffer && epubResult.coverExtension) {
        try {
          const coversDir = join(app.getPath('userData'), 'covers')
          if (!existsSync(coversDir)) mkdirSync(coversDir, { recursive: true })
          const coverFilename = `epub_cover_${bookId}.${epubResult.coverExtension}`
          const coverDestPath = join(coversDir, coverFilename)
          writeFileSync(coverDestPath, epubResult.coverBuffer)
          const coverUrl = 'file:///' + coverDestPath.replace(/\\/g, '/')
          db.run('UPDATE books SET cover_path = ? WHERE id = ?', [coverUrl, bookId])
        } catch (e) { console.error('Failed to save EPUB cover:', e) }
      }
    } else if (ext === '.pdf') {
      chapters = await parsePdf(filePath)
    } else {
      throw new Error(`Unsupported: ${ext}`)
    }
    for (const ch of chapters) {
      db.run('INSERT INTO chapters (book_id, title, body, body_text, body_html, order_index) VALUES (?, ?, ?, ?, ?, ?)',
        [bookId, ch.title, ch.body, ch.bodyText, ch.bodyHtml, ch.orderIndex])
    }
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
  try {
    const stat = statSync(dbPath)
    return { sizeBytes: stat.size }
  } catch {
    return { sizeBytes: 0 }
  }
})

ipcMain.handle('db:migrateToV6', async (event) => {
  if (!db) throw new Error('Database not initialized')
  const result = runV6Migration(db, (step, total, message) => {
    event.sender.send('db:migration-progress', { step, total, message })
  })
  saveDatabase()
  return result
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
  // Remove heavy content
  try {
    tempDb.run('DROP TABLE IF EXISTS chapters')
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
