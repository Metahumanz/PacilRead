<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue'
import { useSettings } from '../composables/useSettings'
import { useTheme } from '../composables/useTheme'
import { useTTS } from '../composables/useTTS'
import { usePagination } from '../composables/usePagination'
import { useReaderPaginator } from '../composables/useReaderPaginator'
import { useRules } from '../composables/useRules'
import { useHUD } from '../composables/useHUD'
import { useSync } from '../composables/useSync'
import { useReadingTimeTracker } from '../composables/useReadingTimeTracker'
import { useAppTheme } from '../composables/useAppTheme'
import { createBookmark, type BookmarkTarget } from '../composables/useBookmarks'
import { useDataStore } from '../composables/useDataStore'

// Sub-components
import ReaderHUD from './reader/ReaderHUD.vue'
import ReaderMenu from './reader/ReaderMenu.vue'
import StylePanel from './reader/panels/StylePanel.vue'
import TOCPanel from './reader/panels/TOCPanel.vue'
import SearchPanel from './reader/panels/SearchPanel.vue'
import RulesPanel from './reader/panels/RulesPanel.vue'
import AutoPagePanel from './reader/panels/AutoPagePanel.vue'
import TTSPanel from './reader/panels/TTSPanel.vue'
import OptionsPanel from './reader/panels/OptionsPanel.vue'
import BookmarksPanel from './reader/panels/BookmarksPanel.vue'

interface Chapter {
  id: number
  title: string
  body: string
  body_text: string
  order_index: number
  body_text_storage?: string
  body_text_missing?: number
}
interface Book { id: number; title: string; author: string | null; bookType: string; progressIndex: number; progressOffset: number; lastReadAt: number; readingStatsKey: string }

const props = defineProps<{ bookId: number, isImmersive: boolean, initialBookmark?: BookmarkTarget | null }>()
const emit = defineEmits<{
  (e: 'toggle-immersive', isFull: boolean): void
  (e: 'go-back'): void
  (e: 'open-book-stats', bookId: number): void
}>()

// ---- Core data ----
const book = ref<Book | null>(null)
const chapters = ref<Chapter[]>([])
const currentChapterIndex = ref(0)
const loading = ref(true)
const showMenu = ref(false)
const showStyling = ref(false)
const showToc = ref(false)
const showSearch = ref(false)
const showRules = ref(false)
const showAutoPage = ref(false)
const showTts = ref(false)
const autoPageActive = ref(false)
const showReaderOptions = ref(false)
const showBookmarks = ref(false)
const showCopyModal = ref(false)
const selectedText = ref('')
const bookmarkPanelVersion = ref(0)
const bookmarkStatus = ref('')

// DOM refs
const contentRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const prevContentRef = ref<HTMLElement | null>(null)
const prevContainerRef = ref<HTMLElement | null>(null)

// ---- Settings (composable) ----
const settings = useSettings()
const {
  fontSize, lineHeight, letterSpacing, fontWeight, marginX, marginY,
  fontFamily, fontColor, coverColor, bgImage, blurAmount,
  textAlign, pageMode, doublePageStep,
  flipMode, flipSpeed, autoPageSpeed,
  ttsEngine, ttsVoice, ttsRate, highlightColor, ttsMiMoApiKey, ttsMiMoVoice,
  nextKeys, prevKeys, showKeyHints, isAlwaysOnTop,
  readingTimeTrackingEnabled, readingTimeStatsHidden,
  webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
  hudTopLeft, hudTopCenter, hudTopRight,
  hudBottomLeft, hudBottomCenter, hudBottomRight,
  chapterTitleDisplay,
  readerAutoNightEnabled, readerAutoNightCustomPolicy,
  loadAllSettings, saveAllStyling, saveSetting,
  sliderMode, pIndent, pSpacing
} = settings

const { rules, fetchRules, applyReplacements } = useRules()
const { startHUD, stopHUD, formatHUD } = useHUD()
const { uploadProgressToWebdav } = useSync()
const { resolvedBucket } = useAppTheme()
const readingTimeTracker = useReadingTimeTracker({
  enabled: readingTimeTrackingEnabled,
  book: computed(() => {
    if (!book.value) return null
    return {
      title: book.value.title,
      author: book.value.author,
      reading_stats_key: book.value.readingStatsKey,
    }
  }),
})

const toggleAlwaysOnTop = () => {
  isAlwaysOnTop.value = !isAlwaysOnTop.value
  window.electronAPI.win.setAlwaysOnTop(isAlwaysOnTop.value)
  saveSetting('reader_alwaysOnTop', isAlwaysOnTop.value ? 'true' : 'false')
}

// ---- Data fetch ----
const fetchBook = async () => {
  try {
    const dataStore = useDataStore()
    if (!dataStore.dataLoaded.value) await dataStore.loadAllData()
    const b = dataStore.getBook(props.bookId)
    if (b) {
      book.value = {
        id: b.id,
        title: b.title,
        author: b.author,
        bookType: b.bookType,
        progressIndex: b.progressIndex,
        progressOffset: b.progressOffset,
        lastReadAt: b.lastReadAt,
        readingStatsKey: b.readingStatsKey,
      }
      currentChapterIndex.value = b.progressIndex || 0
    }
  } catch (e) { console.error(e) }
}
const fetchChapters = async () => {
  try {
    const r = await window.electronAPI.db.getBookChapters(props.bookId)
    chapters.value = r as Chapter[]
    if (chapters.value.length > 0) {
      currentChapterIndex.value = Math.min(Math.max(currentChapterIndex.value, 0), chapters.value.length - 1)
    } else {
      currentChapterIndex.value = 0
    }
  } catch (e) { console.error(e) }
}

// Rules are now handled by useRules

// ---- Chapter data (computed) ----
const currentChapterData = computed(() => chapters.value[currentChapterIndex.value] || null)
const prevChapterData = computed(() => { const i = currentChapterIndex.value - 1; return i >= 0 ? chapters.value[i] : null })
const nextChapterData = computed(() => { const i = currentChapterIndex.value + 1; return i < chapters.value.length ? chapters.value[i] : null })
const hasReadableChapters = computed(() => chapters.value.some(ch => !ch.body_text_missing || ch.body_text || ch.body))
const currentBody = computed(() => currentChapterData.value ? applyReplacements(currentChapterData.value.body) : '')
const prevBody = computed(() => prevChapterData.value ? applyReplacements(prevChapterData.value.body) : '')
const nextBody = computed(() => nextChapterData.value ? applyReplacements(nextChapterData.value.body) : '')

// ---- Progress ----
const saveProgress = async () => {
  if (!book.value) return
  try {
    const { updateBook } = useDataStore()
    await updateBook(props.bookId, {
      progressIndex: currentChapterIndex.value,
      progressOffset: pagination.currentPage.value,
      lastReadAt: Date.now(),
    })
    
    uploadProgressToWebdav({
      bookId: props.bookId,
      title: book.value.title,
      author: book.value.author || '',
      currentChapterIndex: currentChapterIndex.value,
      currentChapterTitle: currentChapterData.value?.title || '',
      currentChapterBodyLength: currentChapterData.value?.body_text?.length || 0,
      currentPage: pagination.currentPage.value,
      totalPages: pagination.totalPages.value,
      pendingWebdavPos: pagination.pendingWebdavPos.value
    })
  } catch (e) { console.error(e) }
}

// ---- Reader Paginator (async prewarm + cache) ----
const paginator = useReaderPaginator({
  containerRef, fontSize, lineHeight, letterSpacing, fontWeight, fontFamily,
  textAlign, marginX, marginY, pageMode, pIndent, pSpacing,
})

const pagesResult = computed(() => {
  if (!currentChapterData.value) return null
  const snap = paginator.capturePaginationSnapshot(currentChapterData.value.id)
  return paginator.getPagesForChapter(currentChapterData.value.id, snap.hash)
})

// ---- Pagination (composable) ----
const pagination = usePagination({
  contentRef, containerRef, prevContentRef, prevContainerRef,
  pageMode, doublePageStep, flipMode, flipSpeed, marginX, coverColor,
  chapters, currentChapterIndex, saveProgress,
  precomputedPages: computed(() => pagesResult.value?.slices ?? null),
  pageCacheHit: computed(() => pagesResult.value?.isCacheHit ?? false),
  onBeforeChapterChange: (newIndex: number) => {
    const ch = chapters.value[newIndex]
    if (!ch) return
    const snap = paginator.capturePaginationSnapshot(ch.id)
    const body = applyReplacements(ch.body)
    paginator.prewarmChapterText(ch.id, body, ch.body_text, ch.title, snap)
  },
})
const {
  currentPage, totalPages, containerWidth, pendingWebdavPos,
  carouselSliding, suppressAnim, showingCover, sweepDir, snapshotHtml,
  flipDurationMap, pageOffset, prevPageOffset, carouselTransform, progressPercent,
  recalc, calculatePages, nextPage, prevPage, slideToNextChapter, goToChapter,
} = pagination

const sliderMax = computed(() => sliderMode.value === 'book' ? Math.max(0, chapters.value.length - 1) : Math.max(0, totalPages.value - 1))
const sliderValue = computed(() => sliderMode.value === 'book' ? currentChapterIndex.value : currentPage.value)

const recordReadingActivity = () => {
  readingTimeTracker.signalActivity().catch((error) => {
    console.error('Record reading activity failed:', error)
  })
}

const trackedNextPage = () => {
  recordReadingActivity()
  nextPage()
}

const trackedPrevPage = () => {
  recordReadingActivity()
  prevPage()
}

const trackedSlideToNextChapter = () => {
  recordReadingActivity()
  slideToNextChapter()
}

const trackedGoToChapter = (idx: number, keepMenu = false) => {
  recordReadingActivity()
  goToChapter(idx, keepMenu)
}

const trackedSetCurrentPage = (page: number) => {
  recordReadingActivity()
  currentPage.value = page
}

const getChapterOffset = () => {
  const bodyTextLength = currentChapterData.value?.body_text?.length || 0
  if (bodyTextLength <= 0 || totalPages.value <= 0) return 0
  return Math.floor(bodyTextLength * (currentPage.value / totalPages.value))
}

const buildBookmarkSummary = (offset: number) => {
  const text = (currentChapterData.value?.body_text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return currentChapterData.value?.title || ''
  const start = Math.max(0, Math.min(offset, text.length - 1))
  return text.slice(start, start + 96)
}

const handleCreateBookmark = async () => {
  if (!book.value || !currentChapterData.value) return
  const chapterOffset = getChapterOffset()
  try {
    await createBookmark({
      bookId: props.bookId,
      bookIdentity: book.value.readingStatsKey,
      bookTitle: book.value.title,
      bookAuthor: book.value.author || '',
      chapterOrderIndex: currentChapterData.value.order_index,
      chapterTitle: currentChapterData.value.title,
      chapterOffset,
      progressPercent: progressPercent.value,
      summary: buildBookmarkSummary(chapterOffset),
    })
    bookmarkPanelVersion.value += 1
    bookmarkStatus.value = '已添加书签'
    window.setTimeout(() => { bookmarkStatus.value = '' }, 1800)
  } catch (error) {
    console.error('Create bookmark failed:', error)
    bookmarkStatus.value = '书签保存失败'
    window.setTimeout(() => { bookmarkStatus.value = '' }, 1800)
  }
}

const goToBookmarkTarget = (target: BookmarkTarget) => {
  recordReadingActivity()
  const targetIndex = chapters.value.findIndex((chapter) => chapter.order_index === target.chapterOrderIndex)
  const nextIndex = targetIndex >= 0 ? targetIndex : target.chapterOrderIndex
  if (nextIndex < 0 || nextIndex >= chapters.value.length) return
  pendingWebdavPos.value = Math.max(0, target.chapterOffset)
  if (nextIndex !== currentChapterIndex.value) {
    goToChapter(nextIndex, true)
  } else {
    recalc()
  }
  showBookmarks.value = false
  showMenu.value = false
}

// ---- Theme (composable) ----
const theme = useTheme({
  onStyleChanged: () => { saveAllStyling(); recalc() },
})
const { readerBgStyle } = theme

const textStyle = computed(() => ({
  fontFamily: fontFamily.value, fontSize: fontSize.value + 'px',
  lineHeight: String(lineHeight.value), letterSpacing: letterSpacing.value + 'em',
  fontWeight: String(fontWeight.value), color: effectiveFontColor.value,
  textAlign: textAlign.value as any,
}))

const isAutoNightActive = computed(() => readerAutoNightEnabled.value && resolvedBucket.value === 'dark')
const shouldOverrideAutoNight = computed(() => (
  isAutoNightActive.value && readerAutoNightCustomPolicy.value === 'override'
))
const effectiveFontColor = computed(() => shouldOverrideAutoNight.value ? '#e2e8f0' : fontColor.value)
const effectiveReaderBgStyle = computed(() => (
  shouldOverrideAutoNight.value
    ? { backgroundColor: '#0f172a' }
    : readerBgStyle.value
))

// HUD logic handled by useHUD

// ---- TTS (composable) ----
const tts = useTTS({
  contentRef, containerWidth,
  ttsEngine, ttsVoice, ttsRate, highlightColor,
  flipDurationMs: computed(() => flipDurationMap.value.ms),
  ttsMiMoApiKey, ttsMiMoVoice,
  nextPage: trackedNextPage, slideToNextChapter: trackedSlideToNextChapter,
})
const { ttsActive, edgeVoices, systemVoices, stopTts, handleTtsClick, loadVoices, injectHighlightStyles } = tts

const startTts = () => {
  const res = tts.startTts()
  if (res === 'MIMO_KEY_MISSING') {
    if (confirm('尚未配置小米 MiMo API Key，是否立即前往设置？')) {
      showMenu.value = true
      openPanel('tts')
      window.open('https://platform.xiaomimimo.com/#/console/api-keys', '_blank')
    }
  }
}

// ---- Auto Page ----
let autoPageTimer: number | null = null
const startAutoPage = () => {
  if (autoPageTimer) clearInterval(autoPageTimer)
  autoPageActive.value = true
  autoPageTimer = window.setInterval(() => { if (!showMenu.value) trackedNextPage() }, autoPageSpeed.value * 1000)
}
const stopAutoPage = () => { if (autoPageTimer) clearInterval(autoPageTimer); autoPageTimer = null; autoPageActive.value = false }
const toggleAutoPage = () => { if (autoPageActive.value) stopAutoPage(); else startAutoPage() }
watch(autoPageSpeed, () => { if (autoPageActive.value) startAutoPage() })

// ---- WebDAV download ----
const downloadProgressFromWebdav = async () => {
  if (!webdavSync.value || !webdavUrl.value || !book.value) return
  const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
  let author = book.value.author || '未知'; if (!author.trim()) author = '未知'
  let safeName = book.value.title.replace(/[\\/:\"*?<>|]/g, '_')
  let safeAuthor = author.replace(/[\\/:\"*?<>|]/g, '_')
  const filename = `${safeName}_${safeAuthor}.json`
  let baseURL = webdavUrl.value; if (webdavDir.value) baseURL += webdavDir.value
  try {
    const res = await window.electronAPI.webdav.request({ url: baseURL + 'bookProgress/' + encodeURIComponent(filename), method: 'GET', headers: { 'Authorization': `Basic ${auth}` } })
    if (res.status === 200 && res.data) {
      const remote = JSON.parse(res.data)
      const localTime = book.value.lastReadAt ? new Date(book.value.lastReadAt).getTime() : 0
      const isLocalFresh = currentChapterIndex.value === 0 && currentPage.value === 0
      if (remote.durChapterTime && (remote.durChapterTime > localTime + 5000 || isLocalFresh)) {
        if (remote.durChapterIndex >= 0 && remote.durChapterIndex < chapters.value.length) {
          pendingWebdavPos.value = remote.durChapterPos || 0
          if (remote.durChapterIndex !== currentChapterIndex.value) goToChapter(remote.durChapterIndex, true)
          else recalc()
        }
      }
    }
  } catch (e) { console.error('WebDAV download err:', e) }
}

// ---- Interaction ----
const closeAll = () => {
  showMenu.value = false; showStyling.value = false; showToc.value = false;
  showSearch.value = false; showRules.value = false; showAutoPage.value = false;
  showTts.value = false; showReaderOptions.value = false; showBookmarks.value = false;
}
const closeKeyHints = () => { showKeyHints.value = false }
const disableKeyHints = () => { showKeyHints.value = false; saveSetting('hideKeyHints', 'true') }

const handleClick = (e: MouseEvent) => {
  const t = e.target as HTMLElement
  if (t.closest('.m-top') || t.closest('.m-bot') || t.closest('.m-info') || t.closest('.sty-p') || t.closest('.toc-p') || t.closest('.search-p') || t.closest('.rules-p') || t.closest('.copy-modal') || t.closest('.reader-options-p')) return
  recordReadingActivity()
  if (showMenu.value) { closeAll(); return }
  const x = e.clientX, y = e.clientY
  if (handleTtsClick(x, y)) return
  const w = window.innerWidth, h = window.innerHeight
  const isCenterCol = x > w / 3 && x < (w / 3) * 2
  const isCenterRow = y > h / 3 && y < (h / 3) * 2
  if (isCenterCol && isCenterRow) showMenu.value = true
  else if (x < w / 3 || (isCenterCol && y < h / 3)) trackedPrevPage()
  else trackedNextPage()
}
let touchStartX = 0, touchStartY = 0
const handleTouchStart = (e: TouchEvent) => {
  if (!showMenu.value) {
    recordReadingActivity()
    touchStartX = e.changedTouches[0].screenX
    touchStartY = e.changedTouches[0].screenY
  }
}
const handleTouchEnd = (e: TouchEvent) => {
  if (showMenu.value) return
  const endX = e.changedTouches[0].screenX, endY = e.changedTouches[0].screenY
  if (Math.abs(endX - touchStartX) > Math.abs(endY - touchStartY) * 1.5) {
    const diff = endX - touchStartX
    if (diff < -50) trackedNextPage(); else if (diff > 50) trackedPrevPage()
  }
}
const handleContextMenu = (e: MouseEvent) => {
  if (showMenu.value) return
  const t = e.target as HTMLElement; const p = t.closest('p, h2, h3, div.ch-body')
  if (p && p.textContent && p.textContent.trim().length > 0) { selectedText.value = p.textContent.trim(); showCopyModal.value = true }
}
const copyToClipboard = () => { navigator.clipboard.writeText(selectedText.value); showCopyModal.value = false }
const handleWheel = (e: WheelEvent) => {
  if (showMenu.value) return
  if (Math.abs(e.deltaY) < 10) return
  e.preventDefault()
  recordReadingActivity()
  if (e.deltaY > 0) trackedNextPage()
  else trackedPrevPage()
}
const handleKeydown = (e: KeyboardEvent) => {
  const k = e.key, c = e.code
  if (k === 'Escape') {
    e.stopPropagation(); e.stopImmediatePropagation()
    if (props.isImmersive) { toggleImmersiveMode(); return }
    if (showMenu.value) { closeAll(); return }
    if (ttsActive.value) { stopTts(); return }
    if (autoPageActive.value) { stopAutoPage(); return }
    handleGoBack(); return
  }
  if (showMenu.value) return
  if (nextKeys.value.includes(k) || nextKeys.value.includes(c)) { e.preventDefault(); trackedNextPage() }
  else if (prevKeys.value.includes(k) || prevKeys.value.includes(c)) { e.preventDefault(); trackedPrevPage() }
}
const toggleImmersiveMode = () => {
  emit('toggle-immersive', !props.isImmersive)
  if (props.isImmersive) { setTimeout(recalc, 400); setTimeout(recalc, 800) }
}
const handleGoBack = async () => {
  try {
    await readingTimeTracker.stop()
    saveProgress()
    closeAll()
  } catch (e) {
    console.error(e)
  } finally {
    emit('go-back')
  }
}

const openBookStats = () => {
  emit('open-book-stats', props.bookId)
}

const openPanel = (panel: string) => {
  showToc.value = panel === 'toc' ? !showToc.value : false
  showStyling.value = panel === 'styling' ? !showStyling.value : false
  showSearch.value = panel === 'search' ? !showSearch.value : false
  showRules.value = panel === 'rules' ? !showRules.value : false
  showAutoPage.value = panel === 'autopage' ? !showAutoPage.value : false
  showTts.value = panel === 'tts' ? !showTts.value : false
  showReaderOptions.value = panel === 'readerOptions' ? !showReaderOptions.value : false
  showBookmarks.value = panel === 'bookmarks' ? !showBookmarks.value : false
}

const jumpToSearchResult = (idx: number) => { trackedGoToChapter(idx, true) }

const handleWindowBlur = () => {
  readingTimeTracker.flush().catch((error) => {
    console.error('Flush reading stats on blur failed:', error)
  })
}

const handleVisibilityChange = () => {
  if (!document.hidden) return
  readingTimeTracker.flush().catch((error) => {
    console.error('Flush reading stats on visibility change failed:', error)
  })
}

watch(currentChapterIndex, () => recalc())
watch([fontSize, lineHeight, letterSpacing, marginX, marginY, fontFamily, fontWeight], () => recalc())
watch(currentPage, () => saveProgress())

// ---- Lifecycle ----
onMounted(async () => {
  window.electronAPI.win.setControlsVisible(false)
  await loadAllSettings()
  await fetchBook()
  await fetchChapters()
  await fetchRules(props.bookId)
  startHUD()
  if (props.initialBookmark && chapters.value.length > 0) {
    const targetIndex = chapters.value.findIndex((chapter) => chapter.order_index === props.initialBookmark?.chapterOrderIndex)
    currentChapterIndex.value = targetIndex >= 0
      ? targetIndex
      : Math.min(Math.max(props.initialBookmark.chapterOrderIndex, 0), chapters.value.length - 1)
    pendingWebdavPos.value = Math.max(0, props.initialBookmark.chapterOffset)
    currentPage.value = 0
  } else if (book.value) {
    currentPage.value = book.value.progressOffset || 0
  }
  if (!props.initialBookmark) {
    await downloadProgressFromWebdav()
  }
  await readingTimeTracker.start()
  loading.value = false
  setTimeout(calculatePages, 300)
  setTimeout(() => {
    if (currentChapterData.value) {
      const snap = paginator.capturePaginationSnapshot(currentChapterData.value.id)
      paginator.prewarmChapterText(currentChapterData.value.id, currentBody.value, currentChapterData.value.body_text, currentChapterData.value.title, snap)
    }
    if (prevChapterData.value) {
      const snap = paginator.capturePaginationSnapshot(prevChapterData.value.id)
      paginator.prewarmChapterText(prevChapterData.value.id, prevBody.value, prevChapterData.value.body_text, prevChapterData.value.title, snap)
    }
    if (nextChapterData.value) {
      const snap = paginator.capturePaginationSnapshot(nextChapterData.value.id)
      paginator.prewarmChapterText(nextChapterData.value.id, nextBody.value, nextChapterData.value.body_text, nextChapterData.value.title, snap)
    }
  }, 400)
  window.addEventListener('resize', recalc)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('blur', handleWindowBlur)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  loadVoices()
  injectHighlightStyles()
})
onUnmounted(async () => {
  stopHUD()
  stopTts()
  stopAutoPage()
  await readingTimeTracker.stop()
  window.electronAPI.win.setControlsVisible(true)
  saveProgress()
  window.removeEventListener('resize', recalc)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('blur', handleWindowBlur)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="reader-root" :style="{ 
    touchAction: showMenu ? 'auto' : 'none',
    '--dur-slide': flipDurationMap.slide,
    '--dur-cover': flipDurationMap.cover,
    '--dur-curl': flipDurationMap.curl,
    '--p-indent': pIndent + 'em',
    '--p-spacing': pSpacing + 'em'
  }" @wheel="handleWheel" @click="handleClick" @contextmenu.prevent="handleContextMenu" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <!-- Background layer -->
    <div class="fixed inset-0 pointer-events-none transition-all duration-300 transform-gpu origin-center" 
         :style="[effectiveReaderBgStyle, { filter: blurAmount > 0 && !shouldOverrideAutoNight ? `blur(${blurAmount}px)` : 'none', transform: blurAmount > 0 && !shouldOverrideAutoNight ? 'scale(1.1)' : 'none' }]"
         :class="{ 'bg-[#0f172a]': !bgImage }">
    </div>
    <div v-if="bgImage && blurAmount > 0 && !shouldOverrideAutoNight" class="fixed inset-0 pointer-events-none bg-black/40"></div>
    <div v-if="isAutoNightActive && !shouldOverrideAutoNight" class="fixed inset-0 pointer-events-none bg-black/25"></div>

    <div v-if="loading" class="load"><div class="spinner"></div><p>正在载入...</p></div>

    <template v-else>
      <div v-if="!book || chapters.length === 0 || !hasReadableChapters" class="empty-reader">
        <div class="empty-reader-card">
          <div class="empty-reader-icon">!</div>
          <h2>{{ book ? '这本书暂无可读取正文' : '未找到书籍记录' }}</h2>
          <p>
            {{ book
              ? '数据库里保留了书籍信息，但没有对应章节内容。请先从完整备份恢复，或重新导入这本书。'
              : '当前书籍记录不存在，可能已被删除或同步数据不完整。'
            }}
          </p>
          <button @click="handleGoBack">返回书架</button>
        </div>
      </div>

      <template v-else>
      <!-- Reveal animation overlay -->
      <div v-if="showingCover" class="snapshot-layer" :class="[sweepDir, flipMode === 'curl' ? 'is-curl' : '']">
        <div class="absolute inset-0 pointer-events-none transform-gpu origin-center" 
             :style="[effectiveReaderBgStyle, { filter: blurAmount > 0 && !shouldOverrideAutoNight ? `blur(${blurAmount}px)` : 'none', transform: blurAmount > 0 && !shouldOverrideAutoNight ? 'scale(1.1)' : 'none' }]"
             :class="{ 'bg-[#0f172a]': !bgImage }"></div>
        <div v-if="bgImage && blurAmount > 0 && !shouldOverrideAutoNight" class="absolute inset-0 pointer-events-none bg-black/40"></div>
        <div class="absolute inset-0" v-html="snapshotHtml"></div>
      </div>
      <div v-if="showingCover" class="sweep-line" :class="[sweepDir, flipMode === 'curl' ? 'is-curl' : '']"></div>

      <!-- Carousel -->
      <div class="carousel" :class="{ sliding: carouselSliding }" :style="{ transform: carouselTransform }">
        <div class="slide">
          <div ref="prevContainerRef" class="pg-ctr" :style="{ padding: `${marginY}px ${marginX}px` }">
            <div ref="prevContentRef" class="pg-ct" :style="{
              ...textStyle, transform: `translateX(${prevPageOffset})`,
              columnWidth: pageMode === 'double' ? `calc(50vw - ${marginX * 2}px)` : `calc(100vw - ${marginX * 2}px)`,
              columnGap: `${marginX * 2}px`, columnFill: 'auto', alignContent: 'start'
            }" v-if="prevChapterData">
              <h2 v-if="chapterTitleDisplay !== 'none'" class="ch-title" :style="{ fontSize: (fontSize*1.4)+'px', color: effectiveFontColor, textAlign: (chapterTitleDisplay as any) }">{{ prevChapterData.title }}</h2>
              <div v-html="prevBody" class="ch-body"></div>
            </div>
          </div>
        </div>

        <div class="slide">
          <div ref="containerRef" class="pg-ctr" :style="{ padding: `${marginY}px ${marginX}px` }">
            <div ref="contentRef" class="pg-ct" :class="{ 'pg-anim': !suppressAnim, 'pg-cache-fade': paginator.isCacheHit.value && !suppressAnim }" :style="{
              ...textStyle, transform: `translateX(${pageOffset})`,
              columnWidth: pageMode === 'double' ? `calc(50vw - ${marginX * 2}px)` : `calc(100vw - ${marginX * 2}px)`,
              columnGap: `${marginX * 2}px`, columnFill: 'auto', alignContent: 'start'
            }">
              <h2 v-if="chapterTitleDisplay !== 'none'" class="ch-title" :style="{ fontSize: (fontSize*1.4)+'px', color: effectiveFontColor, textAlign: (chapterTitleDisplay as any) }">{{ currentChapterData?.title }}</h2>
              <div v-html="currentBody" class="ch-body"></div>
            </div>
          </div>
        </div>

        <div class="slide">
          <div class="pg-ctr" :style="{ padding: `${marginY}px ${marginX}px` }">
            <div class="pg-ct" :style="textStyle" v-if="nextChapterData">
              <h2 v-if="chapterTitleDisplay !== 'none'" class="ch-title" :style="{ fontSize: (fontSize*1.4)+'px', color: effectiveFontColor, textAlign: (chapterTitleDisplay as any) }">{{ nextChapterData.title }}</h2>
              <div v-html="nextBody" class="ch-body"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Key Hints -->
      <Transition name="fade">
        <div v-if="showKeyHints" class="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.stop>
          <div class="glass-dark p-8 rounded-3xl w-full max-w-md shadow-2xl border border-white/10 animate-scale-up">
            <h3 class="text-2xl font-bold mb-6 flex items-center gap-3">⌨️ 快捷键指南</h3>
            <div class="space-y-4 mb-8">
              <div class="flex items-center justify-between p-3 glass rounded-xl"><span class="text-slate-300">上一页</span><div class="flex gap-1"><kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">←</kbd><kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">A/W</kbd><kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">PgUp</kbd></div></div>
              <div class="flex items-center justify-between p-3 glass rounded-xl"><span class="text-slate-300">下一页</span><div class="flex gap-1"><kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">→</kbd><kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">D/S</kbd><kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">PgDn</kbd></div></div>
              <div class="flex items-center justify-between p-3 glass rounded-xl"><span class="text-slate-300">退出 / 菜单</span><kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">ESC</kbd></div>
              <div class="flex items-center justify-between p-3 glass rounded-xl"><span class="text-slate-300">鼠标操作</span><span class="text-xs text-slate-400">点击中间唤出菜单</span></div>
            </div>
            <div class="flex gap-4">
              <button @click="disableKeyHints" class="flex-1 py-3 px-4 glass-card rounded-xl text-sm border border-white/5">不再提示</button>
              <button @click="closeKeyHints" class="flex-1 py-3 px-4 bg-blue-600 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20">我知道了</button>
            </div>
          </div>
        </div>
      </Transition>

      <ReaderHUD 
        v-if="!showMenu"
        :topLeft="formatHUD(hudTopLeft, { bookTitle: book?.title, chapterTitle: currentChapterData?.title, isFirstPage: currentChapterIndex === 0 && pagination.currentPage.value === 0, currentPage: pagination.currentPage.value, totalPages: pagination.totalPages.value, currentChapterIndex, totalChapters: chapters.length, progressPercent: progressPercent })"
        :topCenter="formatHUD(hudTopCenter, { bookTitle: book?.title, chapterTitle: currentChapterData?.title, isFirstPage: currentChapterIndex === 0 && pagination.currentPage.value === 0, currentPage: pagination.currentPage.value, totalPages: pagination.totalPages.value, currentChapterIndex, totalChapters: chapters.length, progressPercent: progressPercent })"
        :topRight="formatHUD(hudTopRight, { bookTitle: book?.title, chapterTitle: currentChapterData?.title, isFirstPage: currentChapterIndex === 0 && pagination.currentPage.value === 0, currentPage: pagination.currentPage.value, totalPages: pagination.totalPages.value, currentChapterIndex, totalChapters: chapters.length, progressPercent: progressPercent })"
        :bottomLeft="formatHUD(hudBottomLeft, { bookTitle: book?.title, chapterTitle: currentChapterData?.title, isFirstPage: currentChapterIndex === 0 && pagination.currentPage.value === 0, currentPage: pagination.currentPage.value, totalPages: pagination.totalPages.value, currentChapterIndex, totalChapters: chapters.length, progressPercent: progressPercent })"
        :bottomCenter="formatHUD(hudBottomCenter, { bookTitle: book?.title, chapterTitle: currentChapterData?.title, isFirstPage: currentChapterIndex === 0 && pagination.currentPage.value === 0, currentPage: pagination.currentPage.value, totalPages: pagination.totalPages.value, currentChapterIndex, totalChapters: chapters.length, progressPercent: progressPercent })"
        :bottomRight="formatHUD(hudBottomRight, { bookTitle: book?.title, chapterTitle: currentChapterData?.title, isFirstPage: currentChapterIndex === 0 && pagination.currentPage.value === 0, currentPage: pagination.currentPage.value, totalPages: pagination.totalPages.value, currentChapterIndex, totalChapters: chapters.length, progressPercent: progressPercent })"
      />

      <Transition name="fade">
        <div v-if="bookmarkStatus" class="bookmark-toast">
          {{ bookmarkStatus }}
        </div>
      </Transition>

      <!-- Reader Menu -->
      <Transition name="menu-slide">
        <ReaderMenu 
          v-if="showMenu"
          :book="book" :can-open-stats="!readingTimeStatsHidden" :isAlwaysOnTop="isAlwaysOnTop" :isImmersive="props.isImmersive"
          :showSearch="showSearch" :showRules="showRules" :showStyling="showStyling"
          :showAutoPage="showAutoPage" :autoPageActive="autoPageActive"
          :showTts="showTts" :ttsActive="ttsActive"
          :showToc="showToc" :showBookmarks="showBookmarks" :showReaderOptions="showReaderOptions"
          :currentChapterIndex="currentChapterIndex" :chapters="chapters"
          :currentPage="currentPage" :totalPages="totalPages"
          :sliderMax="sliderMax" :sliderValue="sliderValue"
          :currentChapterTitle="currentChapterData?.title || ''"
          @back="handleGoBack" @open-book-stats="openBookStats" @create-bookmark="handleCreateBookmark" @toggle-always-on-top="toggleAlwaysOnTop"
          @toggle-immersive="toggleImmersiveMode" @open-panel="openPanel"
          @go-to-chapter="(idx) => trackedGoToChapter(idx, true)"
          @slider-input="(val) => { if(sliderMode==='book') trackedGoToChapter(val, true); else trackedSetCurrentPage(val); }"
        >
          <Transition name="sf"><SearchPanel v-if="showSearch" :chapters="chapters" @close="showSearch=false" @jump="(idx) => { jumpToSearchResult(idx); showSearch=false; showMenu=false; }" /></Transition>
          <Transition name="sf"><TOCPanel v-if="showToc" :chapters="chapters" :currentChapterIndex="currentChapterIndex" @close="showToc=false" @jump="(idx) => { trackedGoToChapter(idx, true); showToc=false; showMenu=false; }" /></Transition>
          <Transition name="sf"><BookmarksPanel v-if="showBookmarks" :book-id="props.bookId" :refresh-key="bookmarkPanelVersion" @close="showBookmarks=false" @jump="goToBookmarkTarget" /></Transition>
          <Transition name="sf"><RulesPanel v-if="showRules" :rules="(rules as any)" :bookId="props.bookId" @close="showRules=false" @refresh="() => { fetchRules(props.bookId); paginator.clearCache(); recalc(); }" /></Transition>
          <Transition name="sf"><StylePanel v-if="showStyling" :recalc="recalc" @close="showStyling=false" /></Transition>
          <Transition name="sf"><AutoPagePanel v-if="showAutoPage" :autoPageActive="autoPageActive" @close="showAutoPage=false" @toggle="toggleAutoPage" /></Transition>
          <Transition name="sf"><TTSPanel v-if="showTts" :ttsActive="ttsActive" :edgeVoices="edgeVoices" :systemVoices="systemVoices" @close="showTts=false" @start="startTts" @stop="stopTts" /></Transition>
          <Transition name="sf"><OptionsPanel v-if="showReaderOptions" :book="book" @close="showReaderOptions=false" @update-book="(d) => { if(book) { book.title = d.title; book.author = d.author; } }" /></Transition>
        </ReaderMenu>
      </Transition>

      <!-- Copy Modal -->
      <Transition name="fade">
        <div v-if="showCopyModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" @click.stop="showCopyModal = false">
          <div class="copy-modal bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col gap-4 max-h-[80vh]" @click.stop>
            <div class="flex items-center justify-between"><h3 class="text-slate-200 font-bold">文字提取与复制</h3><button @click="showCopyModal = false" class="text-slate-400 hover:text-white px-2">✕</button></div>
            <textarea v-model="selectedText" class="w-full flex-1 min-h-[150px] bg-slate-800 text-slate-300 resize-none rounded-xl p-4 outline-none border border-slate-700/50 focus:border-blue-500" style="user-select: text;"></textarea>
            <div class="flex justify-end gap-3 mt-2"><button @click="showCopyModal = false" class="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium">取消</button><button @click="copyToClipboard" class="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-bold shadow-lg shadow-blue-500/20">复制全文</button></div>
          </div>
        </div>
      </Transition>
      </template>
    </template>
  </div>
</template>

<style scoped>
.reader-root { position:fixed; inset:0; overflow:hidden; user-select:none; display:flex; flex-direction:column; color:white; color-scheme:only light; }
.bookmark-toast { position:absolute; left:50%; top:86px; transform:translateX(-50%); z-index:70; padding:8px 14px; border-radius:999px; background:rgba(15,23,42,0.9); border:1px solid rgba(255,255,255,0.12); color:white; font-size:13px; font-weight:700; box-shadow:0 12px 32px rgba(0,0,0,0.35); backdrop-filter:blur(16px); }
.load { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:rgba(255,255,255,0.5); z-index:1; }
.spinner { width:40px; height:40px; border:2px solid rgba(59,130,246,0.2); border-top-color:#3b82f6; border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg) } }
.empty-reader { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; padding:24px; color:rgba(255,255,255,0.88); }
.empty-reader-card { width:min(460px, 100%); padding:28px; border:1px solid rgba(255,255,255,0.12); border-radius:22px; background:rgba(15,23,42,0.72); backdrop-filter:blur(24px); box-shadow:0 24px 80px rgba(0,0,0,0.35); text-align:center; }
.empty-reader-icon { width:38px; height:38px; margin:0 auto 16px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:rgba(59,130,246,0.18); color:#93c5fd; font-weight:800; font-size:22px; }
.empty-reader h2 { margin:0 0 10px; font-size:22px; font-weight:800; }
.empty-reader p { margin:0 auto 22px; max-width:360px; color:rgba(226,232,240,0.72); line-height:1.7; font-size:14px; }
.empty-reader button { padding:10px 18px; border-radius:12px; background:#2563eb; color:white; font-weight:700; border:0; cursor:pointer; }
.empty-reader button:hover { background:#3b82f6; }

.snapshot-layer { position: absolute; inset: 0; z-index: 20; pointer-events: none; overflow: hidden; }
.snapshot-layer.left:not(.is-curl) { animation: clipLeft var(--dur-cover) cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.snapshot-layer.right:not(.is-curl) { animation: clipRight var(--dur-cover) cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes clipLeft { from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } to { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); } }
@keyframes clipRight { from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } to { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); } }

.sweep-line { position: absolute; top: 0; bottom: 0; width: 40px; z-index: 21; pointer-events: none; background: linear-gradient(to right, transparent, rgba(0,0,0,0.15), rgba(0,0,0,0.4), transparent); }
.sweep-line.left:not(.is-curl) { animation: sweepLeft var(--dur-cover) cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.sweep-line.right:not(.is-curl) { animation: sweepRight var(--dur-cover) cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes sweepLeft { from { transform: translateX(100vw); } to { transform: translateX(-40px); } }
@keyframes sweepRight { from { transform: translateX(-40px); } to { transform: translateX(100vw); } }

.sweep-line.is-curl { width: 120px; background: linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 40%, transparent 100%); transform-origin: center; }
.sweep-line.is-curl.left { animation: curlSweepLeft var(--dur-curl) ease-in-out forwards; }
@keyframes curlSweepLeft { 0% { transform: translateX(100vw) rotate(15deg) scaleX(1); opacity: 1; } 100% { transform: translateX(-50vw) rotate(15deg) scaleX(2.5); opacity: 0; } }
.sweep-line.is-curl.right { animation: curlSweepRight var(--dur-curl) ease-in-out forwards; background: linear-gradient(to left, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 40%, transparent 100%); }
@keyframes curlSweepRight { 0% { transform: translateX(-50vw) rotate(-15deg) scaleX(1); opacity: 1; } 100% { transform: translateX(100vw) rotate(-15deg) scaleX(2.5); opacity: 0; } }
.snapshot-layer.is-curl.left { animation: curlClipLeft var(--dur-curl) ease-in-out forwards; }
@keyframes curlClipLeft { 0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } 100% { clip-path: polygon(0 0, -20% 0, -50% 100%, 0 100%); } }
.snapshot-layer.is-curl.right { animation: curlClipRight var(--dur-curl) ease-in-out forwards; }
@keyframes curlClipRight { 0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); } 100% { clip-path: polygon(100% 0, 120% 0, 150% 100%, 100% 100%); } }

.carousel { display:flex; width:300vw; height:100%; transform:translateX(-100vw); z-index:1; }
.carousel.sliding { transition: transform var(--dur-slide) cubic-bezier(0.25,0.46,0.45,0.94); }
.slide { width:100vw; height:100%; flex-shrink:0; overflow:hidden; }
.pg-ctr { width:100%; height:100%; overflow:hidden; box-sizing:border-box; }
.pg-ct { height:100%; column-fill:auto; align-content:start; }
.pg-ct.pg-anim { transition: transform var(--dur-slide) cubic-bezier(0.25,0.46,0.45,0.94); }
.pg-cache-fade { animation: paginator-fade-in 0.1s ease-out; }
@keyframes paginator-fade-in { from { opacity: 0.85; } to { opacity: 1; } }
.ch-title { font-weight:700; margin-bottom:1.5em; opacity:0.85; }
.ch-body { height:100%; }
.ch-body :deep(p) { text-indent: var(--p-indent); margin-bottom: var(--p-spacing); }
/* kbd style */
.kbd { padding: 0.25rem 0.5rem; background-color: rgba(255, 255, 255, 0.1); border-radius: 0.5rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); border: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.875rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

.fade-enter-active,.fade-leave-active { transition:opacity .25s ease; }
.fade-enter-from,.fade-leave-to { opacity:0; }
.sf-enter-active,.sf-leave-active { transition:all .3s ease; }
.sf-enter-from { opacity:0; transform:translateY(12px); }
.sf-leave-to { opacity:0; transform:translateY(12px); }

.menu-slide-enter-active, .menu-slide-leave-active { transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-slide-enter-from, .menu-slide-leave-to { opacity: 0; }
</style>
