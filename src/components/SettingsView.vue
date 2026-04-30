<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettings } from '../composables/useSettings'
import {
  DESKTOP_DATABASE_DIR,
  buildPacilReadBaseUrl,
  clearLocalReadingStats,
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
const updateStatus = ref('')
const updateDetail = ref('')
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

const ensureSyncDirectories = async (auth: string, options: { includeDesktopDatabase?: boolean } = {}) => {
  const baseUrl = getCurrentPacilReadBaseUrl()
  await ensureWebdavCollection(baseUrl, auth)
  await ensureWebdavCollection(baseUrl + 'books/', auth)
  await ensureWebdavCollection(baseUrl + 'covers/', auth)
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
    await ensureSyncDirectories(auth, { includeDesktopDatabase: true })

    if (webdavSyncBookshelf.value) {
      webdavSyncStatus.value = '导出数据库...'
      const dbPath = await window.electronAPI.db.export()
      webdavSyncStatus.value = '上传 Win11 私有数据库...'
      await window.electronAPI.webdav.uploadFile(dbPath, getDesktopDatabaseBaseUrl() + 'reader.db', auth)
    }

    const appDataPath = await window.electronAPI.app.getPath('userData')
    if (webdavSyncFiles.value) {
      const booksDir = appDataPath + '/books/'
      const bookFiles = await window.electronAPI.db.query('SELECT path FROM books')
      for (let i = 0; i < (bookFiles as any[]).length; i++) {
        const fileName = (bookFiles as any[])[i].path.split(/[\\/]/).pop()
        webdavSyncStatus.value = `上传书籍 (${i + 1}/${(bookFiles as any[]).length})...`
        await window.electronAPI.webdav.uploadFile(booksDir + fileName, baseUrl + 'books/' + fileName, auth)
      }
      const coversDir = appDataPath + '/covers/'
      const coverFiles = await window.electronAPI.db.query('SELECT cover_path FROM books WHERE cover_path IS NOT NULL')
      for (let i = 0; i < (coverFiles as any[]).length; i++) {
        const fileName = (coverFiles as any[])[i].cover_path.split(/[\\/]/).pop()
        webdavSyncStatus.value = `上传封面 (${i + 1}/${(coverFiles as any[]).length})...`
        await window.electronAPI.webdav.uploadFile(coversDir + fileName, baseUrl + 'covers/' + fileName, auth)
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

    const appDataPath = await window.electronAPI.app.getPath('userData')
    const dstPath = appDataPath + '/reader.db.restore'
    webdavSyncStatus.value = '下载数据库快照...'
    const dl = await downloadFirstAvailable(
      [getDesktopDatabaseBaseUrl() + 'reader.db', baseUrl + 'reader.db'],
      dstPath,
      auth
    )
    if (!dl.error) {
      webdavSyncStatus.value = '应用数据库...'
      await window.electronAPI.db.importFromFile(dstPath)
      await restoreLocalOnlySettings(preservedSettings)
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

    if (dl.error && !desktopSettingsRestore.applied) {
      throw new Error(`云端无备份数据: ${dl.error}`)
    }

    alert(dl.error
      ? '桌面设置与阅读统计已从云端恢复，数据库快照不存在。'
      : '数据库、桌面设置与阅读统计已成功从云端恢复！')
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
      webdavSyncStatus.value = '处理增量数据库...'
      const litePath = await (window.electronAPI.db as any).exportLite()
      webdavSyncStatus.value = '上传 Win11 私有增量数据库...'
      await window.electronAPI.webdav.uploadFile(litePath, getDesktopDatabaseBaseUrl() + 'reader_lite.db', auth)
    }

    const appDataPath = await window.electronAPI.app.getPath('userData')
    if (webdavSyncFiles.value) {
      const booksDir = appDataPath + '/books/'
      const bookFiles = await window.electronAPI.db.query('SELECT path FROM books')
      for (let i = 0; i < (bookFiles as any[]).length; i++) {
        const fileName = (bookFiles as any[])[i].path.split(/[\\/]/).pop()
        const remotePath = baseUrl + 'books/' + fileName
        // Check if exists using PROPFIND/HEAD
        const check = await window.electronAPI.webdav.request({ url: remotePath, method: 'HEAD', headers: { 'Authorization': `Basic ${auth}` } })
        if (check.status !== 200) {
          webdavSyncStatus.value = `上传书籍 (${i + 1}/${(bookFiles as any[]).length})...`
          await window.electronAPI.webdav.uploadFile(booksDir + fileName, remotePath, auth)
        }
      }
      const coversDir = appDataPath + '/covers/'
      const coverFiles = await window.electronAPI.db.query('SELECT cover_path FROM books WHERE cover_path IS NOT NULL')
      for (let i = 0; i < (coverFiles as any[]).length; i++) {
        const fileName = (coverFiles as any[])[i].cover_path.split(/[\\/]/).pop()
        const remotePath = baseUrl + 'covers/' + fileName
        const check = await window.electronAPI.webdav.request({ url: remotePath, method: 'HEAD', headers: { 'Authorization': `Basic ${auth}` } })
        if (check.status !== 200) {
          webdavSyncStatus.value = `上传封面 (${i + 1}/${(coverFiles as any[]).length})...`
          await window.electronAPI.webdav.uploadFile(coversDir + fileName, remotePath, auth)
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
    const baseUrl = getCurrentPacilReadBaseUrl()

    const appDataPath = await window.electronAPI.app.getPath('userData')
    const dstPath = appDataPath + '/reader_lite.db.restore'
    webdavSyncStatus.value = '下载增量快照...'
    const dl = await downloadFirstAvailable(
      [getDesktopDatabaseBaseUrl() + 'reader_lite.db', baseUrl + 'reader_lite.db'],
      dstPath,
      auth
    )
    let liteRestore: Awaited<ReturnType<typeof window.electronAPI.db.importLiteFromFile>> | null = null
    if (!dl.error) {
      webdavSyncStatus.value = '应用增量数据库...'
      liteRestore = await window.electronAPI.db.importLiteFromFile(dstPath)
      await restoreLocalOnlySettings(preservedSettings)
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

    if (dl.error && !desktopSettingsRestore.applied) {
      throw new Error('云端无增量备份数据，请考虑全量恢复: ' + dl.error)
    }

    alert(dl.error
      ? '桌面设置与阅读统计已恢复，增量数据库快照不存在。'
      : `增量数据、桌面设置与阅读统计已恢复！\n已保留本地缓存章节：${liteRestore?.currentChapters ?? 0}，重挂章节：${liteRestore?.remappedChapters ?? 0}。`)
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
  try {
    const sz = await window.electronAPI.db.getSize()
    if (sz.sizeBytes > 0) {
      dbSize.value = sz.sizeBytes >= 1048576
        ? (sz.sizeBytes / 1048576).toFixed(1) + ' MB'
        : (sz.sizeBytes / 1024).toFixed(1) + ' KB'
    } else {
      dbSize.value = '—'
    }
  } catch { dbSize.value = '—' }
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
