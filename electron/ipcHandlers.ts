import { app, clipboard, dialog, ipcMain, nativeImage } from 'electron'
import { dirname, extname, join } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { EDGE_VOICES, synthesizeEdgeTTS, synthesizeMimoBuffered, synthesizeMimoStreaming } from './tts'
import {
  ALLOWED_BOOK_EXTENSIONS,
  ALLOWED_IMAGE_EXTENSIONS,
  assertAllowedAppPathName,
  assertAllowedLocalReadPath,
  assertAllowedLocalWritePath,
  assertBasicAuthToken,
  assertFileExtension,
  assertHttpUrl,
  assertPngDataUrl,
  normalizeIpcHeaders,
  normalizeOptionalIpcBody,
  normalizeWebdavMethod,
  rememberUserSelectedPath,
} from './ipcGuards'
import { getCurrentDisplayRefreshRate, getMainWindow } from './appWindow'
import { isPortableBuild } from './runtime'
import {
  batchClassifyBooksJson,
  createBookChapterTextZip,
  deleteBookJson,
  deleteBooksJson,
  exportBooksJson,
  extractBookChapterTextZip,
  getBookChapterListJson,
  getBookIdsWithFileGzipChapters,
  getBookSummaryJson,
  getChapterContentBatchJson,
  getChapterTextExcerptJson,
  getMostRecentBookJson,
  getManagedFileIntegrity,
  getBookshelfBooksJson,
  getStorageSizeInfo,
  hasBookChapterTextFiles,
  importBookJson,
  isBookSearchIndexReady,
  readJsonEntity,
  searchBookJson,
  updateBookJson,
  writeJsonEntity,
  type BatchClassificationOperation,
  type JsonEntityType,
} from './libraryService'

let mimoAbortController: AbortController | null = null
const mimoBufferedControllers = new Set<AbortController>()

const ENTITY_DEFAULTS: Record<string, unknown> = {
  books: [],
  chapters: [],
  rules: [],
  themes: [],
  bookmarks: [],
  readingStats: [],
  settings: {},
}

function assertKnownEntityType(entityType: unknown): JsonEntityType {
  const key = String(entityType || '')
  if (!(key in ENTITY_DEFAULTS)) throw new Error(`Unknown entity type: ${key}`)
  return key as JsonEntityType
}

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openFile', async () => {
    const r = await dialog.showOpenDialog(getMainWindow()!, { properties: ['openFile'], filters: [{ name: 'E-books', extensions: ['txt', 'epub', 'pdf'] }, { name: 'All Files', extensions: ['*'] }] })
    const filePath = r.canceled ? null : r.filePaths[0]
    if (filePath) {
      if (!ALLOWED_BOOK_EXTENSIONS.has(extname(filePath).toLocaleLowerCase())) return null
      rememberUserSelectedPath(filePath)
    }
    return filePath
  })
  
  ipcMain.handle('dialog:openImage', async () => {
    const r = await dialog.showOpenDialog(getMainWindow()!, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'] }] })
    const filePath = r.canceled ? null : r.filePaths[0]
    if (filePath) {
      if (!ALLOWED_IMAGE_EXTENSIONS.has(extname(filePath).toLocaleLowerCase())) return null
      rememberUserSelectedPath(filePath)
    }
    return filePath
  })
  
  ipcMain.handle('dialog:saveTextFile', async (_, options: {
    defaultPath: string
    content: string
    filters?: Electron.FileFilter[]
  }) => {
    const r = await dialog.showSaveDialog(getMainWindow()!, {
      defaultPath: options.defaultPath,
      filters: options.filters || [{ name: 'Text', extensions: ['txt'] }],
    })
    if (r.canceled || !r.filePath) return { success: false, canceled: true }
    writeFileSync(r.filePath, normalizeOptionalIpcBody(options.content) || '', 'utf8')
    return { success: true, filePath: r.filePath }
  })
  
  ipcMain.handle('dialog:saveBinaryFile', async (_, options: {
    defaultPath: string
    dataUrl: string
    filters?: Electron.FileFilter[]
  }) => {
    const r = await dialog.showSaveDialog(getMainWindow()!, {
      defaultPath: options.defaultPath,
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
    })
    if (r.canceled || !r.filePath) return { success: false, canceled: true }
  
    const prefix = 'data:image/png;base64,'
    const base64 = assertPngDataUrl(options.dataUrl).slice(prefix.length)
    writeFileSync(r.filePath, Buffer.from(base64, 'base64'))
    return { success: true, filePath: r.filePath }
  })
  
  ipcMain.handle('clipboard:writeImage', async (_, dataUrl: string) => {
    const pngDataUrl = assertPngDataUrl(dataUrl)
    const image = nativeImage.createFromDataURL(pngDataUrl)
    if (image.isEmpty()) throw new Error('无效的图片数据')
    clipboard.writeImage(image)
    return { success: true }
  })
  
  ipcMain.handle('win:setAspectRatio', async (_, ratio: number) => {
    // We explicitly do not call setAspectRatio(ratio) to avoid locking the window.
    // We only resize it to match the ratio once upon user request.
    const safeRatio = Number(ratio)
    const mainWindow = getMainWindow()
    if (mainWindow && Number.isFinite(safeRatio) && safeRatio > 0.2 && safeRatio < 5) {
      const [w] = mainWindow.getSize()
      mainWindow.setSize(w, Math.round(w / safeRatio))
    }
  })
  
  ipcMain.handle('win:setFullScreen', async (_, isFull: boolean) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.setFullScreen(isFull)
    }
  })
  
  ipcMain.handle('win:setAlwaysOnTop', async (_, isTop: boolean) => {
    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(isTop)
    }
  })
  
  // Requirement 4: hide/show titlebar (no-op since we use custom buttons now, but kept for compatibility)
  ipcMain.handle('win:setControlsVisible', async (_, visible: boolean) => {
    // titleBarOverlay is disabled, so we only need to return if the frontend should hide buttons
    return visible
  })
  
  ipcMain.handle('win:minimize', () => getMainWindow()?.minimize())
  ipcMain.handle('win:toggleMaximize', () => {
    const mainWindow = getMainWindow()
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('win:close', () => getMainWindow()?.close())
  ipcMain.handle('win:getIsMaximized', () => getMainWindow()?.isMaximized() || false)
  ipcMain.handle('win:getDisplayRefreshRate', () => getCurrentDisplayRefreshRate())
  
  ipcMain.handle('font:getSystemFonts', async () => {
    if (process.platform !== 'win32') return []
    try {
      const cmd = 'Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }'
      const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 15000 })
      return output.split(/\r?\n/).filter((f: string) => f.trim()).sort()
    } catch (e) { console.error('Font error:', e); return [] }
  })
  
  ipcMain.handle('updater:check', async (event) => {
    if (isPortableBuild()) {
      event.sender.send('updater:status', { status: 'unsupported', message: '免安装版请手动下载并替换程序文件。' })
      return false
    }
    try { await autoUpdater.checkForUpdates(); return true } catch (e) { return false }
  })
  
  ipcMain.handle('updater:download', async (event) => {
    if (isPortableBuild()) {
      event.sender.send('updater:status', { status: 'unsupported', message: '免安装版请手动下载并替换程序文件。' })
      return false
    }
    try { await autoUpdater.downloadUpdate(); return true } catch (e) { return false }
  })
  
  ipcMain.handle('updater:install', async (event, silent?: boolean) => {
    if (isPortableBuild()) {
      event.sender.send('updater:status', { status: 'unsupported', message: '免安装版请手动下载并替换程序文件。' })
      return false
    }
    autoUpdater.quitAndInstall(silent === true, true)
  })
  
  ipcMain.handle('app:getVersion', async () => app.getVersion())
  ipcMain.handle('app:getPlatform', async () => process.platform)
  ipcMain.handle('app:getPath', async (_, name: any) => app.getPath(assertAllowedAppPathName(name)))
  ipcMain.handle('app:quit', async () => app.quit())
  
  ipcMain.handle('library:importBook', async (_, filePath: string, allowDuplicate?: boolean) => importBookJson(filePath, allowDuplicate === true))
  ipcMain.handle('library:deleteBook', async (_, bookId: number) => deleteBookJson(bookId))
  ipcMain.handle('library:deleteBooks', async (_, bookIds: number[]) => deleteBooksJson(bookIds))
  ipcMain.handle('library:batchClassifyBooks', async (_, bookIds: number[], operation: BatchClassificationOperation) => batchClassifyBooksJson(bookIds, operation))
  ipcMain.handle('library:exportBooks', async (_, bookIds: number[]) => exportBooksJson(bookIds, getMainWindow()))
  ipcMain.handle('library:getBookshelfBooks', async () => getBookshelfBooksJson())
  ipcMain.handle('library:getBookSummary', async (_, bookId: number) => getBookSummaryJson(bookId))
  ipcMain.handle('library:getMostRecentBook', async () => getMostRecentBookJson())
  ipcMain.handle('library:updateBook', async (_, bookId: number, fields: Record<string, unknown>) => updateBookJson(bookId, fields))
  ipcMain.on('library:flushProgressSync', (event, bookId: number, fields: Record<string, unknown>) => {
    event.returnValue = updateBookJson(bookId, fields)
  })
  ipcMain.handle('library:getBookChapterList', async (_, bookId: number) => getBookChapterListJson(bookId))
  ipcMain.handle('library:getChapterContentBatch', async (_, bookId: number, chapterIds: number[]) => getChapterContentBatchJson(bookId, chapterIds))
  ipcMain.handle('library:getChapterTextExcerpt', async (_, bookId: number, chapterId: number, charOffset: number, maxChars?: number) => (
    getChapterTextExcerptJson(bookId, chapterId, charOffset, maxChars)
  ))
  ipcMain.handle('library:getSize', async () => getStorageSizeInfo())
  ipcMain.handle('library:getBookIdsWithFileGzipChapters', async () => getBookIdsWithFileGzipChapters())
  ipcMain.handle('library:hasBookChapterTextFiles', async (_, bookId: number) => hasBookChapterTextFiles(bookId))
  ipcMain.handle('library:createBookChapterTextZip', async (_, bookId: number) => createBookChapterTextZip(bookId))
  ipcMain.handle('library:extractBookChapterTextZip', async (_, zipPath: string, bookId?: number) => extractBookChapterTextZip(zipPath, bookId))
  ipcMain.handle('library:getManagedFileIntegrity', async (_, filePath: string) => getManagedFileIntegrity(filePath))
  ipcMain.handle('library:isSearchIndexReady', async (_, bookId: number) => isBookSearchIndexReady(bookId))
  ipcMain.handle('library:searchBook', async (_, bookId: number, query: string) => searchBookJson(bookId, query))
  
  ipcMain.handle('webdav:uploadFile', async (_, localPath: string, remoteUrl: string, auth: string) => {
    try {
      const safeLocalPath = assertAllowedLocalReadPath(localPath)
      const data = readFileSync(safeLocalPath)
      const res = await fetch(assertHttpUrl(remoteUrl, 'WebDAV URL'), {
        method: 'PUT',
        headers: { 'Authorization': `Basic ${assertBasicAuthToken(auth)}` },
        body: data
      })
      return { success: res.ok, status: res.status }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  })
  
  ipcMain.handle('webdav:downloadFile', async (_, remoteUrl: string, localPath: string, auth: string) => {
    try {
      const safeLocalPath = assertAllowedLocalWritePath(localPath)
      const res = await fetch(assertHttpUrl(remoteUrl, 'WebDAV URL'), {
        method: 'GET',
        headers: { 'Authorization': `Basic ${assertBasicAuthToken(auth)}` }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = await res.arrayBuffer()
      mkdirSync(dirname(safeLocalPath), { recursive: true })
      writeFileSync(safeLocalPath, Buffer.from(buffer))
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  })
  
  ipcMain.handle('fs:copyCover', async (_, sourcePath: string) => {
    try {
      const safeSourcePath = assertAllowedLocalReadPath(sourcePath)
      const ext = extname(safeSourcePath).toLowerCase()
      assertFileExtension(safeSourcePath, ALLOWED_IMAGE_EXTENSIONS, '图片文件')
      const coversDir = join(app.getPath('userData'), 'covers')
      if (!existsSync(coversDir)) mkdirSync(coversDir, { recursive: true })
      const uniqueId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
      const filename = `manual_${uniqueId}${ext}`
      const destPath = join(coversDir, filename)
      copyFileSync(safeSourcePath, destPath)
      return { success: true, filename }
    } catch (error: any) {
      return { success: false, error: error.message || String(error) }
    }
  })
  
  ipcMain.handle('webdav:request', async (_, opts: { url: string; method: string; headers?: any; body?: string }) => {
    try {
      const res = await fetch(assertHttpUrl(opts?.url, 'WebDAV URL'), {
        method: normalizeWebdavMethod(opts?.method),
        headers: normalizeIpcHeaders(opts?.headers),
        body: normalizeOptionalIpcBody(opts?.body),
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
  
  ipcMain.handle('tts:synthesize-mimo', async (_, args: { text: string; apiKey: string; voice?: string }) => {
    const controller = new AbortController()
    mimoBufferedControllers.add(controller)
    try {
      const buffer = await synthesizeMimoBuffered(args.text, args.apiKey, args.voice, controller.signal)
      return { success: true, audioBuffer: new Uint8Array(buffer) }
    } catch (error) {
      return { success: false, error: String(error) }
    } finally {
      mimoBufferedControllers.delete(controller)
    }
  })
  
  ipcMain.handle('tts:stop-mimo', async () => {
    if (mimoAbortController) {
      mimoAbortController.abort()
      mimoAbortController = null
    }
    for (const controller of mimoBufferedControllers) controller.abort()
    mimoBufferedControllers.clear()
  })
  
  // ---- v8 JSON data IPC handlers ----
  ipcMain.handle('data:readEntity', async (_, entityType: string) => {
    const safeEntityType = assertKnownEntityType(entityType)
    return readJsonEntity(safeEntityType, ENTITY_DEFAULTS[safeEntityType])
  })
  
  ipcMain.handle('data:writeEntity', async (_, entityType: string, data: unknown) => {
    writeJsonEntity(assertKnownEntityType(entityType), data)
  })
}
