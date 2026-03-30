<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettings } from '../composables/useSettings'

// Sub-components
import SettingsDisplay from './settings/SettingsDisplay.vue'
import SettingsReading from './settings/SettingsReading.vue'
import SettingsWebDAV from './settings/SettingsWebDAV.vue'
import SettingsTTS from './settings/SettingsTTS.vue'
import SettingsRules from './settings/SettingsRules.vue'
import SettingsAbout from './settings/SettingsAbout.vue'

defineEmits<{
  (e: 'back'): void
  (e: 'refresh-settings'): void
}>()

interface ReplacementRule { id: number; pattern: string; replacement: string; scope: string; book_id: number | null; is_regex: number; active: number }
interface Book { id: number; title: string }

const settings = useSettings()
const {
  loadAllSettings, saveSetting,
  showKeyHints, nextKeys, prevKeys,
  webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
  webdavSyncBookshelf, webdavSyncFiles, webdavSyncUISettings,
  webdavSyncThemes, webdavSyncBackgrounds, webdavLastSync,
  autoOpenLastRead, silentUpdate, ttsMiMoApiKey,
  bgImage
} = settings

// Update related state
const appVersion = ref('')
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
    let baseURL = webdavUrl.value
    if (webdavDir.value) baseURL += webdavDir.value
    if (webdavDir.value) {
      await window.electronAPI.webdav.request({ url: baseURL, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    }
    await window.electronAPI.webdav.request({ url: baseURL + 'bookProgress/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
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

const fullBackup = async () => {
  if (!webdavUrl.value) return
  try {
    webdavSyncing.value = true
    webdavSyncStatus.value = '准备备份...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    let baseUrl = webdavUrl.value
    if (webdavDir.value) baseUrl += webdavDir.value
    if (!baseUrl.endsWith('/')) baseUrl += '/'
    baseUrl += 'PacilRead/'

    webdavSyncStatus.value = '创建云端目录...'
    await window.electronAPI.webdav.request({ url: baseUrl, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: baseUrl + 'books/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: baseUrl + 'covers/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: baseUrl + 'backgrounds/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })

    if (webdavSyncBookshelf.value || webdavSyncUISettings.value || webdavSyncThemes.value) {
      webdavSyncStatus.value = '导出数据库...'
      const dbPath = await window.electronAPI.db.export()
      webdavSyncStatus.value = '上传数据库...'
      await window.electronAPI.webdav.uploadFile(dbPath, baseUrl + 'reader.db', auth)
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

    if (webdavSyncBackgrounds.value && bgImage.value?.startsWith('file:///')) {
      const fileName = bgImage.value.split(/[\\/]/).pop()
      webdavSyncStatus.value = '上传自定义背景...'
      await window.electronAPI.webdav.uploadFile(appDataPath + '/backgrounds/' + fileName, baseUrl + 'backgrounds/' + fileName, auth)
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
    webdavSyncing.value = true
    webdavSyncStatus.value = '下载数据库快照...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    let baseUrl = webdavUrl.value
    if (webdavDir.value) baseUrl += webdavDir.value
    if (!baseUrl.endsWith('/')) baseUrl += '/'
    baseUrl += 'PacilRead/'

    const appDataPath = await window.electronAPI.app.getPath('userData')
    const dstPath = appDataPath + '/reader.db.restore'
    const dl = await window.electronAPI.webdav.downloadFile(baseUrl + 'reader.db', dstPath, auth)
    if (dl.error) throw new Error('云端无备份数据: ' + dl.error)

    webdavSyncStatus.value = '应用数据库...'
    await window.electronAPI.db.importFromFile(dstPath)
    alert('数据库已成功从云端恢复！')
    webdavSyncStatus.value = '从云端恢复成功'
  } catch (e: any) {
    webdavSyncStatus.value = '恢复失败: ' + (e.message || '网络错误')
  } finally { webdavSyncing.value = false }
}

onMounted(async () => {
  loadAllSettings()
  fetchAllRules()
  fetchBooks()
  try { appVersion.value = await window.electronAPI.app.getVersion() } catch (_) { appVersion.value = '?.?.?' }
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
      <h2 class="text-[22px] font-semibold text-slate-800 dark:text-white/90 tracking-wide">偏好设置</h2>
      <p class="text-slate-500 dark:text-white/50 text-[13px] mt-1">定制 PacilRead 的各项核心行为与界面特质</p>
    </div>

    <!-- Sub-sections -->
    <SettingsDisplay :setAspectRatio="setAspectRatio" />
    
    <SettingsReading 
      :toggleKeyHints="toggleKeyHints"
      :toggleAutoOpenLastRead="toggleAutoOpenLastRead"
      :addNextKey="addNextKey"
      :removeNextKey="removeNextKey"
      :addPrevKey="addPrevKey"
      :removePrevKey="removePrevKey"
    />

    <SettingsWebDAV 
      :saveWebdav="saveWebdav"
      :testWebdav="testWebdav"
      :fullBackup="fullBackup"
      :fullRestore="fullRestore"
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
  </div>
</template>

<style scoped>
/* Individual section animations (can be added if needed, but the list is already cleaner) */
</style>
