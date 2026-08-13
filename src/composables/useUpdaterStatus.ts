import { onUnmounted, ref, type Ref } from 'vue'
import { saveSetting } from './useSettings'

export function useUpdaterStatus(silentUpdate: Ref<boolean>) {
  const appVersion = ref('')
  const updateStatus = ref('')
  const updateDetail = ref('')
  const updateAvailable = ref(false)
  const updateReady = ref(false)
  const isDownloading = ref(false)

  let offUpdaterStatus: (() => void) | null = null

  const handleStatus = (data: { status: string; version?: string; percent?: number; message?: string }) => {
    switch (data.status) {
      case 'checking': updateStatus.value = '🔍 正在检查...'; break
      case 'available': updateStatus.value = `🎉 发现新版本 v${data.version}`; updateAvailable.value = true; isDownloading.value = false; break
      case 'up-to-date': updateStatus.value = '✅ 已是最新版本'; break
      case 'downloading': updateStatus.value = `⏬ 下载中 ${data.percent}%`; isDownloading.value = true; break
      case 'downloaded': updateStatus.value = '✅ 下载完成'; updateReady.value = true; updateAvailable.value = false; isDownloading.value = false; break
      case 'error': updateStatus.value = '❌ 更新失败'; updateDetail.value = data.message || ''; isDownloading.value = false; break
      case 'unsupported': updateStatus.value = 'ℹ️ 免安装版需手动更新'; updateDetail.value = data.message || ''; isDownloading.value = false; break
    }
  }

  const initializeUpdaterStatus = async () => {
    try { appVersion.value = await window.electronAPI.app.getVersion() } catch (_) { appVersion.value = '?.?.?' }
    offUpdaterStatus?.()
    offUpdaterStatus = window.electronAPI.updater.onStatus(handleStatus)
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

  onUnmounted(() => {
    offUpdaterStatus?.()
    offUpdaterStatus = null
  })

  return {
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
  }
}
