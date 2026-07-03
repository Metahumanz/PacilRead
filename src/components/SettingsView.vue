<script setup lang="ts">
import { computed, ref, onMounted, watch, type Component } from 'vue'
import { clampBookshelfProgressPrefetchLimit, useSettings } from '../composables/useSettings'
import {
  applySyncResolution,
  fullBackupV8, fullRestoreV8, incrementalBackupV8,
  previewSyncDiff,
  type SyncDiffPreview,
  type SyncResolutionMap,
} from '../composables/useV8Sync'
import { useDataStore } from '../composables/useDataStore'
import { useRuleManager } from '../composables/useRuleManager'
import { useUpdaterStatus } from '../composables/useUpdaterStatus'
import type { ReadingStatsOverview } from '../composables/useReadingStats'
import { hasReadingStatsHistory } from '../utils/readingStatsAvailability'
import { buildPacilReadBaseUrl, extractHrefValues, sanitizeWebdavDirectorySegment } from '../utils/webdav'

import SettingsCategoryPane from './settings/SettingsCategoryPane.vue'
import { addShortcutBinding } from '../utils/keyboardShortcuts'
import { notifyError } from '../composables/useNotifications'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'refresh-settings'): void
  (e: 'open-reading-stats'): void
}>()

const settings = useSettings()
const {
  loadAllSettings, saveSetting,
  showKeyHints, nextKeys, prevKeys,
  webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
  webdavSyncBookshelf, webdavSyncFiles, webdavSyncUISettings,
  webdavSyncThemes, webdavSyncBackgrounds, webdavLastSync, webdavLastLiteSync,
  autoOpenLastRead, silentUpdate, ttsMiMoApiKey,
  webdavDesktopSettingsDir, bookshelfProgressPrefetchLimit,
  webdavSyncReadingStats,
  readingTimeTrackingEnabled, readingTimeStatsHidden
} = settings

// Update related state
const dataSize = ref('')
const chapterTextSize = ref('')
const jsonDataSize = ref('')
const totalDataSize = ref('')

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '—'
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

const refreshStorageSize = async () => {
  const sz = await window.electronAPI.library.getSize()
  dataSize.value = ''
  chapterTextSize.value = formatBytes(sz.chapterTextBytes)
  jsonDataSize.value = formatBytes(sz.jsonDataBytes ?? 0)
  totalDataSize.value = formatBytes(sz.totalBytes ?? sz.sizeBytes)
}
const {
  appVersion,
  updateStatus,
  updateDetail,
  updateAvailable,
  updateReady,
  isDownloading,
  initializeUpdaterStatus,
  checkForUpdate,
  downloadUpdate,
  installNow,
  toggleSilentUpdate,
} = useUpdaterStatus(silentUpdate)

// WebDAV related status
const webdavTestResult = ref('')
const webdavTesting = ref(false)
const webdavSyncing = ref(false)
const webdavSyncStatus = ref('')
const readingStatsLoading = ref(false)
const syncDiffPreview = ref<SyncDiffPreview | null>(null)
const syncDiffResolution = ref<SyncResolutionMap>({})
const syncDiffLoading = ref(false)
const syncDiffApplying = ref(false)
const readingStatsHasHistory = ref(false)
const readingStatsOverview = ref<ReadingStatsOverview>({
  today: 0,
  week: 0,
  last7Days: 0,
  month: 0,
  last30Days: 0,
  year: 0,
  last365Days: 0,
})
const showReadingStatsDisableModal = ref(false)
const readingStatsActionBusy = ref(false)
const shortcutMessage = ref('')

type SettingsCategory = 'appearance' | 'reading' | 'data' | 'sync' | 'about'
const activeCategory = ref<SettingsCategory>('appearance')
const settingsCategories: Array<{ key: SettingsCategory; label: string; icon: string; description: string }> = [
  { key: 'appearance', label: '外观显示', icon: '◐', description: '主题、布局与首页' },
  { key: 'reading', label: '阅读与听书', icon: '▷', description: '交互、语音与规则' },
  { key: 'data', label: '统计与恢复', icon: '◫', description: '阅读数据与恢复点' },
  { key: 'sync', label: '云同步', icon: '⇅', description: 'WebDAV 与备份' },
  { key: 'about', label: '关于', icon: 'ⓘ', description: '版本、更新与存储' },
]

type SettingsLoader = () => Promise<{ default: Component }>
interface SettingsPaneItem {
  key: string
  loader: SettingsLoader
  props?: Record<string, unknown>
}
const loadReadingStatsApi = () => import('../composables/useReadingStats')
type ReadingStatsApi = typeof import('../composables/useReadingStats')
type DesktopSettingsUploadResult = Awaited<ReturnType<ReadingStatsApi['uploadDesktopSettingsSnapshot']>>
type DesktopSettingsRestoreResult = Awaited<ReturnType<ReadingStatsApi['restoreDesktopSettingsSnapshot']>>
const settingsLoaders: Record<string, SettingsLoader> = {
  appearance: () => import('./settings/SettingsAppearance.vue'),
  display: () => import('./settings/SettingsDisplay.vue'),
  reading: () => import('./settings/SettingsReading.vue'),
  tts: () => import('./settings/SettingsTTS.vue'),
  rules: () => import('./settings/SettingsRules.vue'),
  readingStats: () => import('./settings/SettingsReadingStats.vue'),
  snapshots: () => import('./settings/SettingsSnapshots.vue'),
  webdav: () => import('./settings/SettingsWebDAV.vue'),
  about: () => import('./settings/SettingsAbout.vue'),
}

const {
  allRules,
  fetchAllRules,
  fetchBooks,
  getBookTitle,
  deleteRule,
  toggleRuleActive,
} = useRuleManager()

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
  bookshelfProgressPrefetchLimit.value = clampBookshelfProgressPrefetchLimit(bookshelfProgressPrefetchLimit.value)
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
  await saveSetting('bookshelf_progress_prefetch_limit', String(bookshelfProgressPrefetchLimit.value))
}

const testWebdav = async () => {
  if (!webdavUrl.value) { webdavTestResult.value = '❌ 请填写服务器地址'; return }
  webdavTesting.value = true
  webdavTestResult.value = '连接中...'
  try {
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
      await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}database/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
      await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}sync/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
      await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}chapter_text/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
      await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}readingStats/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
      await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}${webdavDesktopSettingsDir.value}/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
      await window.electronAPI.webdav.request({ url: `${pacilReadBaseUrl}${webdavDesktopSettingsDir.value}/backgrounds/`, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    }
    else webdavTestResult.value = `❌失败(HTTP ${res.status}): ` + (res.data ? res.data.substring(0, 30) : '')
  } catch (e: any) {
    webdavTestResult.value = '❌ 错误: ' + (e?.message || String(e))
  } finally {
    webdavTesting.value = false
  }
}

const toggleKeyHints = async () => {
  await saveSetting('hideKeyHints', (!showKeyHints.value).toString())
}

const toggleAutoOpenLastRead = async () => {
  await saveSetting('autoOpenLastRead', autoOpenLastRead.value ? 'true' : 'false')
}

const reportShortcutResult = (result: ReturnType<typeof addShortcutBinding>, direction: '上一页' | '下一页') => {
  if (result.status === 'conflict') shortcutMessage.value = `该按键已绑定到${direction}，不能重复使用。`
  else if (result.status === 'duplicate') shortcutMessage.value = '该按键已在当前绑定中。'
  else if (result.status === 'ignored') shortcutMessage.value = '请输入非修饰键的有效按键。'
  else shortcutMessage.value = ''
  if (shortcutMessage.value) notifyError(shortcutMessage.value)
}

const addNextKey = async (e: KeyboardEvent) => {
  const result = addShortcutBinding(nextKeys.value, prevKeys.value, e.key)
  reportShortcutResult(result, '上一页')
  if (result.status === 'added') {
    nextKeys.value = result.keys
    await saveSetting('reader_nextKeys', JSON.stringify(nextKeys.value))
  }
}
const removeNextKey = async (k: string) => {
  nextKeys.value = nextKeys.value.filter(x => x !== k)
  shortcutMessage.value = ''
  await saveSetting('reader_nextKeys', JSON.stringify(nextKeys.value))
}

const addPrevKey = async (e: KeyboardEvent) => {
  const result = addShortcutBinding(prevKeys.value, nextKeys.value, e.key)
  reportShortcutResult(result, '下一页')
  if (result.status === 'added') {
    prevKeys.value = result.keys
    await saveSetting('reader_prevKeys', JSON.stringify(prevKeys.value))
  }
}
const removePrevKey = async (k: string) => {
  prevKeys.value = prevKeys.value.filter(x => x !== k)
  shortcutMessage.value = ''
  await saveSetting('reader_prevKeys', JSON.stringify(prevKeys.value))
}

const saveMiMoKey = async () => {
  await saveSetting('reader_ttsMiMoApiKey', ttsMiMoApiKey.value.trim())
}

const getCurrentPacilReadBaseUrl = () => buildPacilReadBaseUrl(webdavUrl.value, webdavDir.value)
const getDesktopPrivateBaseUrl = () => {
  const desktopDir = sanitizeWebdavDirectorySegment(webdavDesktopSettingsDir.value)
  return `${getCurrentPacilReadBaseUrl()}${desktopDir}/`
}
const ensureWebdavCollection = async (url: string, auth: string) => {
  await window.electronAPI.webdav.request({ url, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
}

const ensureSyncDirectories = async (auth: string, options: { includeChapterText?: boolean } = {}) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  await ensureWebdavCollection(baseUrl, auth)
  await ensureWebdavCollection(baseUrl + 'database/', auth)
  await ensureWebdavCollection(baseUrl + 'sync/', auth)
  await ensureWebdavCollection(baseUrl + 'books/', auth)
  await ensureWebdavCollection(baseUrl + 'covers/', auth)
  if (options.includeChapterText) await ensureWebdavCollection(baseUrl + 'chapter_text/', auth)
  await ensureWebdavCollection(baseUrl + 'readingStats/', auth)
  await ensureWebdavCollection(getDesktopPrivateBaseUrl(), auth)
  await ensureWebdavCollection(getDesktopPrivateBaseUrl() + 'backgrounds/', auth)
}

const assertUploadSucceeded = (result: { success: boolean; status?: number; error?: string }, label: string) => {
  if (result.error || result.success === false) {
    throw new Error(result.error || `${label}失败 (HTTP ${result.status || 'unknown'})`)
  }
}

const remoteFileExists = async (url: string, auth: string) => {
  try {
    const response = await window.electronAPI.webdav.request({
      url,
      method: 'HEAD',
      headers: { Authorization: `Basic ${auth}` },
    })
    return response.status === 200
  } catch (_) {
    return false
  }
}

const getFileNameFromPath = (value: string) => {
  const clean = String(value || '').split(/[?#]/)[0]
  return clean.split(/[\\/]/).pop() || ''
}

const resolveRemoteHref = (href: string, baseUrl: string) => {
  try { return new URL(href, baseUrl).toString() } catch (_) { return href }
}

const chapterTextZipFileName = (bookId: number) => `book_${bookId}.zip`
const legacyChapterTextZipFileName = (bookId: number) => `chapters_${bookId}.zip`

const uploadBookChapterTextZips = async (auth: string) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  const bookIds = await window.electronAPI.library.getBookIdsWithFileGzipChapters()
  if (bookIds.length === 0) return { uploaded: 0, skipped: 0, total: 0 }

  const chapterBaseUrl = baseUrl + 'chapter_text/'
  await ensureWebdavCollection(chapterBaseUrl, auth)

  let uploaded = 0
  let skipped = 0
  for (let i = 0; i < bookIds.length; i++) {
    const bookId = bookIds[i]
    const remotePath = chapterBaseUrl + chapterTextZipFileName(bookId)
    const legacyRemotePath = chapterBaseUrl + legacyChapterTextZipFileName(bookId)

    webdavSyncStatus.value = `检查章节正文 ZIP (${i + 1}/${bookIds.length})...`
    const exists = await remoteFileExists(remotePath, auth) || await remoteFileExists(legacyRemotePath, auth)
    if (exists) {
      skipped += 1
      continue
    }

    webdavSyncStatus.value = `上传缺失章节正文 ZIP (${i + 1}/${bookIds.length})...`
    const zipPath = await window.electronAPI.library.createBookChapterTextZip(bookId)
    if (!zipPath) continue
    assertUploadSucceeded(
      await window.electronAPI.webdav.uploadFile(zipPath, remotePath, auth),
      '上传章节正文 ZIP'
    )
    uploaded += 1
  }
  return { uploaded, skipped, total: bookIds.length }
}

const downloadChapterTextZips = async (auth: string) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  // Fallback: old backups may be under a nested PacilRead/ prefix
  const legacyBase = baseUrl + 'PacilRead/'
  const appDataPath = await window.electronAPI.app.getPath('userData')
  const bookIds = await window.electronAPI.library.getBookIdsWithFileGzipChapters()
  let downloaded = 0
  let missing = 0
  let skipped = 0

  const tryDownloadZip = async (remotePath: string, tempZipPath: string): Promise<boolean> => {
    try {
      const result = await window.electronAPI.webdav.downloadFile(remotePath, tempZipPath, auth)
      if (!result.success) return false
      const extracted = await window.electronAPI.library.extractBookChapterTextZip(tempZipPath)
      return extracted > 0
    } catch (_) {
      return false
    }
  }

  for (let i = 0; i < bookIds.length; i++) {
    const bookId = bookIds[i]
    webdavSyncStatus.value = `检查本地章节正文 (${i + 1}/${bookIds.length})...`
    const hasLocalText = await window.electronAPI.library.hasBookChapterTextFiles(bookId)
    if (hasLocalText) {
      skipped += 1
      continue
    }

    webdavSyncStatus.value = `下载缺失章节正文 ZIP (${i + 1}/${bookIds.length})...`

    const tempZipPath = appDataPath + '/book_' + bookId + '.tmp.zip'
    const ok = await tryDownloadZip(
      baseUrl + 'chapter_text/' + chapterTextZipFileName(bookId), tempZipPath
    ) || await tryDownloadZip(
      legacyBase + 'chapter_text/' + chapterTextZipFileName(bookId), tempZipPath
    ) || await tryDownloadZip(
      baseUrl + 'chapter_text/' + legacyChapterTextZipFileName(bookId), tempZipPath
    ) || await tryDownloadZip(
      legacyBase + 'chapter_text/' + legacyChapterTextZipFileName(bookId), tempZipPath
    )
    if (ok) { downloaded += 1; continue }
    missing += 1
  }

  return { downloaded, missing, skipped, total: bookIds.length }
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
      const zipFiles = hrefs.filter((f: string) => /(?:book|chapters)_\d+\.zip$/.test(f))
      const bookIds = await window.electronAPI.library.getBookIdsWithFileGzipChapters()
      const bookIdSet = new Set(bookIds)
      for (const zipFile of zipFiles) {
        const match = zipFile.match(/(?:book|chapters)_(\d+)\.zip$/)
        if (match) {
          const remoteBookId = parseInt(match[1])
          if (!bookIdSet.has(remoteBookId)) {
            await window.electronAPI.webdav.request({
              url: resolveRemoteHref(zipFile, chapterTextDir), method: 'DELETE',
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
      const dataStore = useDataStore()
      if (!dataStore.dataLoaded.value) await dataStore.loadAllData()
      const usedCovers = dataStore.books.value
        .map(book => book.coverFile ? getFileNameFromPath(book.coverFile) : '')
        .filter(Boolean)
      const usedSet = new Set(usedCovers)
      for (const coverFile of coverFiles) {
        const fileName = coverFile.split('/').pop() || ''
        if (fileName && !usedSet.has(fileName)) {
          await window.electronAPI.webdav.request({
            url: resolveRemoteHref(coverFile, coversDir), method: 'DELETE',
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
      const dataStore = useDataStore()
      if (!dataStore.dataLoaded.value) await dataStore.loadAllData()
      const usedBooks = dataStore.books.value
        .map(book => book.sourceFile ? getFileNameFromPath(book.sourceFile) : '')
        .filter(Boolean)
      const usedSet = new Set(usedBooks)
      for (const bookFile of bookFiles) {
        const fileName = bookFile.split('/').pop() || ''
        if (fileName && !usedSet.has(fileName)) {
          await window.electronAPI.webdav.request({
            url: resolveRemoteHref(bookFile, booksDir), method: 'DELETE',
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
      const { fetchReadingStatsOverview } = await loadReadingStatsApi()
      readingStatsOverview.value = await fetchReadingStatsOverview()
    } else {
      readingStatsOverview.value = {
        today: 0,
        week: 0,
        last7Days: 0,
        month: 0,
        last30Days: 0,
        year: 0,
        last365Days: 0,
      }
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
  const {
    clearLocalReadingStats, deleteRemoteReadingStatsFiles,
    getAllLocalReadingStatsRows, restoreReadingStatsRows,
  } = await loadReadingStatsApi()
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
    const { uploadDesktopSettingsSnapshot, uploadReadingStatsSnapshot } = await loadReadingStatsApi()
    await saveWebdav()
    webdavSyncing.value = true
    webdavSyncStatus.value = '准备备份...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    const baseUrl = getCurrentPacilReadBaseUrl()
    let desktopSettingsBackup: DesktopSettingsUploadResult | null = null

    webdavSyncStatus.value = '创建云端目录...'
    await ensureSyncDirectories(auth, { includeChapterText: true })

    if (webdavSyncUISettings.value || webdavSyncThemes.value || webdavSyncBackgrounds.value) {
      webdavSyncStatus.value = '上传桌面设置...'
      desktopSettingsBackup = await uploadDesktopSettingsSnapshot()
    }

    if (webdavSyncBookshelf.value) {
      // v8: Upload JSON data files.
      webdavSyncStatus.value = '上传 v8 JSON 数据...'
      const v8Result = await fullBackupV8((msg) => { webdavSyncStatus.value = msg })
      if (!v8Result.success) {
        throw new Error(`v8 备份失败: ${v8Result.error}`)
      }
      await uploadBookChapterTextZips(auth)
    }

    const appDataPath = await window.electronAPI.app.getPath('userData')
    if (webdavSyncFiles.value) {
      const booksDir = appDataPath + '/books/'
      const store = useDataStore()
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

    if (webdavSyncReadingStats.value) {
      webdavSyncStatus.value = '上传阅读统计...'
      await uploadReadingStatsSnapshot()
    }

    webdavSyncStatus.value = '清理远端孤立文件...'
    await cleanRemoteOrphans(auth)

    webdavLastSync.value = new Date().toLocaleString()
    await saveSetting('webdavLastSync', webdavLastSync.value)
    webdavSyncStatus.value = '备份成功'
    alert(`所有选定数据已同步至 WebDAV 云端！${formatDesktopSettingsBackupStatus(desktopSettingsBackup)}`)
  } catch (e: any) {
    webdavSyncStatus.value = '备份失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

const formatDesktopSettingsRestoreStatus = (
  result: DesktopSettingsRestoreResult
) => {
  if (!result.applied) return result.message || '云端没有桌面设置文件，已保留当前设置'

  const details = [`${result.settingsCount} 项桌面设置`]
  if (result.backgroundsDownloaded > 0) details.push(`${result.backgroundsDownloaded} 张背景图`)
  if (result.backgroundsMissing > 0) details.push(`${result.backgroundsMissing} 张背景图未下载`)
  return `已应用 ${details.join('，')}`
}

const applyLegacyDesktopSettingsFallback = async (
  desktopSettingsRestore: DesktopSettingsRestoreResult,
  fallback?: Record<string, string>
) => {
  if (desktopSettingsRestore.applied) {
    return formatDesktopSettingsRestoreStatus(desktopSettingsRestore)
  }

  const fallbackCount = fallback ? Object.keys(fallback).length : 0
  if (fallbackCount === 0) {
    return formatDesktopSettingsRestoreStatus(desktopSettingsRestore)
  }

  const { restoreDesktopSettingsValues } = await loadReadingStatsApi()
  await restoreDesktopSettingsValues(fallback!)
  return `云端没有 desktop-settings.json，已从旧版 sync/settings.json 应用 ${fallbackCount} 项桌面设置`
}

const formatDesktopSettingsBackupStatus = (
  result: DesktopSettingsUploadResult | null
) => {
  if (!result) return '桌面设置同步未开启'
  if (!result.uploaded) return result.message || '桌面设置未上传'

  const details = [`${result.settingsCount} 项桌面设置`]
  if (result.backgroundsUploaded > 0) details.push(`${result.backgroundsUploaded} 张背景图`)
  if (result.backgroundsFailed > 0) details.push(`${result.backgroundsFailed} 张背景图上传失败`)
  return `桌面设置已上传：${details.join('，')}`
}

const reloadRestoredState = async () => {
  const dataStore = useDataStore()
  dataStore.dataLoaded.value = false
  await dataStore.loadAllData()
  await loadAllSettings()
  await fetchAllRules()
  await fetchBooks()
  await refreshReadingStatsSummary()
  emit('refresh-settings')
}

const defaultSyncResolution = (status: string): SyncResolutionMap[string] => {
  if (status === 'remote') return 'remote'
  if (status === 'local') return 'local'
  return 'merge'
}

const openSyncDiffPreview = async () => {
  if (!webdavUrl.value) return
  try {
    await saveWebdav()
    syncDiffLoading.value = true
    webdavSyncing.value = true
    webdavSyncStatus.value = '正在生成 WebDAV 差异预览...'
    const result = await previewSyncDiff()
    if (!result.success || !result.preview) {
      throw new Error(result.error || '无法生成差异预览')
    }
    syncDiffPreview.value = result.preview
    const nextResolution: SyncResolutionMap = {}
    for (const item of result.preview.items) {
      if (item.status === 'unchanged') continue
      nextResolution[item.id] = defaultSyncResolution(item.status)
    }
    syncDiffResolution.value = nextResolution
    webdavSyncStatus.value = `发现 ${result.preview.summary.conflict} 个冲突，${result.preview.summary.remote} 个远端新增，${result.preview.summary.local} 个本地独有`
  } catch (e: any) {
    webdavSyncStatus.value = '差异预览失败: ' + (e.message || '网络错误')
  } finally {
    syncDiffLoading.value = false
    webdavSyncing.value = false
  }
}

const closeSyncDiffPreview = () => {
  syncDiffPreview.value = null
  syncDiffResolution.value = {}
}

const setSyncDiffResolution = (id: string, choice: 'local' | 'remote' | 'merge') => {
  syncDiffResolution.value = { ...syncDiffResolution.value, [id]: choice }
}

const applySyncDiffPreview = async () => {
  if (!syncDiffPreview.value) return
  try {
    syncDiffApplying.value = true
    webdavSyncing.value = true
    const result = await applySyncResolution(syncDiffResolution.value, (msg) => {
      webdavSyncStatus.value = msg
    })
    if (!result.success) {
      throw new Error(result.error || '应用差异失败')
    }
    await reloadRestoredState()
    webdavSyncStatus.value = `差异已应用，更新 ${result.appliedFiles.length} 个同步文件`
    closeSyncDiffPreview()
    alert('WebDAV 差异已按选择应用，并已创建本地恢复点。')
  } catch (e: any) {
    webdavSyncStatus.value = '应用差异失败: ' + (e.message || '网络错误')
  } finally {
    syncDiffApplying.value = false
    webdavSyncing.value = false
  }
}

const fullRestore = async () => {
  if (!webdavUrl.value || !confirm('确定要从云端恢复吗？这将替换您当前的本地书架与设置驱动。')) return
  try {
    const {
      getLocalOnlySettingsSnapshot, mergeRemoteReadingStats,
      restoreDesktopSettingsSnapshot, restoreLocalOnlySettings,
    } = await loadReadingStatsApi()
    await saveWebdav()
    webdavSyncing.value = true
    const preservedLocalOnlySettings = await getLocalOnlySettingsSnapshot()
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    let chapterTextRestore = { downloaded: 0, missing: 0, skipped: 0, total: 0 }

    webdavSyncStatus.value = '恢复 v8 JSON 数据...'
    const v8Result = await fullRestoreV8((msg) => { webdavSyncStatus.value = msg })
    await restoreLocalOnlySettings(preservedLocalOnlySettings)
    if (v8Result.success) {
      webdavSyncStatus.value = '补齐缺失章节正文...'
      chapterTextRestore = await downloadChapterTextZips(auth)
    } else {
      webdavSyncStatus.value = 'v8 书架数据不可用，尝试恢复桌面设置...'
    }

    webdavSyncStatus.value = '应用桌面设置...'
    const desktopSettingsRestore = await restoreDesktopSettingsSnapshot()
    const desktopSettingsStatus = await applyLegacyDesktopSettingsFallback(
      desktopSettingsRestore,
      v8Result.desktopSettingsFallback
    )
    await restoreLocalOnlySettings(preservedLocalOnlySettings)
    if (!v8Result.success && !desktopSettingsRestore.applied) {
      throw new Error(v8Result.error || desktopSettingsRestore.message || '云端没有可用的恢复数据')
    }

    if (webdavSyncReadingStats.value) {
      webdavSyncStatus.value = '合并阅读统计...'
      await mergeRemoteReadingStats()
    }
    await reloadRestoredState()

    const msg = v8Result.success
      ? (chapterTextRestore.missing > 0
          ? `数据已恢复，${desktopSettingsStatus}，但有 ${chapterTextRestore.missing}/${chapterTextRestore.total} 个章节正文 ZIP 未下载或解压失败。`
          : `数据已从云端成功恢复，${desktopSettingsStatus}，补齐 ${chapterTextRestore.downloaded} 个正文 ZIP。`)
      : `未找到完整书架备份，但${desktopSettingsStatus}。`
    alert(msg)
    webdavSyncStatus.value = '从云端恢复成功'
  } catch (e: any) {
    webdavSyncStatus.value = '恢复失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

const incrementalBackup = async () => {
  if (!webdavUrl.value) return
  try {
    const { uploadDesktopSettingsSnapshot, uploadReadingStatsSnapshot } = await loadReadingStatsApi()
    await saveWebdav()
    webdavSyncing.value = true
    webdavSyncStatus.value = '准备增量同步...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    const baseUrl = getCurrentPacilReadBaseUrl()
    let desktopSettingsBackup: DesktopSettingsUploadResult | null = null

    webdavSyncStatus.value = '创建云端目录...'
    await ensureSyncDirectories(auth, { includeChapterText: true })

    if (webdavSyncUISettings.value || webdavSyncThemes.value || webdavSyncBackgrounds.value) {
      webdavSyncStatus.value = '上传桌面设置...'
      desktopSettingsBackup = await uploadDesktopSettingsSnapshot()
    }

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
      const store = useDataStore()
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
    alert(`增量同步已完成！（书架元数据、桌面设置与阅读统计已更新）${formatDesktopSettingsBackupStatus(desktopSettingsBackup)}`)
  } catch (e: any) {
    webdavSyncStatus.value = '同步失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

const incrementalRestore = async () => {
  await openSyncDiffPreview()
}

const activeCategoryItems = computed<SettingsPaneItem[]>(() => {
  switch (activeCategory.value) {
    case 'appearance':
      return [
        { key: 'appearance', loader: settingsLoaders.appearance },
        { key: 'display', loader: settingsLoaders.display, props: { setAspectRatio } },
      ]
    case 'reading':
      return [
        {
          key: 'reading', loader: settingsLoaders.reading, props: {
            toggleKeyHints, toggleAutoOpenLastRead, addNextKey, removeNextKey,
            addPrevKey, removePrevKey, shortcutMessage: shortcutMessage.value,
          },
        },
        { key: 'tts', loader: settingsLoaders.tts, props: { saveMiMoKey } },
        {
          key: 'rules', loader: settingsLoaders.rules, props: {
            rules: allRules.value, getBookTitle, deleteRule, toggleRuleActive,
          },
        },
      ]
    case 'data':
      return [
        {
          key: 'readingStats', loader: settingsLoaders.readingStats, props: {
            trackingEnabled: readingTimeTrackingEnabled.value,
            hidden: readingTimeStatsHidden.value,
            hasHistory: readingStatsHasHistory.value,
            loading: readingStatsLoading.value,
            overview: readingStatsOverview.value,
            onToggleTracking: handleToggleReadingStats,
            onOpenStats: openReadingStats,
          },
        },
        { key: 'snapshots', loader: settingsLoaders.snapshots },
      ]
    case 'sync':
      return [{
        key: 'webdav', loader: settingsLoaders.webdav, props: {
          saveWebdav, testWebdav, fullBackup, fullRestore, incrementalBackup, incrementalRestore,
          syncDiffPreview: syncDiffPreview.value,
          syncDiffResolution: syncDiffResolution.value,
          syncDiffLoading: syncDiffLoading.value,
          syncDiffApplying: syncDiffApplying.value,
          openSyncDiffPreview, applySyncDiffPreview, closeSyncDiffPreview, setSyncDiffResolution,
          webdavTesting: webdavTesting.value,
          webdavSyncing: webdavSyncing.value,
          webdavSyncStatus: webdavSyncStatus.value,
          webdavTestResult: webdavTestResult.value,
        },
      }]
    case 'about':
      return [{
        key: 'about', loader: settingsLoaders.about, props: {
          appVersion: appVersion.value,
          dataSize: dataSize.value,
          chapterTextSize: chapterTextSize.value,
          jsonDataSize: jsonDataSize.value,
          totalDataSize: totalDataSize.value,
          updateStatus: updateStatus.value,
          updateDetail: updateDetail.value,
          updateAvailable: updateAvailable.value,
          updateReady: updateReady.value,
          isDownloading: isDownloading.value,
          downloadUpdate, installNow, checkForUpdate, toggleSilentUpdate,
        },
      }]
  }
})

const initializedCategories = new Set<SettingsCategory>()
const initializeCategory = async (category: SettingsCategory) => {
  if (initializedCategories.has(category)) return
  try {
    if (category === 'reading') await Promise.all([fetchAllRules(), fetchBooks()])
    else if (category === 'data') await refreshReadingStatsSummary()
    else if (category === 'about') {
      await initializeUpdaterStatus()
      try { await refreshStorageSize() } catch { dataSize.value = '—'; chapterTextSize.value = '—'; jsonDataSize.value = '—'; totalDataSize.value = '—' }
    }
    initializedCategories.add(category)
  } catch (error) {
    console.error(`Failed to initialize settings category ${category}:`, error)
  }
}

watch(activeCategory, category => { void initializeCategory(category) })

onMounted(async () => {
  await loadAllSettings()
  await initializeCategory(activeCategory.value)
})
</script>

<template>
  <div class="pt-2 pb-20">
    <div class="mb-10 px-1">
      <h2 class="app-title text-[22px] font-semibold">偏好设置</h2>
      <p class="app-muted text-[13px] mt-1">定制 PacilRead 的各项核心行为与界面特质</p>
    </div>

    <div class="settings-layout">
      <nav class="settings-category-nav" aria-label="设置分类">
        <button
          v-for="category in settingsCategories"
          :key="category.key"
          type="button"
          class="settings-category-button"
          :class="{ active: activeCategory === category.key }"
          :aria-current="activeCategory === category.key ? 'page' : undefined"
          @click="activeCategory = category.key"
        >
          <span class="settings-category-icon" aria-hidden="true">{{ category.icon }}</span>
          <span>
            <strong>{{ category.label }}</strong>
            <small>{{ category.description }}</small>
          </span>
        </button>
      </nav>

      <main class="settings-category-content">
        <KeepAlive :max="5">
          <SettingsCategoryPane
            :key="activeCategory"
            :items="activeCategoryItems"
          />
        </KeepAlive>
      </main>
    </div>

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

  </div>
</template>

<style scoped>
.settings-layout { display:grid; grid-template-columns:180px minmax(0, 1fr); align-items:start; gap:30px; }
.settings-category-nav { position:sticky; top:18px; display:grid; gap:6px; }
.settings-category-button { display:grid; grid-template-columns:24px 1fr; gap:10px; align-items:start; width:100%; padding:11px 12px; border:1px solid transparent; border-radius:12px; color:var(--app-text-muted); background:transparent; text-align:left; cursor:pointer; transition:background .18s ease, border-color .18s ease, color .18s ease; }
.settings-category-button:hover { color:var(--app-text); background:var(--app-surface-secondary); }
.settings-category-button.active { color:var(--app-accent); border-color:color-mix(in srgb, var(--app-accent) 30%, transparent); background:color-mix(in srgb, var(--app-accent) 10%, transparent); }
.settings-category-button strong { display:block; font-size:13px; line-height:1.45; }
.settings-category-button small { display:block; margin-top:2px; font-size:10px; line-height:1.4; color:var(--app-text-muted); }
.settings-category-icon { display:grid; place-items:center; width:23px; height:23px; border-radius:7px; background:var(--app-surface); font-size:13px; }
.settings-category-content { min-width:0; }
@media (max-width:760px) {
  .settings-layout { display:block; }
  .settings-category-nav { position:sticky; z-index:20; top:0; display:flex; gap:8px; margin:0 -12px 22px; padding:10px 12px; overflow-x:auto; background:color-mix(in srgb, var(--app-bg) 90%, transparent); backdrop-filter:blur(16px); scrollbar-width:none; }
  .settings-category-nav::-webkit-scrollbar { display:none; }
  .settings-category-button { flex:0 0 auto; display:flex; align-items:center; width:auto; padding:9px 12px; white-space:nowrap; }
  .settings-category-button small { display:none; }
}
</style>
