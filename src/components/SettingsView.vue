<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
import {
  buildPacilReadBaseUrl,
  clearLocalReadingStats,
  extractHrefValues,
  fetchReadingStatsOverview,
  getLocalOnlySettingsSnapshot,
  getAllLocalReadingStatsRows,
  deleteRemoteReadingStatsFiles,
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
import SettingsSnapshots from './settings/SettingsSnapshots.vue'

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
const readingStatsOverview = ref<ReadingStatsOverview>({ today: 0, week: 0, year: 0 })
const showReadingStatsDisableModal = ref(false)
const readingStatsActionBusy = ref(false)

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
    let desktopSettingsBackup: Awaited<ReturnType<typeof uploadDesktopSettingsSnapshot>> | null = null

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
  result: Awaited<ReturnType<typeof restoreDesktopSettingsSnapshot>>
) => {
  if (!result.applied) return result.message || '云端没有桌面设置文件，已保留当前设置'

  const details = [`${result.settingsCount} 项桌面设置`]
  if (result.backgroundsDownloaded > 0) details.push(`${result.backgroundsDownloaded} 张背景图`)
  if (result.backgroundsMissing > 0) details.push(`${result.backgroundsMissing} 张背景图未下载`)
  return `已应用 ${details.join('，')}`
}

const applyLegacyDesktopSettingsFallback = async (
  desktopSettingsRestore: Awaited<ReturnType<typeof restoreDesktopSettingsSnapshot>>,
  fallback?: Record<string, string>
) => {
  if (desktopSettingsRestore.applied) {
    return formatDesktopSettingsRestoreStatus(desktopSettingsRestore)
  }

  const fallbackCount = fallback ? Object.keys(fallback).length : 0
  if (fallbackCount === 0) {
    return formatDesktopSettingsRestoreStatus(desktopSettingsRestore)
  }

  await restoreDesktopSettingsValues(fallback!)
  return `云端没有 desktop-settings.json，已从旧版 sync/settings.json 应用 ${fallbackCount} 项桌面设置`
}

const formatDesktopSettingsBackupStatus = (
  result: Awaited<ReturnType<typeof uploadDesktopSettingsSnapshot>> | null
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
    await saveWebdav()
    webdavSyncing.value = true
    webdavSyncStatus.value = '准备增量同步...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    const baseUrl = getCurrentPacilReadBaseUrl()
    let desktopSettingsBackup: Awaited<ReturnType<typeof uploadDesktopSettingsSnapshot>> | null = null

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

onMounted(async () => {
  await loadAllSettings()
  await fetchAllRules()
  await fetchBooks()
  await refreshReadingStatsSummary()
  await initializeUpdaterStatus()
  try { await refreshStorageSize() } catch { dataSize.value = '—'; chapterTextSize.value = '—'; jsonDataSize.value = '—'; totalDataSize.value = '—' }
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

    <SettingsSnapshots />

    <SettingsWebDAV 
      :saveWebdav="saveWebdav"
      :testWebdav="testWebdav"
      :fullBackup="fullBackup"
      :fullRestore="fullRestore"
      :incrementalBackup="incrementalBackup"
      :incrementalRestore="incrementalRestore"
      :syncDiffPreview="syncDiffPreview"
      :syncDiffResolution="syncDiffResolution"
      :syncDiffLoading="syncDiffLoading"
      :syncDiffApplying="syncDiffApplying"
      :openSyncDiffPreview="openSyncDiffPreview"
      :applySyncDiffPreview="applySyncDiffPreview"
      :closeSyncDiffPreview="closeSyncDiffPreview"
      :setSyncDiffResolution="setSyncDiffResolution"
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
      :dataSize="dataSize"
      :chapterTextSize="chapterTextSize"
      :jsonDataSize="jsonDataSize"
      :totalDataSize="totalDataSize"
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

  </div>
</template>

<style scoped>
/* Individual section animations (can be added if needed, but the list is already cleaner) */
</style>
