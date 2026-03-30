import { ref } from 'vue'

export function useHUD() {
  const currentTime = ref('')
  const batteryLevel = ref('-%')
  let hudTimer: any = null
  let batteryObj: any = null

  const updateHUDTime = () => {
    const d = new Date()
    currentTime.value = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const initBattery = async () => {
    if ((navigator as any).getBattery) {
      try {
        batteryObj = await (navigator as any).getBattery()
        const updateCharge = () => {
          batteryLevel.value = Math.round(batteryObj.level * 100) + '%'
        }
        updateCharge()
        batteryObj.addEventListener('levelchange', updateCharge)
      } catch (e) {
        console.error('Battery API err:', e)
      }
    }
  }

  const startHUD = () => {
    updateHUDTime()
    hudTimer = setInterval(updateHUDTime, 60000)
    initBattery()
  }

  const stopHUD = () => {
    if (hudTimer) clearInterval(hudTimer)
    if (batteryObj) {
      // Note: Battery API listener removal logic if needed
    }
  }

  // Formatting helper
  const formatHUD = (type: string, context: {
    bookTitle?: string
    chapterTitle?: string
    isFirstPage?: boolean
    currentPage?: number
    totalPages?: number
    currentChapterIndex?: number
    totalChapters?: number
    progressPercent?: number
  }) => {
    if (!type || type === 'none') return ''
    const {
      bookTitle = '',
      chapterTitle = '',
      isFirstPage = false,
      currentPage = 0,
      totalPages = 0,
      currentChapterIndex = 0,
      totalChapters = 0,
      progressPercent = 0
    } = context

    switch (type) {
      case 'bookTitle': return bookTitle
      case 'chapterTitle': return chapterTitle
      case 'titleOrChapter':
        return isFirstPage ? bookTitle : chapterTitle
      case 'currentTime': return currentTime.value
      case 'batteryLevel': return batteryLevel.value
      case 'chapterPage': return `${currentPage + 1} / ${totalPages}`
      case 'bookProgress': return `第 ${currentChapterIndex + 1} / ${totalChapters} 章`
      case 'pageAndProgress': return `${currentPage + 1} / ${totalPages} (${progressPercent}%)`
      case 'timeAndBattery': return `${currentTime.value}  ${batteryLevel.value}`
      default: return ''
    }
  }

  return {
    currentTime,
    batteryLevel,
    startHUD,
    stopHUD,
    formatHUD
  }
}
