<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettings } from '../composables/useSettings'
import {
  fullBackupV8, fullRestoreV8, incrementalBackupV8, incrementalRestoreV8,
} from '../composables/useV8Sync'
import {
  DESKTOP_DATABASE_DIR,
  buildPacilReadBaseUrl,
  clearLocalReadingStats,
  extractHrefValues,
  fetchReadingStatsOverview,
  getCurrentDesktopSettingsSnapshot,
  getAllLocalReadingStatsRows,
  deleteRemoteReadingStatsFiles,
  getLocalOnlySettingsSnapshot,
  hasReadingStatsHistory,
  mergeRemoteReadingStats,
  restoreDesktopSettingsSnapshot,
  restoreDesktopSettingsValues,
  restoreLocalOnlySettings,
  restoreReadingStatsRows,
  sanitizeWebdavDirectorySegment,
  uploadDesktopSettingsSnapshot,
  uploadReadingStatsSnapshot,
  type ReadingStatsOverview,
} from '../composables/useReadingStats'

// Sub-components
import SettingsDisplay from './settings/SettingsDisplay.vue'
import SettingsAppearance from './settings/SettingsAppearance.vue'
import SettingsReading from './settings/SettingsReading.vue'
import SettingsReadingStats from './settings/SettingsReadingStats.vue'
import SettingsWebDAV from './settings/SettingsWebDAV.vue'
import SettingsTTS from './settings/SettingsTTS.vue'
import SettingsRules from './settings/SettingsRules.vue'
import SettingsAbout from './settings/SettingsAbout.vue'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'refresh-settings'): void
  (e: 'open-reading-stats'): void
}>()

interface ReplacementRule { id: number; pattern: string; replacement: string; scope: string; book_id: number | null; is_regex: number; active: number }
interface Book { id: number; title: string }

const settings = useSettings()
const {
  loadAllSettings, saveSetting,
  showKeyHints, nextKeys, prevKeys,
  webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
  webdavSyncBookshelf, webdavSyncFiles, webdavSyncUISettings,
  webdavSyncThemes, webdavSyncBackgrounds, webdavLastSync, webdavLastLiteSync,
  autoOpenLastRead, silentUpdate, ttsMiMoApiKey,
  webdavDesktopSettingsDir,
  webdavSyncReadingStats,
  readingTimeTrackingEnabled, readingTimeStatsHidden
} = settings

// Update related state
const appVersion = ref('')
const dbSize = ref('')
const dbTextSize = ref('')
const dbTotalSize = ref('')
const updateStatus = ref('')
const updateDetail = ref('')

// ---- Database migration UI state ----
const showMigrationModal = ref(false)
const migrationRunning = ref(false)
const migrationStep = ref(0)
const migrationTotal = ref(4)
const migrationMessage = ref('')
const migrationDone = ref(false)
const migrationError = ref('')
let unsubMigrationProgress: (() => void) | null = null

const openMigrationConfirm = () => {
  migrationRunning.value = false
  migrationDone.value = false
  migrationError.value = ''
  migrationStep.value = 0
  migrationMessage.value = ''
  showMigrationModal.value = true
}

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '—'
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

const refreshDbSize = async () => {
  const sz = await window.electronAPI.db.getSize()
  dbSize.value = formatBytes(sz.databaseBytes ?? sz.sizeBytes)
  dbTextSize.value = formatBytes(sz.chapterTextBytes)
  dbTotalSize.value = formatBytes(sz.totalBytes ?? sz.sizeBytes)
}

const startMigration = async () => {
  migrationRunning.value = true
  migrationError.value = ''
  try {
    unsubMigrationProgress = window.electronAPI.db.onOptimizeProgress((data) => {
      migrationStep.value = data.step
      migrationTotal.value = data.total
      migrationMessage.value = data.message
    })
    await window.electronAPI.db.optimizeStorage()
    migrationDone.value = true
    await refreshDbSize()
  } catch (e: any) {
    migrationError.value = e?.message || String(e)
  } finally {
    migrationRunning.value = false
    if (unsubMigrationProgress) {
      unsubMigrationProgress()
      unsubMigrationProgress = null
    }
  }
}

const closeMigrationModal = () => {
  if (migrationRunning.value) return
  if (unsubMigrationProgress) {
    unsubMigrationProgress()
    unsubMigrationProgress = null
  }
  showMigrationModal.value = false
}
const updateAvailable = ref(false)
const updateReady = ref(false)
const isDownloading = ref(false)

// WebDAV related status
const webdavTestResult = ref('')
const webdavTesting = ref(false)
const webdavSyncing = ref(false)
const webdavSyncStatus = ref('')
const readingStatsLoading = ref(false)
const readingStatsHasHistory = ref(false)
const readingStatsOverview = ref<ReadingStatsOverview>({ today: 0, week: 0, year: 0 })
const showReadingStatsDisableModal = ref(false)
const readingStatsActionBusy = ref(false)

// Rules related state
const allRules = ref<ReplacementRule[]>([])
const books = ref<Book[]>([])

const setAspectRatio = async (ratio: number) => {
  await window.electronAPI.win.setAspectRatio(ratio)
}

const saveWebdav = async () => {
  let url = webdavUrl.value.trim()
  if (url && !url.endsWith('/')) url += '/'
  webdavUrl.value = url
  let dir = webdavDir.value.trim()
  if (dir.startsWith('/')) dir = dir.substring(1)
  if (dir && !dir.endsWith('/')) dir += '/'
  webdavDir.value = dir
  webdavDesktopSettingsDir.value = sanitizeWebdavDirectorySegment(webdavDesktopSettingsDir.value)
  await saveSetting('webdavUrl', url)
  await saveSetting('webdavDir', dir)
  await saveSetting('webdavUser', webdavUser.value.trim())
  await saveSetting('webdavPass', webdavPass.value.trim())
  await saveSetting('webdavSync', webdavSync.value ? 'true' : 'false')
  await saveSetting('webdavSyncBookshelf', webdavSyncBookshelf.value ? 'true' : 'false')
  await saveSetting('webdavSyncFiles', webdavSyncFiles.value ? 'true' : 'false')
  await saveSetting('webdavSyncUISettings', webdavSyncUISettings.value ? 'true' : 'false')
  await saveSetting('webdavSyncThemes', webdavSyncThemes.value ? 'true' : 'false')
  await saveSetting('webdavSyncBackgrounds', webdavSyncBackgrounds.value ? 'true' : 'false')
  await saveSetting('webdav_sync_reading_stats', webdavSyncReadingStats.value ? 'true' : 'false')
  await saveSetting('webdavDesktopSettingsDir', webdavDesktopSettingsDir.value)
}

const testWebdav = async () => {
  if (!webdavUrl.value) { webdavTestResult.value = '❌ 请填写服务器地址'; return }
  webdavTesting.value = true
  webdavTestResult.value = '连接中...'
  await saveWebdav()
  const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
  const res = await window.electronAPI.webdav.request({
    url: webdavUrl.value, method: 'PROPFIND', headers: { 'Authorization': `Basic ${auth}`, 'Depth': '0' }
  })
  if (res.error) webdavTestResult.value = '❌ 连接异常: ' + res.error
  else if (res.status && res.status >= 200 && res.status < 300) {
    webdavTestResult.value = '✅ 连接成功！'
    let syncBaseURL = webdavUrl.value
    if (webdavDir.value) syncBaseURL += webdavDir.value
    const pacilReadBaseUrl = buildPacilReadBaseUrl(webdavUrl.value, webdavDir.value)
    if (webdavDir.value) {
      await window.electronAPI.webdav.request({ url: syncBaseURL, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    }
    await window.electronAPI.webdav.request({ url: syncBaseURL + 'bookProgress/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: pacilReadBaseUrl, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}chapter_text/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}readingStats/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}${webdavDesktopSettingsDir.value}/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}${webdavDesktopSettingsDir.value}/backgrounds/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}${webdavDesktopSettingsDir.value}/${DESKTOP_DATABASE_DIR}/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
  }
  else webdavTestResult.value = `❌失败(HTTP ${res.status}): ` + (res.data ? res.data.substring(0, 30) : '')
  webdavTesting.value = false
}

const toggleKeyHints = async () => {
  await saveSetting('hideKeyHints', (!showKeyHints.value).toString())
}

const toggleAutoOpenLastRead = async () => {
  await saveSetting('autoOpenLastRead', autoOpenLastRead.value ? 'true' : 'false')
}

const addNextKey = (e: KeyboardEvent) => {
  if (!nextKeys.value.includes(e.key) && e.key.trim().length > 0 || e.key === ' ') {
    nextKeys.value.push(e.key)
    saveSetting('reader_nextKeys', JSON.stringify(nextKeys.value))
  }
}
const removeNextKey = (k: string) => {
  nextKeys.value = nextKeys.value.filter(x => x !== k)
  saveSetting('reader_nextKeys', JSON.stringify(nextKeys.value))
}

const addPrevKey = (e: KeyboardEvent) => {
  if (!prevKeys.value.includes(e.key) && e.key.trim().length > 0 || e.key === ' ') {
    prevKeys.value.push(e.key)
    saveSetting('reader_prevKeys', JSON.stringify(prevKeys.value))
  }
}
const removePrevKey = (k: string) => {
  prevKeys.value = prevKeys.value.filter(x => x !== k)
  saveSetting('reader_prevKeys', JSON.stringify(prevKeys.value))
}

const checkForUpdate = async () => {
  updateStatus.value = '正在检查...'
  updateDetail.value = ''
  updateAvailable.value = false
  updateReady.value = false
  await window.electronAPI.updater.check()
}

const downloadUpdate = async () => {
  updateStatus.value = '准备下载...'
  updateAvailable.value = false
  isDownloading.value = true
  await window.electronAPI.updater.download()
}

const installNow = () => {
  if (silentUpdate.value) window.electronAPI.updater.installSilent()
  else window.electronAPI.updater.install()
}

const toggleSilentUpdate = async () => {
  await saveSetting('silentUpdate', silentUpdate.value ? 'true' : 'false')
}

const saveMiMoKey = async () => {
  await saveSetting('reader_ttsMiMoApiKey', ttsMiMoApiKey.value.trim())
}

const fetchAllRules = async () => {
  try {
    const r = await window.electronAPI.db.query('SELECT * FROM replacement_rules ORDER BY id')
    allRules.value = r as ReplacementRule[]
  } catch (e) { console.error(e) }
}

const fetchBooks = async () => {
  try {
    const r = await window.electronAPI.db.query('SELECT id, title FROM books ORDER BY title')
    books.value = r as Book[]
  } catch (e) { console.error(e) }
}

const getBookTitle = (bookId: number | null) => {
  if (!bookId) return ''
  const b = books.value.find(b => b.id === bookId)
  return b ? b.title : `#${bookId}`
}

const deleteRule = async (id: number) => {
  try {
    await window.electronAPI.db.query('DELETE FROM replacement_rules WHERE id = ?', [id])
    await fetchAllRules()
  } catch (e) { console.error(e) }
}

const toggleRuleActive = async (rule: ReplacementRule) => {
  try {
    await window.electronAPI.db.query('UPDATE replacement_rules SET active = ? WHERE id = ?', [rule.active ? 0 : 1, rule.id])
    await fetchAllRules()
  } catch (e) { console.error(e) }
}

const getCurrentPacilReadBaseUrl = () => buildPacilReadBaseUrl(webdavUrl.value, webdavDir.value)
const getDesktopPrivateBaseUrl = () => {
  const desktopDir = sanitizeWebdavDirectorySegment(webdavDesktopSettingsDir.value)
  return `${getCurrentPacilReadBaseUrl()}${desktopDir}/`
}
const getDesktopDatabaseBaseUrl = () => `${getDesktopPrivateBaseUrl()}${DESKTOP_DATABASE_DIR}/`

const ensureWebdavCollection = async (url: string, auth: string) => {
  await window.electronAPI.webdav.request({ url, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
}

const ensureSyncDirectories = async (auth: string, options: { includeDesktopDatabase?: boolean; includeChapterText?: boolean } = {}) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  await ensureWebdavCollection(baseUrl, auth)
  await ensureWebdavCollection(baseUrl + 'books/', auth)
  await ensureWebdavCollection(baseUrl + 'covers/', auth)
  if (options.includeChapterText) await ensureWebdavCollection(baseUrl + 'chapter_text/', auth)
  await ensureWebdavCollection(baseUrl + 'readingStats/', auth)
  await ensureWebdavCollection(getDesktopPrivateBaseUrl(), auth)
  await ensureWebdavCollection(getDesktopPrivateBaseUrl() + 'backgrounds/', auth)
  if (options.includeDesktopDatabase) {
    await ensureWebdavCollection(getDesktopDatabaseBaseUrl(), auth)
  }
}

const downloadFirstAvailable = async (remoteUrls: string[], dstPath: string, auth: string) => {
  let lastError = ''
  for (const remoteUrl of remoteUrls) {
    const result = await window.electronAPI.webdav.downloadFile(remoteUrl, dstPath, auth)
    if (!result.error) return { ...result, remoteUrl }
    lastError = result.error || `无法读取 ${remoteUrl}`
  }
  return { success: false, error: lastError || '云端文件不存在', remoteUrl: remoteUrls[0] }
}

const assertUploadSucceeded = (result: { success: boolean; status?: number; error?: string }, label: string) => {
  if (result.error || result.success === false) {
    throw new Error(result.error || `${label}失败 (HTTP ${result.status || 'unknown'})`)
  }
}

const encodeRemoteRelativePath = (relativePath: string) => (
  relativePath
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(part))
    .join('/')
)

const getFileNameFromPath = (value: string) => {
  const clean = String(value || '').split(/[?#]/)[0]
  return clean.split(/[\\/]/).pop() || ''
}

const fileUrlToLocalPath = (value: string) => {
  if (!value.startsWith('file:///')) return value
  try {
    return decodeURIComponent(value.replace(/^file:\/\/\//, ''))
  } catch (_) {
    return value.replace(/^file:\/\/\//, '')
  }
}

const localPathToFileUrl = (value: string) => 'file:///' + value.replace(/\\/g, '/')

const ensureRemoteRelativeDir = async (baseUrl: string, relativeDir: string, auth: string) => {
  const parts = relativeDir.split('/').filter(Boolean)
  let current = baseUrl
  for (const part of parts) {
    current += encodeURIComponent(part) + '/'
    await ensureWebdavCollection(current, auth)
  }
}

const uploadChapterTextFiles = async (auth: string, skipExisting = false) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  const files = await window.electronAPI.db.getRequiredChapterTextFiles()
  if (files.length === 0) return { uploaded: 0, skipped: 0, total: 0 }

  const chapterBaseUrl = baseUrl + 'chapter_text/'
  await ensureWebdavCollection(chapterBaseUrl, auth)
  const dirs = Array.from(new Set(files.map(file => file.relativePath.split('/').slice(0, -1).join('/')).filter(Boolean)))
  for (const dir of dirs) {
    await ensureRemoteRelativeDir(chapterBaseUrl, dir, auth)
  }

  let uploaded = 0
  let skipped = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const remotePath = chapterBaseUrl + encodeRemoteRelativePath(file.relativePath)
    if (skipExisting) {
      const check = await window.electronAPI.webdav.request({ url: remotePath, method: 'HEAD', headers: { 'Authorization': `Basic ${auth}` } })
      if (check.status === 200) {
        skipped += 1
        continue
      }
    }
    webdavSyncStatus.value = `上传章节正文 (${i + 1}/${files.length})...`
    const result = await window.electronAPI.webdav.uploadFile(file.localPath, remotePath, auth)
    if (result.error || result.success === false) {
      throw new Error(result.error || `上传章节正文失败 (HTTP ${result.status || 'unknown'})`)
    }
    uploaded += 1
  }

  return { uploaded, skipped, total: files.length }
}

const uploadCoverFiles = async (auth: string) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  const appDataPath = await window.electronAPI.app.getPath('userData')
  const coversDir = appDataPath + '/covers/'
  const coverFiles = await window.electronAPI.db.query('SELECT cover_path FROM books WHERE cover_path IS NOT NULL AND cover_path <> ""')
  for (let i = 0; i < (coverFiles as any[]).length; i++) {
    const source = String((coverFiles as any[])[i].cover_path || '')
    const fileName = getFileNameFromPath(source)
    if (!fileName) continue
    const localPath = source.startsWith('file:///') ? fileUrlToLocalPath(source) : coversDir + fileName
    webdavSyncStatus.value = `上传封面 (${i + 1}/${(coverFiles as any[]).length})...`
    assertUploadSucceeded(
      await window.electronAPI.webdav.uploadFile(localPath, baseUrl + 'covers/' + encodeURIComponent(fileName), auth),
      '上传封面'
    )
  }
}

const downloadCoverFiles = async (auth: string) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  const appDataPath = await window.electronAPI.app.getPath('userData')
  const coversDir = appDataPath + '/covers/'
  const coverFiles = await window.electronAPI.db.query('SELECT id, cover_path FROM books WHERE cover_path IS NOT NULL AND cover_path <> ""')
  let downloaded = 0
  for (let i = 0; i < (coverFiles as any[]).length; i++) {
    const row = (coverFiles as any[])[i]
    const fileName = getFileNameFromPath(String(row.cover_path || ''))
    if (!fileName) continue
    const localPath = coversDir + fileName
    webdavSyncStatus.value = `下载封面 (${i + 1}/${(coverFiles as any[]).length})...`
    const result = await window.electronAPI.webdav.downloadFile(baseUrl + 'covers/' + encodeURIComponent(fileName), localPath, auth)
    if (!result.error) {
      downloaded += 1
      await window.electronAPI.db.query('UPDATE books SET cover_path = ? WHERE id = ?', [localPathToFileUrl(localPath), row.id])
    }
  }
  return downloaded
}

const uploadBookChapterTextZips = async (auth: string) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  const bookIds = await window.electronAPI.db.getBookIdsWithFileGzipChapters()
  if (bookIds.length === 0) return { uploaded: 0, total: 0 }

  const chapterBaseUrl = baseUrl + 'chapter_text/'
  await ensureWebdavCollection(chapterBaseUrl, auth)

  let uploaded = 0
  for (let i = 0; i < bookIds.length; i++) {
    const bookId = bookIds[i]
    webdavSyncStatus.value = `上传章节正文 ZIP (${i + 1}/${bookIds.length})...`
    const zipPath = await window.electronAPI.db.createBookChapterTextZip(bookId)
    if (!zipPath) continue
    const remotePath = chapterBaseUrl + `chapters_${bookId}.zip`
    assertUploadSucceeded(
      await window.electronAPI.webdav.uploadFile(zipPath, remotePath, auth),
      '上传章节正文 ZIP'
    )
    uploaded += 1
  }
  return { uploaded, total: bookIds.length }
}

const downloadChapterTextZipsAndFiles = async (auth: string) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  const appDataPath = await window.electronAPI.app.getPath('userData')
  const bookIds = await window.electronAPI.db.getBookIdsWithFileGzipChapters()
  let downloaded = 0
  let missing = 0

  for (let i = 0; i < bookIds.length; i++) {
    const bookId = bookIds[i]
    webdavSyncStatus.value = `下载章节正文 ZIP (${i + 1}/${bookIds.length})...`

    const zipRemotePath = baseUrl + 'chapter_text/chapters_' + bookId + '.zip'
    const tempZipPath = appDataPath + '/chapters_' + bookId + '.tmp.zip'
    const zipResult = await window.electronAPI.webdav.downloadFile(zipRemotePath, tempZipPath, auth)
    if (!zipResult.error) {
      await window.electronAPI.db.extractBookChapterTextZip(tempZipPath)
      downloaded += 1
      continue
    }
    missing += 1
  }

  // Fallback: individual file download for any books still missing chapters
  if (missing > 0) {
    const files = await window.electronAPI.db.getRequiredChapterTextFiles()
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      webdavSyncStatus.value = `下载章节正文散文件 (${i + 1}/${files.length})...`
      const remotePath = baseUrl + 'chapter_text/' + encodeRemoteRelativePath(file.relativePath)
      const result = await window.electronAPI.webdav.downloadFile(remotePath, file.localPath, auth)
      if (!result.error) {
        downloaded += 1
      }
    }
  }

  const stillMissing = await window.electronAPI.db.getMissingChapterTextFiles()
  return { downloaded, missing: Math.max(missing, stillMissing.length), total: bookIds.length }
}

const cleanRemoteOrphans = async (auth: string) => {
  const baseUrl = getCurrentPacilReadBaseUrl()

  // 1. Clean orphan chapter text ZIPs
  try {
    const chapterTextDir = baseUrl + 'chapter_text/'
    const chapterFilesResult = await window.electronAPI.webdav.request({
      url: chapterTextDir, method: 'PROPFIND',
      headers: { Authorization: `Basic ${auth}`, Depth: '1' }
    })
    if (chapterFilesResult.status === 207 && chapterFilesResult.data) {
      const hrefs = extractHrefValues(chapterFilesResult.data)
      const zipFiles = hrefs.filter((f: string) => /chapters_\d+\.zip$/.test(f))
      const bookIds = await window.electronAPI.db.getBookIdsWithFileGzipChapters()
      const bookIdSet = new Set(bookIds)
      for (const zipFile of zipFiles) {
        const match = zipFile.match(/chapters_(\d+)\.zip$/)
        if (match) {
          const remoteBookId = parseInt(match[1])
          if (!bookIdSet.has(remoteBookId)) {
            await window.electronAPI.webdav.request({
              url: zipFile, method: 'DELETE',
              headers: { Authorization: `Basic ${auth}` }
            })
          }
        }
      }
    }
  } catch (_) {}

  // 2. Clean orphan covers
  try {
    const coversDir = baseUrl + 'covers/'
    const coversResult = await window.electronAPI.webdav.request({
      url: coversDir, method: 'PROPFIND',
      headers: { Authorization: `Basic ${auth}`, Depth: '1' }
    })
    if (coversResult.status === 207 && coversResult.data) {
      const coverFiles = extractHrefValues(coversResult.data)
      const usedCovers: string[] = []
      const coverRows = await window.electronAPI.db.query(
        'SELECT cover_path FROM books WHERE cover_path IS NOT NULL AND cover_path <> ""'
      ) as any[]
      for (const row of coverRows) {
        const fileName = getFileNameFromPath(String(row.cover_path || ''))
        if (fileName) usedCovers.push(fileName)
      }
      const usedSet = new Set(usedCovers)
      for (const coverFile of coverFiles) {
        const fileName = coverFile.split('/').pop() || ''
        if (fileName && !usedSet.has(fileName)) {
          await window.electronAPI.webdav.request({
            url: coverFile, method: 'DELETE',
            headers: { Authorization: `Basic ${auth}` }
          })
        }
      }
    }
  } catch (_) {}

  // 3. Clean orphan book source files
  try {
    const booksDir = baseUrl + 'books/'
    const booksResult = await window.electronAPI.webdav.request({
      url: booksDir, method: 'PROPFIND',
      headers: { Authorization: `Basic ${auth}`, Depth: '1' }
    })
    if (booksResult.status === 207 && booksResult.data) {
      const bookFiles = extractHrefValues(booksResult.data)
      const usedBooks: string[] = []
      const bookRows = await window.electronAPI.db.query('SELECT path FROM books') as any[]
      for (const row of bookRows) {
        const fileName = String(row.path || '').split(/[\\/]/).pop()
        if (fileName) usedBooks.push(fileName)
      }
      const usedSet = new Set(usedBooks)
      for (const bookFile of bookFiles) {
        const fileName = bookFile.split('/').pop() || ''
        if (fileName && !usedSet.has(fileName)) {
          await window.electronAPI.webdav.request({
            url: bookFile, method: 'DELETE',
            headers: { Authorization: `Basic ${auth}` }
          })
        }
      }
    }
  } catch (_) {}
}

const refreshReadingStatsSummary = async () => {
  readingStatsLoading.value = true
  try {
    readingStatsHasHistory.value = await hasReadingStatsHistory()
    if (readingTimeTrackingEnabled.value || readingStatsHasHistory.value) {
      readingStatsOverview.value = await fetchReadingStatsOverview()
    } else {
      readingStatsOverview.value = { today: 0, week: 0, year: 0 }
    }
  } catch (error) {
    console.error('Refresh reading stats summary failed:', error)
  } finally {
    readingStatsLoading.value = false
  }
}

const finishDisableReadingStats = async (hidden: boolean) => {
  readingTimeTrackingEnabled.value = false
  readingTimeStatsHidden.value = hidden
  await saveSetting('readingTimeTrackingEnabled', 'false')
  await saveSetting('reading_time_tracking_enabled', 'false')
  await saveSetting('readingTimeStatsHidden', hidden ? 'true' : 'false')
  showReadingStatsDisableModal.value = false
  await refreshReadingStatsSummary()
}

const enableReadingStats = async () => {
  readingTimeTrackingEnabled.value = true
  readingTimeStatsHidden.value = false
  await saveSetting('readingTimeTrackingEnabled', 'true')
  await saveSetting('reading_time_tracking_enabled', 'true')
  await saveSetting('readingTimeStatsHidden', 'false')
  await refreshReadingStatsSummary()
}

const openReadingStats = () => emit('open-reading-stats')

const handleToggleReadingStats = async () => {
  if (!readingTimeTrackingEnabled.value) {
    await enableReadingStats()
    return
  }

  const hasHistory = await hasReadingStatsHistory()
  if (!hasHistory) {
    await finishDisableReadingStats(false)
    return
  }

  showReadingStatsDisableModal.value = true
}

const hideReadingStats = async () => {
  readingStatsActionBusy.value = true
  try {
    await finishDisableReadingStats(true)
  } finally {
    readingStatsActionBusy.value = false
  }
}

const cancelDisableReadingStats = () => {
  showReadingStatsDisableModal.value = false
}

const clearReadingStatsHistory = async () => {
  readingStatsActionBusy.value = true
  const localSnapshot = await getAllLocalReadingStatsRows()
  try {
    await clearLocalReadingStats()
    try {
      await deleteRemoteReadingStatsFiles()
    } catch (error) {
      await restoreReadingStatsRows(localSnapshot)
      throw error
    }

    readingTimeTrackingEnabled.value = false
    readingTimeStatsHidden.value = false
    await saveSetting('readingTimeTrackingEnabled', 'false')
    await saveSetting('reading_time_tracking_enabled', 'false')
    await saveSetting('readingTimeStatsHidden', 'false')
    showReadingStatsDisableModal.value = false
    await refreshReadingStatsSummary()
  } catch (error: any) {
    alert(`清空阅读统计失败：${error?.message || '网络错误'}`)
  } finally {
    readingStatsActionBusy.value = false
  }
}

const fullBackup = async () => {
  if (!webdavUrl.value) return
  try {
    await saveWebdav()
    webdavSyncing.value = true
    webdavSyncStatus.value = '准备备份...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    const baseUrl = getCurrentPacilReadBaseUrl()

    webdavSyncStatus.value = '创建云端目录...'
    await ensureSyncDirectories(auth, { includeChapterText: true })

    if (webdavSyncBookshelf.value) {
      // v8: Upload JSON data files instead of SQLite reader.db
      webdavSyncStatus.value = '上传 v8 JSON 数据...'
      const v8Result = await fullBackupV8((msg) => { webdavSyncStatus.value = msg })
      if (!v8Result.success) {
        throw new Error(`v8 备份失败: ${v8Result.error}`)
      }
      await uploadBookChapterTextZips(auth)
      await uploadChapterTextFiles(auth)
      await uploadCoverFiles(auth)
    }

    const appDataPath = await window.electronAPI.app.getPath('userData')
    if (webdavSyncFiles.value) {
      const booksDir = appDataPath + '/books/'
      const { useDataStore: getStore } = await import('../composables/useDataStore')
      const store = getStore()
      if (!store.dataLoaded.value) await store.loadAllData()
      const bookFiles = store.books.value.map(b => b.sourceFile).filter(Boolean) as string[]
      for (let i = 0; i < bookFiles.length; i++) {
        const fileName = bookFiles[i]
        webdavSyncStatus.value = `上传书籍 (${i + 1}/${bookFiles.length})...`
        assertUploadSucceeded(
          await window.electronAPI.webdav.uploadFile(booksDir + fileName, baseUrl + 'books/' + fileName, auth),
          '上传书籍'
        )
      }
    }

    if (webdavSyncUISettings.value || webdavSyncThemes.value || webdavSyncBackgrounds.value) {
      webdavSyncStatus.value = '上传桌面设置...'
      await uploadDesktopSettingsSnapshot()
    }

    if (webdavSyncReadingStats.value) {
      webdavSyncStatus.value = '上传阅读统计...'
      await uploadReadingStatsSnapshot()
    }

    webdavSyncStatus.value = '清理远端孤立文件...'
    await cleanRemoteOrphans(auth)

    webdavLastSync.value = new Date().toLocaleString()
    await saveSetting('webdavLastSync', webdavLastSync.value)
    webdavSyncStatus.value = '备份成功'
    alert('所有选定数据已同步至 WebDAV 云端！')
  } catch (e: any) {
    webdavSyncStatus.value = '备份失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

const fullRestore = async () => {
  if (!webdavUrl.value || !confirm('确定要从云端恢复吗？这将替换您当前的本地书架与设置驱动。')) return
  try {
    await saveWebdav()
    webdavSyncing.value = true
    const preservedSettings = await getLocalOnlySettingsSnapshot()
    const preservedDesktopSettings = await getCurrentDesktopSettingsSnapshot()
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    const baseUrl = getCurrentPacilReadBaseUrl()

    // Try v8 JSON restore first
    webdavSyncStatus.value = '尝试 v8 JSON 恢复...'
    let v8Result = await fullRestoreV8((msg) => { webdavSyncStatus.value = msg })
    const isV8Restore = v8Result.success

    let chapterTextRestore = { downloaded: 0, missing: 0, total: 0 }
    let dlError: string | undefined

    if (!isV8Restore) {
      // Fallback to v7 SQLite format
      const appDataPath = await window.electronAPI.app.getPath('userData')
      const dstPath = appDataPath + '/reader.db.restore'
      webdavSyncStatus.value = 'v8 数据不存在，尝试旧格式...'
      const dl = await downloadFirstAvailable(
        [baseUrl + 'reader.db', getDesktopDatabaseBaseUrl() + 'reader.db'],
        dstPath,
        auth
      )
      if (!dl.error) {
        webdavSyncStatus.value = '应用数据库...'
        await window.electronAPI.db.importFromFile(dstPath)
        await restoreLocalOnlySettings(preservedSettings)
        dlError = dl.error
      } else {
        dlError = dl.error
      }
    }

    if (isV8Restore || !dlError) {
      webdavSyncStatus.value = '恢复章节正文...'
      chapterTextRestore = await downloadChapterTextZipsAndFiles(auth)
      await downloadCoverFiles(auth)
    }

    webdavSyncStatus.value = '应用桌面设置...'
    const desktopSettingsRestore = await restoreDesktopSettingsSnapshot()
    if (!desktopSettingsRestore.applied && desktopSettingsRestore.message) {
      await restoreDesktopSettingsValues(preservedDesktopSettings)
      await loadAllSettings()
      webdavSyncStatus.value = desktopSettingsRestore.message
    }

    if (webdavSyncReadingStats.value) {
      webdavSyncStatus.value = '合并阅读统计...'
      await mergeRemoteReadingStats()
    }
    await loadAllSettings()
    await fetchAllRules()
    await fetchBooks()
    await refreshReadingStatsSummary()

    if (!isV8Restore && dlError && !desktopSettingsRestore.applied) {
      throw new Error(`云端无备份数据: ${dlError}`)
    }

    const msg = !isV8Restore && dlError
      ? '桌面设置与阅读统计已从云端恢复，数据库快照不存在。'
      : chapterTextRestore.missing > 0
        ? `数据已恢复，但有 ${chapterTextRestore.missing}/${chapterTextRestore.total} 个外置章节正文缺失。`
        : '数据已从云端成功恢复！'
    alert(msg)
    webdavSyncStatus.value = '从云端恢复成功'
  } catch (e: any) {
    webdavSyncStatus.value = '恢复失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

const incrementalBackup = async () => {
  if (!webdavUrl.value) return
  try {
    await saveWebdav()
    webdavSyncing.value = true
    webdavSyncStatus.value = '准备增量同步...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    const baseUrl = getCurrentPacilReadBaseUrl()

    webdavSyncStatus.value = '创建云端目录...'
    await ensureSyncDirectories(auth, { includeDesktopDatabase: true })

    if (webdavSyncBookshelf.value) {
      // v8: Use JSON-based incremental sync with manifest comparison
      webdavSyncStatus.value = 'v8 增量备份（JSON 格式）...'
      const v8Result = await incrementalBackupV8((msg) => { webdavSyncStatus.value = msg })
      if (!v8Result.success) {
        throw new Error(`v8 增量备份失败: ${v8Result.error}`)
      }
      webdavSyncStatus.value = v8Result.uploadedFiles.length > 0
        ? `上传了 ${v8Result.uploadedFiles.length} 个文件`
        : '没有文件需要更新'
      await uploadBookChapterTextZips(auth)
    }

    const appDataPath = await window.electronAPI.app.getPath('userData')
    if (webdavSyncFiles.value) {
      const booksDir = appDataPath + '/books/'
      const { useDataStore: getStore } = await import('../composables/useDataStore')
      const store = getStore()
      if (!store.dataLoaded.value) await store.loadAllData()
      const bookFiles = store.books.value.map(b => b.sourceFile).filter(Boolean) as string[]
      for (let i = 0; i < bookFiles.length; i++) {
        const fileName = bookFiles[i]
        const remotePath = baseUrl + 'books/' + fileName
        const check = await window.electronAPI.webdav.request({ url: remotePath, method: 'HEAD', headers: { 'Authorization': `Basic ${auth}` } })
        if (check.status !== 200) {
          webdavSyncStatus.value = `上传书籍 (${i + 1}/${bookFiles.length})...`
          assertUploadSucceeded(
            await window.electronAPI.webdav.uploadFile(booksDir + fileName, remotePath, auth),
            '上传书籍'
          )
        }
      }
      const coversDir = appDataPath + '/covers/'
      const coverFiles = store.books.value.map(b => b.coverFile).filter(Boolean) as string[]
      for (let i = 0; i < coverFiles.length; i++) {
        const fileName = coverFiles[i]
        const remotePath = baseUrl + 'covers/' + fileName
        const check = await window.electronAPI.webdav.request({ url: remotePath, method: 'HEAD', headers: { 'Authorization': `Basic ${auth}` } })
        if (check.status !== 200) {
          webdavSyncStatus.value = `上传封面 (${i + 1}/${coverFiles.length})...`
          assertUploadSucceeded(
            await window.electronAPI.webdav.uploadFile(coversDir + fileName, remotePath, auth),
            '上传封面'
          )
        }
      }
    }

    if (webdavSyncUISettings.value || webdavSyncThemes.value || webdavSyncBackgrounds.value) {
      webdavSyncStatus.value = '上传桌面设置...'
      await uploadDesktopSettingsSnapshot()
    }

    if (webdavSyncReadingStats.value) {
      webdavSyncStatus.value = '上传阅读统计...'
      await uploadReadingStatsSnapshot()
    }

    webdavSyncStatus.value = '清理远端孤立文件...'
    await cleanRemoteOrphans(auth)

    webdavLastLiteSync.value = new Date().toLocaleString()
    await saveSetting('webdavLastLiteSync', webdavLastLiteSync.value)
    webdavSyncStatus.value = '增量同步成功'
    alert('增量同步已完成！（书架元数据、桌面设置与阅读统计已更新）')
  } catch (e: any) {
    webdavSyncStatus.value = '同步失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

const incrementalRestore = async () => {
  if (!webdavUrl.value || !confirm('确定要从云端增量恢复吗？这将覆盖您的书架列表与设置，但不会删除现有的本地缓存章节。')) return
  try {
    await saveWebdav()
    webdavSyncing.value = true
    const preservedSettings = await getLocalOnlySettingsSnapshot()
    const preservedDesktopSettings = await getCurrentDesktopSettingsSnapshot()
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)

    // Try v8 JSON incremental restore first
    webdavSyncStatus.value = '尝试 v8 JSON 增量恢复...'
    const v8Result = await incrementalRestoreV8((msg) => { webdavSyncStatus.value = msg })
    const isV8Restore = v8Result.success

    if (!isV8Restore) {
      // Fallback to v7 SQLite format
      const appDataPath = await window.electronAPI.app.getPath('userData')
      const dstPath = appDataPath + '/reader_lite.db.restore'
      const baseUrl = getCurrentPacilReadBaseUrl()
      webdavSyncStatus.value = 'v8 数据不存在，尝试旧格式...'
      const dl = await downloadFirstAvailable(
        [getDesktopDatabaseBaseUrl() + 'reader_lite.db', baseUrl + 'reader_lite.db'],
        dstPath,
        auth
      )
      if (!dl.error) {
        webdavSyncStatus.value = '应用增量数据库...'
        await window.electronAPI.db.importLiteFromFile(dstPath)
        await restoreLocalOnlySettings(preservedSettings)
      }
    }

    webdavSyncStatus.value = '应用桌面设置...'
    const desktopSettingsRestore = await restoreDesktopSettingsSnapshot()
    if (!desktopSettingsRestore.applied) {
      await restoreDesktopSettingsValues(preservedDesktopSettings)
      await loadAllSettings()
    }

    if (webdavSyncReadingStats.value) {
      webdavSyncStatus.value = '合并阅读统计...'
      await mergeRemoteReadingStats()
    }
    await loadAllSettings()
    await fetchAllRules()
    await fetchBooks()
    await refreshReadingStatsSummary()

    if (!isV8Restore && !desktopSettingsRestore.applied) {
      throw new Error('云端无增量备份数据，请考虑全量恢复')
    }

    const msg = isV8Restore
      ? (v8Result.mergedFiles.length > 0
          ? `v8增量恢复成功！合并了 ${v8Result.mergedFiles.length} 个文件。`
          : 'v8增量恢复完成，数据已是最新。')
      : '桌面设置与阅读统计已恢复。'
    alert(msg)
    webdavSyncStatus.value = '增量恢复成功'
  } catch (e: any) {
    webdavSyncStatus.value = '恢复失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

onMounted(async () => {
  await loadAllSettings()
  await fetchAllRules()
  await fetchBooks()
  await refreshReadingStatsSummary()
  try { appVersion.value = await window.electronAPI.app.getVersion() } catch (_) { appVersion.value = '?.?.?' }
  try { await refreshDbSize() } catch { dbSize.value = '—'; dbTextSize.value = '—'; dbTotalSize.value = '—' }
  window.electronAPI.updater.onStatus((data) => {
    switch (data.status) {
      case 'checking': updateStatus.value = '🔍 正在检查...'; break
      case 'available': updateStatus.value = `🎉 发现新版本 v${data.version}`; updateAvailable.value = true; isDownloading.value = false; break
      case 'up-to-date': updateStatus.value = '✅ 已是最新版本'; break
      case 'downloading': updateStatus.value = `⏬ 下载中 ${data.percent}%`; isDownloading.value = true; break
      case 'downloaded': updateStatus.value = '✅ 下载完成'; updateReady.value = true; updateAvailable.value = false; isDownloading.value = false; break
      case 'error': updateStatus.value = '❌ 更新失败'; updateDetail.value = data.message || ''; isDownloading.value = false; break
    }
  })
})
</script>

<template>
  <div class="pt-2 pb-20">
    <div class="mb-10 px-1">
      <h2 class="app-title text-[22px] font-semibold">偏好设置</h2>
      <p class="app-muted text-[13px] mt-1">定制 PacilRead 的各项核心行为与界面特质</p>
    </div>

    <!-- Sub-sections -->
    <SettingsAppearance />

    <SettingsDisplay :setAspectRatio="setAspectRatio" />
    
    <SettingsReading 
      :toggleKeyHints="toggleKeyHints"
      :toggleAutoOpenLastRead="toggleAutoOpenLastRead"
      :addNextKey="addNextKey"
      :removeNextKey="removeNextKey"
      :addPrevKey="addPrevKey"
      :removePrevKey="removePrevKey"
    />

    <SettingsReadingStats
      :trackingEnabled="readingTimeTrackingEnabled"
      :hidden="readingTimeStatsHidden"
      :hasHistory="readingStatsHasHistory"
      :loading="readingStatsLoading"
      :overview="readingStatsOverview"
      :onToggleTracking="handleToggleReadingStats"
      :onOpenStats="openReadingStats"
    />

    <SettingsWebDAV 
      :saveWebdav="saveWebdav"
      :testWebdav="testWebdav"
      :fullBackup="fullBackup"
      :fullRestore="fullRestore"
      :incrementalBackup="incrementalBackup"
      :incrementalRestore="incrementalRestore"
      :webdavTesting="webdavTesting"
      :webdavSyncing="webdavSyncing"
      :webdavSyncStatus="webdavSyncStatus"
      :webdavTestResult="webdavTestResult"
    />

    <SettingsTTS :saveMiMoKey="saveMiMoKey" />

    <SettingsRules 
      :rules="allRules"
      :getBookTitle="getBookTitle"
      :deleteRule="deleteRule"
      :toggleRuleActive="toggleRuleActive"
    />

    <SettingsAbout
      :appVersion="appVersion"
      :dbSize="dbSize"
      :dbTextSize="dbTextSize"
      :dbTotalSize="dbTotalSize"
      :onOpenMigration="openMigrationConfirm"
      :updateStatus="updateStatus"
      :updateDetail="updateDetail"
      :updateAvailable="updateAvailable"
      :updateReady="updateReady"
      :isDownloading="isDownloading"
      :downloadUpdate="downloadUpdate"
      :installNow="installNow"
      :checkForUpdate="checkForUpdate"
      :toggleSilentUpdate="toggleSilentUpdate"
    />

    <Transition name="fade">
      <div
        v-if="showReadingStatsDisableModal"
        class="fixed inset-0 app-modal-backdrop z-[210] flex items-center justify-center p-6"
        @click.self="cancelDisableReadingStats"
      >
        <div class="w-full max-w-md app-card app-card-strong p-6">
          <h3 class="text-[18px] font-semibold app-title">关闭阅读统计</h3>
          <p class="mt-2 text-[13px] app-muted leading-6">
            检测到你已经有阅读统计历史。你可以只关闭记录并隐藏入口，也可以清空本地与云端的全部统计数据。
          </p>

          <div class="mt-6 grid grid-cols-1 gap-3">
            <button
              @click="hideReadingStats"
              :disabled="readingStatsActionBusy"
              class="app-button app-button-primary w-full px-4 py-3 text-[13px] disabled:opacity-50"
            >
              只隐藏
            </button>
            <button
              @click="clearReadingStatsHistory"
              :disabled="readingStatsActionBusy"
              class="app-button app-button-danger w-full px-4 py-3 text-[13px] disabled:opacity-50"
            >
              清空历史
            </button>
            <button
              @click="cancelDisableReadingStats"
              :disabled="readingStatsActionBusy"
              class="app-button w-full px-4 py-3 text-[13px] disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Database storage optimize modal — non-dismissable while running -->
    <Teleport to="body">
      <div
        v-if="showMigrationModal"
        class="fixed inset-0 z-[300] flex items-center justify-center p-6"
        style="background: rgba(0,0,0,0.65); backdrop-filter: blur(8px);"
      >
        <div class="w-full max-w-md app-card app-card-strong p-6" @click.stop @keydown.escape.prevent>
          <h3 class="text-[18px] font-semibold app-title flex items-center gap-2">
            <span v-if="!migrationDone && !migrationError">⚙️</span>
            <span v-else-if="migrationDone">✅</span>
            <span v-else>❌</span>
            优化数据库存储
          </h3>

          <!-- Confirm stage -->
          <template v-if="!migrationRunning && !migrationDone && !migrationError">
            <p class="mt-3 text-[13px] app-muted leading-6">
              即将把库内章节正文导出为 GZIP 文件，并清空 reader.db 内的冗余正文后回收空间。
            </p>
            <div class="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p class="text-[12px] text-amber-200 font-semibold leading-5">
                优化期间请勿关闭应用或断电。大书库可能需要数十秒，已完成的章节可在下次继续跳过。
              </p>
            </div>
            <div class="mt-6 flex gap-3">
              <button
                @click="closeMigrationModal"
                class="flex-1 py-3 px-4 glass-card rounded-xl text-[13px] border border-white/5"
              >
                取消
              </button>
              <button
                @click="startMigration"
                class="flex-1 py-3 px-4 bg-blue-600 rounded-xl text-[13px] font-bold shadow-lg shadow-blue-500/20"
              >
                开始优化
              </button>
            </div>
          </template>

          <!-- Running stage -->
          <template v-if="migrationRunning">
            <p class="mt-3 text-[13px] app-muted leading-6">
              正在优化数据库，请耐心等待，不要关闭应用...
            </p>
            <div class="mt-4 space-y-2">
              <div class="flex justify-between text-[12px] app-muted">
                <span>{{ migrationMessage || '准备中...' }}</span>
                <span class="font-mono">{{ migrationStep }} / {{ migrationTotal }}</span>
              </div>
              <div class="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  class="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                  :style="{ width: Math.max(4, (migrationTotal > 0 ? (migrationStep / migrationTotal) * 100 : 0)) + '%' }"
                ></div>
              </div>
            </div>
          </template>

          <!-- Done stage -->
          <template v-if="migrationDone">
            <p class="mt-3 text-[13px] app-positive-text leading-6">
              数据库已完成 v7 深度瘦身。
            </p>
            <div class="mt-6">
              <button
                @click="closeMigrationModal"
                class="w-full py-3 px-4 bg-blue-600 rounded-xl text-[13px] font-bold shadow-lg shadow-blue-500/20"
              >
                完成
              </button>
            </div>
          </template>

          <!-- Error stage -->
          <template v-if="migrationError">
            <p class="mt-3 text-[13px] text-red-300 leading-6">
              优化失败：{{ migrationError }}
            </p>
            <div class="mt-6 flex gap-3">
              <button
                @click="closeMigrationModal"
                class="flex-1 py-3 px-4 glass-card rounded-xl text-[13px] border border-white/5"
              >
                关闭
              </button>
              <button
                @click="startMigration"
                class="flex-1 py-3 px-4 bg-blue-600 rounded-xl text-[13px] font-bold shadow-lg shadow-blue-500/20"
              >
                重试
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Individual section animations (can be added if needed, but the list is already cleaner) */
</style>
