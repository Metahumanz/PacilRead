<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineEmits<{
  (e: 'back'): void
  (e: 'refresh-settings'): void
}>()

interface Setting { key: string; value: string }
interface ReplacementRule { id: number; pattern: string; replacement: string; scope: string; book_id: number | null; is_regex: number; active: number }
interface Book { id: number; title: string }

const bgImage = ref('')
const showKeyHints = ref(true)
const nextKeys = ref<string[]>(['ArrowRight', 'PageDown', ' '])
const prevKeys = ref<string[]>(['ArrowLeft', 'PageUp'])
const appVersion = ref('')
const updateStatus = ref('')
const updateDetail = ref('')
const updateAvailable = ref(false)
const updateReady = ref(false)
const isDownloading = ref(false)
const autoOpenLastRead = ref(false)
const silentUpdate = ref(false)
const ttsMiMoApiKey = ref('')

const webdavUrl = ref('')
const webdavDir = ref('Books')
const webdavUser = ref('')
const webdavPass = ref('')
const webdavSync = ref(false)
const webdavTestResult = ref('')
const webdavTesting = ref(false)
const webdavSyncing = ref(false)
const webdavSyncStatus = ref('')
const webdavLastSync = ref('')

const webdavSyncBookshelf = ref(true)
const webdavSyncFiles = ref(true)
const webdavSyncUISettings = ref(true)
const webdavSyncThemes = ref(true)
const webdavSyncBackgrounds = ref(true)

// Replacement rules
const allRules = ref<ReplacementRule[]>([])
const books = ref<Book[]>([])
const ruleFilter = ref<'all' | 'global' | 'book'>('all')

const loadSettings = async () => {
  try {
    const result = await window.electronAPI.db.query('SELECT * FROM settings')
    const settings = result as Setting[]
    for (const s of settings) {
      if (s.key === 'bgImage') { bgImage.value = s.value || '' }
      if (s.key === 'reader_nextKeys') { try { nextKeys.value = JSON.parse(s.value) } catch (e){} }
      if (s.key === 'reader_prevKeys') { try { prevKeys.value = JSON.parse(s.value) } catch (e){} }
      if (s.key === 'webdavUrl') webdavUrl.value = s.value
      if (s.key === 'webdavDir') webdavDir.value = s.value
      if (s.key === 'webdavUser') webdavUser.value = s.value
      if (s.key === 'webdavPass') webdavPass.value = s.value
      if (s.key === 'webdavSync') webdavSync.value = s.value === 'true'
      if (s.key === 'webdavSyncBookshelf') webdavSyncBookshelf.value = s.value !== 'false'
      if (s.key === 'webdavSyncFiles') webdavSyncFiles.value = s.value !== 'false'
      if (s.key === 'webdavSyncUISettings') webdavSyncUISettings.value = s.value !== 'false'
      if (s.key === 'webdavSyncThemes') webdavSyncThemes.value = s.value !== 'false'
      if (s.key === 'webdavSyncBackgrounds') webdavSyncBackgrounds.value = s.value !== 'false'
      if (s.key === 'webdavLastSync') webdavLastSync.value = s.value || ''
      if (s.key === 'autoOpenLastRead') autoOpenLastRead.value = s.value === 'true'
      if (s.key === 'silentUpdate') silentUpdate.value = s.value === 'true'
      if (s.key === 'reader_ttsMiMoApiKey') ttsMiMoApiKey.value = s.value || ''
      if (s.key === 'hideKeyHints') showKeyHints.value = s.value !== 'true'
    }
  } catch (e) { console.error(e) }
}

const saveSetting = async (k: string, v: string) => {
  await window.electronAPI.db.query('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, v])
}

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
    // Ensure bookProgress folder inside subfolder is created
    let baseURL = webdavUrl.value
    if (webdavDir.value) baseURL += webdavDir.value
    // Create subfolder first if it's set
    if (webdavDir.value) {
      await window.electronAPI.webdav.request({
        url: baseURL, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` }
      })
    }
    await window.electronAPI.webdav.request({
      url: baseURL + 'bookProgress/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` }
    })
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
  if (silentUpdate.value) {
    window.electronAPI.updater.installSilent()
  } else {
    window.electronAPI.updater.install()
  }
}

const toggleSilentUpdate = async () => {
  await saveSetting('silentUpdate', silentUpdate.value ? 'true' : 'false')
}

const saveMiMoKey = async () => {
  await saveSetting('reader_ttsMiMoApiKey', ttsMiMoApiKey.value.trim())
}

// Replacement rules management
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

const filteredRules = () => {
  if (ruleFilter.value === 'all') return allRules.value
  if (ruleFilter.value === 'global') return allRules.value.filter(r => r.scope === 'global')
  return allRules.value.filter(r => r.scope === 'book')
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

    // 1. Create directory structure
    webdavSyncStatus.value = '创建云端目录...'
    await window.electronAPI.webdav.request({ url: baseUrl, method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: baseUrl + 'books/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: baseUrl + 'covers/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })
    await window.electronAPI.webdav.request({ url: baseUrl + 'backgrounds/', method: 'MKCOL', headers: { 'Authorization': `Basic ${auth}` } })

    // 2. Database Sync (Bookshelf, UI Settings, Themes)
    if (webdavSyncBookshelf.value || webdavSyncUISettings.value || webdavSyncThemes.value) {
      webdavSyncStatus.value = '导出数据库...'
      const dbPath = await window.electronAPI.db.export()
      webdavSyncStatus.value = '上传数据库...'
      await window.electronAPI.webdav.uploadFile(dbPath, baseUrl + 'reader.db', auth)
    }

    // 3. User Data Sync
    const appDataPath = await window.electronAPI.app.getPath('userData')
    
    if (webdavSyncFiles.value) {
      const booksDir = appDataPath + '/books/'
      const bookFiles = await window.electronAPI.db.query('SELECT path FROM books')
      for (let i = 0; i < (bookFiles as any[]).length; i++) {
        const b = (bookFiles as any[])[i]
        const fileName = b.path.split(/[\\/]/).pop()
        webdavSyncStatus.value = `上传书籍 (${i + 1}/${(bookFiles as any[]).length})...`
        await window.electronAPI.webdav.uploadFile(booksDir + fileName, baseUrl + 'books/' + fileName, auth)
      }
      
      const coversDir = appDataPath + '/covers/'
      const coverFiles = await window.electronAPI.db.query('SELECT cover_path FROM books WHERE cover_path IS NOT NULL')
      for (let i = 0; i < (coverFiles as any[]).length; i++) {
        const c = (coverFiles as any[])[i]
        const fileName = c.cover_path.split(/[\\/]/).pop()
        webdavSyncStatus.value = `上传封面 (${i + 1}/${(coverFiles as any[]).length})...`
        await window.electronAPI.webdav.uploadFile(coversDir + fileName, baseUrl + 'covers/' + fileName, auth)
      }
    }

    if (webdavSyncBackgrounds.value) {
      const bgDir = appDataPath + '/backgrounds/'
      if (bgImage.value && bgImage.value.startsWith('file:///')) {
        const fileName = bgImage.value.split(/[\\/]/).pop()
        webdavSyncStatus.value = '上传自定义背景...'
        await window.electronAPI.webdav.uploadFile(bgDir + fileName, baseUrl + 'backgrounds/' + fileName, auth)
      }
    }

    webdavLastSync.value = new Date().toLocaleString()
    await saveSetting('webdavLastSync', webdavLastSync.value)
    webdavSyncStatus.value = '备份成功'
    alert('所有选定数据已同步至 WebDAV 云端！')
  } catch (e: any) {
    webdavSyncStatus.value = '备份失败: ' + (e.message || '网络错误')
    console.error(e)
  } finally {
    webdavSyncing.value = false
  }
}

const fullRestore = async () => {
  if (!webdavUrl.value || !confirm('确定要从云端恢复吗？这将替换您当前的本地书架与设置驱动（书籍文件将尝试合并）。')) return
  try {
    webdavSyncing.value = true
    webdavSyncStatus.value = '拉取云端数据...'
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    let baseUrl = webdavUrl.value
    if (webdavDir.value) baseUrl += webdavDir.value
    if (!baseUrl.endsWith('/')) baseUrl += '/'
    baseUrl += 'PacilRead/'

    const appDataPath = await window.electronAPI.app.getPath('userData')
    const dstPath = appDataPath + '/reader.db.restore'
    webdavSyncStatus.value = '下载数据库快照...'
    const dl = await window.electronAPI.webdav.downloadFile(baseUrl + 'reader.db', dstPath, auth)
    if (dl.error) throw new Error('云端无备份数据: ' + dl.error)

    webdavSyncStatus.value = '应用数据库...'
    await window.electronAPI.db.importFromFile(dstPath)

    alert('数据库已成功从云端恢复！书架内容、个性化设置、自定义主题等已就绪，某些设置可能需要软件重启后完全生效。')
    webdavSyncStatus.value = '从云端恢复成功'
  } catch (e: any) {
    webdavSyncStatus.value = '恢复失败: ' + (e.message || '网络错误')
  } finally {
    webdavSyncing.value = false
  }
}

onMounted(async () => {
  loadSettings()
  fetchAllRules()
  fetchBooks()
  try { appVersion.value = await window.electronAPI.app.getVersion() } catch (_) { appVersion.value = '?.?.?' }
  window.electronAPI.updater.onStatus((data) => {
    switch (data.status) {
      case 'checking': updateStatus.value = '🔍 正在检查...'; break
      case 'available': updateStatus.value = `🎉 发现新版本 v${data.version}`; updateDetail.value = ''; updateAvailable.value = true; isDownloading.value = false; break
      case 'up-to-date': updateStatus.value = '✅ 已是最新版本'; break
      case 'downloading': updateStatus.value = `⏬ 下载中 ${data.percent}%`; isDownloading.value = true; break
      case 'downloaded': updateStatus.value = '✅ 下载完成'; updateDetail.value = '可立即安装或等下次启动时自动安装'; updateReady.value = true; updateAvailable.value = false; isDownloading.value = false; break
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

    <!-- 1. 窗口与显示 -->
    <div class="mb-8">
      <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">窗口与显示</h3>
      <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
        
        <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">🪟</span>
            <div class="flex-1">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">默认窗口比例</div>
              <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5 mb-3">快速调整主阅读窗口的大小特征预设</div>
              <div class="flex flex-wrap gap-2">
                <button @click="setAspectRatio(16/9)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">16 : 9</button>
                <button @click="setAspectRatio(9/16)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">9 : 16</button>
                <button @click="setAspectRatio(4/3)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">4 : 3</button>
                <button @click="setAspectRatio(3/4)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">3 : 4</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 2. 阅读交互 -->
    <div class="mb-8">
      <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">阅读交互</h3>
      <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
        
        <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">💡</span>
            <div>
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">显示操作浮层提示</div>
              <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">进入阅读页时屏幕底部会浮现操作引导帮助</div>
            </div>
          </div>
          <label class="flex items-center cursor-pointer relative">
            <input type="checkbox" v-model="showKeyHints" @change="toggleKeyHints" class="peer sr-only" />
            <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
          </label>
        </div>

        <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">🚀</span>
            <div>
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">启动直达续读</div>
              <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">打开软件直接跳入上次阅读的书籍而不在书架层停留</div>
            </div>
          </div>
          <label class="flex items-center cursor-pointer relative">
            <input type="checkbox" v-model="autoOpenLastRead" @change="toggleAutoOpenLastRead" class="peer sr-only" />
            <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
          </label>
        </div>

        <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">⌨️</span>
            <div class="flex-1">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">翻页按键绑定</div>
              <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5 mb-3">自定义全局控制按键组合（点击下方已绑按键可移除）</div>
              <div class="grid grid-cols-2 gap-6">
                <div>
                  <label class="block text-[12px] text-slate-600 dark:text-white/60 mb-2 font-medium">下一页 / 下一章绑定</label>
                  <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                    <span v-for="k in nextKeys" :key="k" @click="removeNextKey(k)" class="px-2 py-0.5 bg-[#005fb8]/20 border border-[#005fb8]/30 text-[#60a5fa] rounded text-[11px] font-mono cursor-pointer hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-colors">
                      {{ k === ' ' ? 'Space' : k }} &times;
                    </span>
                  </div>
                  <input type="text" placeholder="按下按键录入..." @keydown.prevent="addNextKey" class="w-full bg-black/[0.03] dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                </div>
                <div>
                  <label class="block text-[12px] text-slate-600 dark:text-white/60 mb-2 font-medium">上一页 / 上一章绑定</label>
                  <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                    <span v-for="k in prevKeys" :key="k" @click="removePrevKey(k)" class="px-2 py-0.5 bg-[#005fb8]/20 border border-[#005fb8]/30 text-[#60a5fa] rounded text-[11px] font-mono cursor-pointer hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-colors">
                      {{ k === ' ' ? 'Space' : k }} &times;
                    </span>
                  </div>
                  <input type="text" placeholder="按下按键录入..." @keydown.prevent="addPrevKey" class="w-full bg-black/[0.03] dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 3. WebDAV -->
    <div class="mb-8">
      <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">云同步驱动</h3>
      <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
        
        <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">☁️</span>
            <div class="flex-1">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">WebDAV 进度同步桥接</div>
                  <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">完美兼容 Legado 数据簇的终端互转</div>
                </div>
                <label class="flex items-center cursor-pointer relative">
                  <input type="checkbox" v-model="webdavSync" @change="saveWebdav" class="peer sr-only" />
                  <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
                </label>
              </div>

              <div class="space-y-3 bg-black/10 p-4 rounded-lg border border-black/5 dark:border-white/5">
                <div class="grid grid-cols-[2fr_1fr] gap-3">
                  <div>
                    <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">主线服务器 URL (需尾随 /)</label>
                    <input type="text" v-model="webdavUrl" @change="saveWebdav" placeholder="https://dav.jianguoyun.com/dav/" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">子目录 (例如 Books)</label>
                    <input type="text" v-model="webdavDir" @change="saveWebdav" placeholder="Books" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                  </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">认证账户 (User)</label>
                    <input type="text" v-model="webdavUser" @change="saveWebdav" placeholder="example@email.com" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">连接密钥 (App Password)</label>
                    <input type="password" v-model="webdavPass" @change="saveWebdav" placeholder="••••••••" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                  </div>
                </div>
                <div v-if="webdavSync" class="mt-4 pt-4 border-t border-black/10 dark:border-white/[0.05]">
                  <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-2 font-medium text-left">同步内容选择 (点击切换)</label>
                  <div class="flex flex-wrap gap-2 mb-5">
                    <button @click="webdavSyncBookshelf = !webdavSyncBookshelf; saveWebdav()" :class="webdavSyncBookshelf ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">书架内容</button>
                    <button @click="webdavSyncFiles = !webdavSyncFiles; saveWebdav()" :class="webdavSyncFiles ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">书籍文件</button>
                    <button @click="webdavSyncUISettings = !webdavSyncUISettings; saveWebdav()" :class="webdavSyncUISettings ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">界面设置</button>
                    <button @click="webdavSyncThemes = !webdavSyncThemes; saveWebdav()" :class="webdavSyncThemes ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">阅读主题</button>
                    <button @click="webdavSyncBackgrounds = !webdavSyncBackgrounds; saveWebdav()" :class="webdavSyncBackgrounds ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">背景图片</button>
                  </div>
                  
                  <div class="flex items-center gap-3">
                    <button @click="fullBackup" :disabled="webdavSyncing || !webdavUrl" class="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md text-[12px] font-medium transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95">
                      <span v-if="webdavSyncing && webdavSyncStatus.includes('上传')">⏳ {{ webdavSyncStatus }}</span>
                      <span v-else-if="webdavSyncing">⏳ 处理中...</span>
                      <span v-else>📤 立即备份到云端</span>
                    </button>
                    <button @click="fullRestore" :disabled="webdavSyncing || !webdavUrl" class="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-md text-[12px] font-medium transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95">
                      <span v-if="webdavSyncing && webdavSyncStatus.includes('下载')">⏳ {{ webdavSyncStatus }}</span>
                      <span v-else-if="webdavSyncing">⏳ 处理中...</span>
                      <span v-else>📥 从云端恢复数据</span>
                    </button>
                  </div>
                  <div v-if="webdavLastSync" class="text-center mt-3 text-[10px] text-slate-500 dark:text-white/30 flex items-center justify-center gap-1.5">
                    <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    最后同步/备份: {{ webdavLastSync }}
                  </div>
                </div>

                <!-- WebDAV Test Connection -->
                <div class="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/[0.05] mt-3">
                  <span class="text-[12px] min-h-[18px]" :class="webdavTestResult.includes('✅') ? 'text-emerald-400' : 'text-red-400'">{{ webdavTestResult }}</span>
                  <button @click="testWebdav" :disabled="webdavTesting" class="px-4 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-800 dark:text-white/90 rounded-md text-[13px] transition-colors font-medium border border-black/5 dark:border-white/5">探测网络</button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- 4. 语音朗读 -->
    <div class="mb-8">
      <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">语音朗读</h3>
      <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
        <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">🎙️</span>
            <div class="flex-1">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">小米 MiMo TTS 配置</div>
              <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5 mb-3">填写您的 API Key 以启用小米流式语音合成功能</div>
              <div class="bg-black/10 p-4 rounded-lg border border-black/5 dark:border-white/5">
                <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">API Key</label>
                <div class="flex gap-2">
                  <input type="password" v-model="ttsMiMoApiKey" @change="saveMiMoKey" placeholder="在此输入您的 API Key..." class="flex-1 bg-black/30 border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                  <a href="https://platform.xiaomimimo.com/#/console/api-keys" target="_blank" class="px-3 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-white/20 text-white rounded-md text-[11px] transition-colors flex items-center border border-black/5 dark:border-white/5">获取 Key</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. 正则清洗 -->
    <div class="mb-8">
      <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">内容处理 (正则过滤)</h3>
      <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 overflow-hidden">
        <div class="p-4 border-b border-black/5 dark:border-white/[0.04]">
          <div class="flex items-center justify-between mb-3">
            <p class="text-[13px] text-slate-600 dark:text-white/60">在阅读界面中添加用于文字净化的替换规则，在此处可以浏览并控制全部规则启用状态。</p>
            <div class="flex bg-black/5 dark:bg-black/20 rounded-md p-0.5 border border-black/5 dark:border-white/5">
              <button @click="ruleFilter='all'" class="px-3 py-1 rounded text-[11px] font-medium transition-colors" :class="ruleFilter==='all' ? 'bg-black/5 dark:bg-white/10 text-white shadow-sm' : 'text-slate-500 dark:text-white/50 hover:text-white'">全部</button>
              <button @click="ruleFilter='global'" class="px-3 py-1 rounded text-[11px] font-medium transition-colors" :class="ruleFilter==='global' ? 'bg-black/5 dark:bg-white/10 text-white shadow-sm' : 'text-slate-500 dark:text-white/50 hover:text-white'">全局级</button>
              <button @click="ruleFilter='book'" class="px-3 py-1 rounded text-[11px] font-medium transition-colors" :class="ruleFilter==='book' ? 'bg-black/5 dark:bg-white/10 text-white shadow-sm' : 'text-slate-500 dark:text-white/50 hover:text-white'">单书级</button>
            </div>
          </div>
        </div>
        
        <div v-if="filteredRules().length === 0" class="py-12 flex flex-col items-center justify-center bg-black/10">
          <span class="text-3xl opacity-30 mb-2">📝</span>
          <p class="text-[12px] text-slate-400 dark:text-white/40">空无一物，规则大本营闲置中</p>
        </div>

        <div v-else class="divide-y divide-white/[0.04] bg-black/10">
          <div v-for="rule in filteredRules()" :key="rule.id" class="p-3 mx-2 my-2 rounded-lg border border-transparent hover:border-black/5 dark:border-white/5 hover:bg-white/[0.02] flex items-center justify-between group transition-colors" :class="rule.active ? '' : 'opacity-50'">
            <div class="flex-1 min-w-0 pr-4">
              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <span class="text-amber-300 font-mono text-[12px] bg-amber-900/20 px-1.5 py-0.5 rounded break-all">{{ rule.pattern }}</span>
                <span class="text-slate-400 dark:text-white/30 text-xs">→</span>
                <span class="text-emerald-300 font-mono text-[12px] bg-emerald-900/20 px-1.5 py-0.5 rounded break-all">{{ rule.replacement || '(删除)' }}</span>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[10px] font-bold px-1.5 py-[1px] rounded" :class="rule.scope === 'global' ? 'bg-purple-500/10 text-purple-400' : 'bg-sky-500/10 text-sky-400'">{{ rule.scope === 'global' ? '全局模式' : '专属模式' }}</span>
                <span v-if="rule.scope === 'book' && rule.book_id" class="text-[10px] text-slate-400 dark:text-white/40 max-w-[120px] truncate">#{{ getBookTitle(rule.book_id) }}</span>
                <span v-if="rule.is_regex" class="text-[10px] uppercase font-bold text-amber-400/80 px-1.5 py-[1px] bg-amber-500/10 rounded">Regex</span>
              </div>
            </div>
            
            <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button @click="toggleRuleActive(rule)" class="px-2.5 py-1 text-[11px] font-medium border rounded transition-colors" :class="rule.active ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' : 'border-white/20 text-slate-600 dark:text-white/60 hover:bg-black/5 dark:bg-white/10'">{{ rule.active ? '冻结' : '唤醒' }}</button>
              <button @click="deleteRule(rule.id)" class="px-2.5 py-1 text-[11px] font-medium border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors">废弃</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 6. 关于与更新 -->
    <div class="mb-8">
      <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">关于与更新</h3>
      <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-black/5 dark:divide-white/[0.04]">
        
        <!-- 关于基础 -->
        <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors font-medium">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">🔄</span>
            <div>
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">PacilRead 更新维护</div>
              <div v-if="updateStatus" class="text-[12px] text-emerald-500 dark:text-emerald-400 mt-0.5">{{ updateStatus }} <span class="text-slate-400 dark:text-white/40">{{ updateDetail }}</span></div>
            </div>
          </div>
          <div class="flex items-center gap-3">
             <span class="text-[12px] font-mono text-slate-500 dark:text-white/50 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-md">v{{ appVersion }}</span>
            <template v-if="updateAvailable">
              <button @click="downloadUpdate" class="px-4 py-1.5 bg-[#005fb8] hover:bg-[#005fb8]/90 text-white rounded-md text-[13px] transition-colors font-medium">后台下载最新版</button>
            </template>
            <button v-else-if="updateReady" @click="installNow" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[13px] transition-colors font-medium shadow-sm">立即安装</button>
            <button v-else-if="isDownloading" disabled class="px-4 py-1.5 bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/40 rounded-md text-[13px] font-medium border border-transparent cursor-not-allowed">下载中...</button>
            <button v-else @click="checkForUpdate" class="px-4 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-800 dark:text-white/90 rounded-md text-[13px] transition-colors font-medium border border-black/5 dark:border-white/5">检查更新</button>
            
            <a href="https://github.com/Metahumanz/PacilRead" target="_blank" class="px-4 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-800 dark:text-white/90 rounded-md text-[13px] transition-colors font-medium border border-black/5 dark:border-white/5 flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
              GitHub
            </a>
          </div>
        </div>

        <!-- 行为控制 -->
        <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">🤫</span>
            <div>
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">允许静默更新</div>
              <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">开启后点击「立即安装」将直接覆盖安装并自动重启，无需再次确认</div>
            </div>
          </div>
          <label class="flex items-center cursor-pointer relative">
            <input type="checkbox" v-model="silentUpdate" @change="toggleSilentUpdate" class="peer sr-only" />
            <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
          </label>
        </div>

        <!-- 日志 -->
        <div class="p-4 bg-black/5 dark:bg-black/10">
          <div class="flex items-center gap-2 mb-3">
            <span class="text-xl opacity-80">📜</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">版本演进日志</div>
          </div>
          <div class="divide-y divide-black/5 dark:divide-white/[0.04] max-h-[400px] overflow-y-auto changelog-scroll pr-2">
            <div class="pb-4 pt-2">
              <div class="flex items-center gap-2 mb-2">
                <span class="px-2 py-0.5 text-[11px] font-bold bg-emerald-500/20 text-emerald-500 rounded-full">最新</span>
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.4</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-30</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
                <li>WebDAV 全量同步：支持书架、书籍、设置、主题及背景的一键备份与恢复</li>
                <li>同步颗粒化控制：新增“胶囊开关”，支持自定义同步内容，保护多端偏好一致性</li>
                <li>导入增强：开启 PDF 拖放导入支持，实现基于路径的自动去重逻辑</li>
                <li>底层架构升级：支持数据库二进制导出/导入，提升同步效率</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.3</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-30</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
                <li>阅读界面 HUD 模块化增强：支持 6 个自定义展示槽位（顶部/底部、左/中/右）</li>
                <li>HUD 内容高度自定义：支持显示时间、电量、章节名、页数及全书进度等 10 种组合</li>
                <li>章节标题显示优化：正文前章节名支持靠左对齐、居中对齐或完全隐藏</li>
                <li>集成系统电池电量实时监听与分钟级时钟更新</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.2</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-29</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
                <li>MiMo 听书优化：支持全句合成以提升语感连贯性</li>
                <li>实现“大句合成、小句高亮”：视觉高亮与音频进度精准同步</li>
                <li>修复 MiMo 模式倍速无效问题，支持 0.5x - 2.5x 变速播放</li>
                <li>自动括号转义：将半角/全角括号替换为引号，防止 MiMo 语气误判</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.1</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-29</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
                <li>优化窗口最大化/还原动效，实现平滑圆角与边距过渡</li>
                <li>菜单栏自适应优化：支持窄窗口下的自动换行排列，防止按钮被遮挡</li>
                <li>修复阅读界面全屏按钮失效的问题</li>
                <li>同步原生全屏状态（F11）至 UI 界面</li>
                <li>更新开发环境 TypeScript 类型定义</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.0</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-29</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
                <li>集成小米 MiMo V2 TTS，支持超低延迟流式语音合成</li>
                <li>重整设置页面，整合关于、更新行为与日志板块</li>
                <li>优化阅读界面所有弹出面板的自适应高度与滑动支持</li>
                <li>增加 MiMo API Key 配置与引导</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.3.9</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-29</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1 pl-4 list-disc">
                <li>全新自定义窗口控制按钮：移除 Windows 原生色块，采用简约个性化图标</li>
                <li>优化关闭逻辑：界面按钮直接退出，Esc 键保留确认弹窗</li>
                <li>修复拖拽区域层级导致的按钮点击失效问题</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.3.8</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-29</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1 pl-4 list-disc">
                <li>重构阅读器核心架构，将 TTS、分页、主题、设置拆分为独立 Composable 模块</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.3.7</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-29</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1 pl-4 list-disc">
                <li>TTS 预取缓冲增加至 2 句，大幅减少朗读停顿</li>
                <li>重命名为 PacilRead，新增旧版 EleWinReader 数据自动迁移</li>
                <li>精简依赖包，减小打包体积</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.3.3</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-28</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1 pl-4 list-disc">
                <li>新增触摸操作支持，实现九宫格点击导航</li>
                <li>添加 GPL-3.0 开源许可</li>
              </ul>
            </div>

            <div class="py-4 border-t border-white/[0.04]">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.1.0</span>
                <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-28</span>
              </div>
              <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1 pl-4 list-disc">
                <li>从 Tauri + React 迁移至 Electron + Vue 3</li>
                <li>实现 TXT/EPUB 格式解析</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
section { animation: slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
section:nth-child(1) { animation-delay: 0.05s; }
section:nth-child(2) { animation-delay: 0.1s; }
section:nth-child(3) { animation-delay: 0.15s; }
section:nth-child(4) { animation-delay: 0.2s; }
section:nth-child(5) { animation-delay: 0.25s; }
section:nth-child(6) { animation-delay: 0.3s; }
section:nth-child(7) { animation-delay: 0.35s; }
section:nth-child(8) { animation-delay: 0.4s; }
section:nth-child(9) { animation-delay: 0.45s; }
@keyframes slideIn { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
.changelog-scroll::-webkit-scrollbar { width: 4px; }
.changelog-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
:is(.dark) .changelog-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
</style>
