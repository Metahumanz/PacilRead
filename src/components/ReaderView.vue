<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted, nextTick, type CSSProperties } from 'vue'
import { useSettings } from '../composables/useSettings'
import { useTheme } from '../composables/useTheme'
import { useTTS } from '../composables/useTTS'
import { usePagination } from '../composables/usePagination'
import { useReaderPaginator } from '../composables/useReaderPaginator'
import { useRules } from '../composables/useRules'
import { useHUD } from '../composables/useHUD'
import { shouldUsePrefetchedProgress, useSync } from '../composables/useSync'
import { useReadingTimeTracker } from '../composables/useReadingTimeTracker'
import { useAppTheme } from '../composables/useAppTheme'
import { useDisplayRefreshRate } from '../composables/useDisplayRefreshRate'
import { useChapterContentCache } from '../composables/useChapterContentCache'
import { useReaderPrewarm } from '../composables/useReaderPrewarm'
import { useReaderProgress } from '../composables/useReaderProgress'
import { usePageFlipScheduler } from '../composables/usePageFlipScheduler'
import { createBookmark, type BookmarkTarget } from '../composables/useBookmarks'
import { computeReaderPageMetrics } from '../utils/readerLayout'
import { perfLog, perfNow } from '../utils/perf'
import { isSimilarRemoteProgress } from '../utils/remoteProgress'
import { quoteContextExcerpt } from '../utils/quoteShare'
import { formatShortcutKey, shortcutEventKeys } from '../utils/keyboardShortcuts'
import { createThrottledTask } from '../utils/taskScheduler'
import { isDoublePageAvailable, resolveReaderPageMode } from '../utils/readerPageMode'

// Sub-components
import ReaderHUD from './reader/ReaderHUD.vue'
import ReaderMenu from './reader/ReaderMenu.vue'
import ReaderOverlayDialog from './reader/ReaderOverlayDialog.vue'
import StylePanel from './reader/panels/StylePanel.vue'
import TOCPanel from './reader/panels/TOCPanel.vue'
import SearchPanel from './reader/panels/SearchPanel.vue'
import RulesPanel from './reader/panels/RulesPanel.vue'
import AutoPagePanel from './reader/panels/AutoPagePanel.vue'
import TTSPanel from './reader/panels/TTSPanel.vue'
import OptionsPanel from './reader/panels/OptionsPanel.vue'
import BookmarksPanel from './reader/panels/BookmarksPanel.vue'
import PageSliceView from './reader/PageSliceView.vue'
import PageFlipOuterBook from './reader/PageFlipOuterBook.vue'
import type { PageLine, PageSlice, PagingTarget } from '../types/pagination'
import type { BookSearchResult, ReaderBook, ReaderChapter } from '../types/entities'

type ReaderPanelKey = 'toc' | 'search' | 'bookmarks' | 'rules' | 'styling' | 'autopage' | 'tts' | 'readerOptions'

interface ReaderPanelLaunchOrigin {
  x: number
  y: number
}

type TextSelectionHandle = 'start' | 'end'

interface ReaderCustomTextSelection {
  pageIndex: number
  startOffset: number
  endOffset: number
}

interface ReaderSelectionRect {
  key: string
  style: CSSProperties
}

interface ReaderSelectionHandleView {
  key: TextSelectionHandle
  style: CSSProperties
}

interface ReaderSelectionBounds {
  left: number
  top: number
  right: number
  bottom: number
}

interface ReaderSelectionLineEntry {
  line: PageLine
  element: HTMLElement
  lineIndex: number
  textStart: number
  textEnd: number
  rect: DOMRect
}

const props = defineProps<{ bookId: number, isImmersive: boolean, initialBookmark?: BookmarkTarget | null }>()
const emit = defineEmits<{
  (e: 'toggle-immersive', isFull: boolean): void
  (e: 'go-back'): void
  (e: 'open-book-stats', bookId: number): void
}>()

// ---- Core data ----
const book = ref<ReaderBook | null>(null)
const chapters = ref<ReaderChapter[]>([])
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
const selectedContextBefore = ref('')
const selectedContextAfter = ref('')
const shareCardRef = ref<HTMLElement | null>(null)
const shareCardDataUrl = ref('')
const shareCardGenerating = ref(false)
const showSharePreview = ref(false)
const showSelectionMenu = ref(false)
const selectionMenuPosition = ref<ReaderPanelLaunchOrigin>({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
const selectionSearchQuery = ref('')
const selectionSearchRunKey = ref(0)
const selectionRulePattern = ref('')
const selectionRuleRunKey = ref(0)
const readerDialogOrigin = ref<ReaderPanelLaunchOrigin>({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
const bookmarkPanelVersion = ref(0)
const bookmarkStatus = ref('')
let bookmarkStatusTimer: number | null = null
interface RemoteProgressSuggestion {
  chapterIndex: number
  chapterTitle: string
  charOffset: number
  timestamp: number
  excerpt: string
}
const remoteProgressSuggestion = ref<RemoteProgressSuggestion | null>(null)
const remoteProgressChecking = ref(false)
let readerDisposed = false
const viewportSize = ref({ width: window.innerWidth, height: window.innerHeight })
const smallReaderPanels = new Set<ReaderPanelKey>(['autopage', 'tts'])
const activeReaderPanel = computed<ReaderPanelKey | null>(() => {
  if (showToc.value) return 'toc'
  if (showSearch.value) return 'search'
  if (showBookmarks.value) return 'bookmarks'
  if (showRules.value) return 'rules'
  if (showStyling.value) return 'styling'
  if (showAutoPage.value) return 'autopage'
  if (showTts.value) return 'tts'
  if (showReaderOptions.value) return 'readerOptions'
  return null
})
const readerDialogKind = computed<'small' | 'large'>(() => {
  const panel = activeReaderPanel.value
  return panel && smallReaderPanels.has(panel) ? 'small' : 'large'
})
const readerDialogTransformOrigin = computed(() => {
  const { width, height } = viewportSize.value
  const horizontal = readerDialogOrigin.value.x < width * 0.35
    ? 'left'
    : readerDialogOrigin.value.x > width * 0.65 ? 'right' : 'center'
  const vertical = readerDialogOrigin.value.y < height * 0.35
    ? 'top'
    : readerDialogOrigin.value.y > height * 0.65 ? 'bottom' : 'center'
  return `${horizontal} ${vertical}`
})
let lastFirstReadableLoggedBookId = -1

// DOM refs
const contentRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const prevContentRef = ref<HTMLElement | null>(null)
const prevContainerRef = ref<HTMLElement | null>(null)

// ---- Settings (composable) ----
const settings = useSettings()
const {
  fontSize, lineHeight, letterSpacing, fontWeight, marginX, marginTop, marginBottom,
  fontFamily, fontColor, coverColor, bgImage, blurAmount,
  textAlign, pageMode, doublePageStep,
  flipMode, flipSpeed, simulationDoublePageTurnMode, autoPageSpeed,
  ttsEngine, ttsVoice, ttsRate, highlightColor, ttsMiMoApiKey, ttsMiMoVoice,
  nextKeys, prevKeys, showKeyHints, isAlwaysOnTop,
  readingTimeTrackingEnabled, readingTimeStatsHidden,
  hudTopLeft, hudTopCenter, hudTopRight,
  hudBottomLeft, hudBottomCenter, hudBottomRight,
  hudFollowPage, hudTopMargin, hudBottomMargin,
  chapterTitleDisplay,
  readerAutoNightEnabled, readerAutoNightCustomPolicy,
  loadAllSettings, saveAllStyling, saveSetting,
  sliderMode, pIndent, pSpacing
} = settings
const doublePageAvailable = computed(() => isDoublePageAvailable(viewportSize.value.width, viewportSize.value.height))
const effectivePageMode = computed(() => resolveReaderPageMode(
  pageMode.value,
  viewportSize.value.width,
  viewportSize.value.height,
))
const nextKeyLabels = computed(() => nextKeys.value.map(formatShortcutKey).filter(Boolean))
const previousKeyLabels = computed(() => prevKeys.value.map(formatShortcutKey).filter(Boolean))

const { rules, fetchRules, applyReplacements } = useRules()
const { effectiveRefreshRate } = useDisplayRefreshRate()
const { startHUD, stopHUD, formatHUD } = useHUD()
const {
  canDownloadProgressFromWebdav,
  consumePrefetchedProgressFromWebdav,
  getApplicableProgressFromWebdav,
  uploadProgressToWebdav,
} = useSync()
type ProgressUploadContext = Parameters<typeof uploadProgressToWebdav>[0]
let deferredProgressUpload: ProgressUploadContext | null = null

const guardedUploadProgressToWebdav = async (context: ProgressUploadContext) => {
  if (remoteProgressChecking.value || remoteProgressSuggestion.value) {
    deferredProgressUpload = context
    return
  }
  await uploadProgressToWebdav(context)
}

const flushDeferredProgressUpload = async () => {
  const pending = deferredProgressUpload
  deferredProgressUpload = null
  if (pending && !readerDisposed) await uploadProgressToWebdav(pending)
}
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
  getVisibleCharCount: () => {
    const left = currentSlice.value?.charCount || 0
    const right = currentRightSlice.value?.charCount || 0
    return left + right
  },
  getReadingPositionKey: () => `${currentChapterIndex.value}:${currentPage.value}:${effectivePageMode.value}`,
})

const toggleAlwaysOnTop = () => {
  isAlwaysOnTop.value = !isAlwaysOnTop.value
  window.electronAPI.win.setAlwaysOnTop(isAlwaysOnTop.value)
  saveSetting('reader_alwaysOnTop', isAlwaysOnTop.value ? 'true' : 'false')
}

// ---- Data fetch ----
const fetchBook = async () => {
  const startedAt = perfNow()
  try {
    const b = await window.electronAPI.library.getBookSummary(props.bookId)
    if (b) {
      book.value = {
        id: b.id,
        title: b.title,
        author: b.author,
        bookType: b.bookType,
        tags: b.tags || [],
        series: b.series || '',
        seriesIndex: b.seriesIndex,
        readingStatus: b.readingStatus || 'unread',
        progressIndex: b.progressIndex,
        progressOffset: b.progressOffset,
        lastReadAt: b.lastReadAt,
        readingStatsKey: b.readingStatsKey,
        chapterCount: b.chapterCount,
      }
      currentChapterIndex.value = b.progressIndex || 0
    }
  } catch (e) { console.error(e) }
  finally { perfLog('reader:fetchBook', startedAt, `book=${props.bookId}`) }
}
const fetchChapters = async () => {
  const startedAt = perfNow()
  try {
    const r = await window.electronAPI.library.getBookChapterList(props.bookId)
    chapters.value = r as ReaderChapter[]
    if (chapters.value.length > 0) {
      currentChapterIndex.value = Math.min(Math.max(currentChapterIndex.value, 0), chapters.value.length - 1)
    } else {
      currentChapterIndex.value = 0
    }
  } catch (e) { console.error(e) }
  finally { perfLog('reader:fetchChapterList', startedAt, `book=${props.bookId} chapters=${chapters.value.length}`) }
}

const {
  ensureChapterContent,
  ensureChapterContents,
} = useChapterContentCache({
  bookId: props.bookId,
  chapters,
  currentChapterIndex,
})

// Rules are now handled by useRules

// ---- Chapter data (computed) ----
const currentChapterData = computed(() => chapters.value[currentChapterIndex.value] || null)
const hasReadableChapters = computed(() => chapters.value.some(ch => !ch.body_text_missing || ch.body_text || ch.body))

const HUD_BAR_HEIGHT = 22
const hasTopHud = computed(() => [hudTopLeft.value, hudTopCenter.value, hudTopRight.value].some((slot) => slot !== 'none'))
const hasBottomHud = computed(() => [hudBottomLeft.value, hudBottomCenter.value, hudBottomRight.value].some((slot) => slot !== 'none'))
const hudReservedTop = computed(() => hasTopHud.value ? HUD_BAR_HEIGHT + hudTopMargin.value : 0)
const hudReservedBottom = computed(() => hasBottomHud.value ? HUD_BAR_HEIGHT + hudBottomMargin.value : 0)
const layoutMarginTop = computed(() => marginTop.value + hudReservedTop.value)
const layoutMarginBottom = computed(() => marginBottom.value + hudReservedBottom.value)

// ---- Progress ----
const {
  setProgressReady,
  saveProgress,
  flushProgress,
} = useReaderProgress({
  bookId: props.bookId,
  book,
  currentChapterIndex,
  currentChapterData,
  getCurrentPage: () => pagination.currentPage.value,
  getTotalPages: () => pagination.totalPages.value,
  getPendingWebdavPos: () => pagination.pendingWebdavPos.value,
  getChapterOffset: () => getChapterOffset(),
  uploadProgressToWebdav: guardedUploadProgressToWebdav,
})

// ---- Reader Paginator (async prewarm + cache) ----
const paginator = useReaderPaginator({
  containerRef, fontSize, lineHeight, letterSpacing, fontWeight, fontFamily,
  textAlign, chapterTitleDisplay, marginX, marginTop: layoutMarginTop, marginBottom: layoutMarginBottom, pageMode: effectivePageMode, pIndent, pSpacing,
})

const {
  prewarmChapterAt,
  prewarmNearbyChapters,
} = useReaderPrewarm({
  chapters,
  currentChapterIndex,
  ensureChapterContent,
  ensureChapterContents,
  paginator,
  applyReplacements,
})

const pagesResult = computed(() => {
  if (!currentChapterData.value) return null
  const snap = paginator.capturePaginationSnapshot(currentChapterData.value.id)
  return paginator.getPagesForChapter(currentChapterData.value.id, snap.hash)
})

const currentPages = computed(() => pagesResult.value?.slices ?? [])
const currentPagesComplete = computed(() => pagesResult.value?.complete ?? false)
const currentSlice = computed(() => currentPages.value[currentPage.value] ?? null)
const currentRightSlice = computed(() => effectivePageMode.value === 'double'
  ? currentPages.value[currentPage.value + 1] ?? null
  : null
)

const readerPaperColor = computed(() => (
  readerAutoNightEnabled.value && resolvedBucket.value === 'dark' && readerAutoNightCustomPolicy.value === 'override'
    ? '#0b1320'
    : coverColor.value
))
const readerPaperImage = computed(() => (
  bgImage.value && !shouldOverrideAutoNight.value ? `url('${bgImage.value}')` : 'none'
))

// ---- Pagination (composable) ----
const pagination = usePagination({
  contentRef, containerRef, prevContentRef, prevContainerRef,
  pageMode: effectivePageMode, doublePageStep, flipMode, flipSpeed, marginX, coverColor: readerPaperColor,
  chapters, currentChapterIndex, saveProgress,
  precomputedPages: computed(() => pagesResult.value?.slices ?? null),
  precomputedPagesComplete: currentPagesComplete,
  pageCacheHit: computed(() => pagesResult.value?.isCacheHit ?? false),
  findPageForOffset: paginator.findPageForOffset,
  getPageCountForChapter: (chapterIndex: number) => {
    const ch = chapters.value[chapterIndex]
    if (!ch) return null
    const snap = paginator.capturePaginationSnapshot(ch.id)
    return paginator.getCachedPageCount(ch.id, snap.hash)
  },
  onBeforeChapterChange: (newIndex: number) => {
    prewarmChapterAt(newIndex, { mode: 'partial', targetPageIndex: 0, extraPagesAfterTarget: 2 })
  },
})
const {
  currentPage, totalPages, containerWidth, containerHeight, pendingWebdavPos,
  prevPageCount,
  suppressAnim, incomingTarget, animationState, pagingVisuals,
  flipDurationMap, progressPercent,
  recalc, calculatePages, nextPage, prevPage, slideToNextChapter, goToChapter,
  handlePointerDown: paginationPointerDown,
  handlePointerMove: paginationPointerMove,
  handlePointerUp: paginationPointerUp,
  handlePointerCancel: paginationPointerCancel,
  consumeClickAfterDrag,
} = pagination

const incomingChapterData = computed(() => {
  const target = incomingTarget.value
  return target ? chapters.value[target.chapterIndex] || null : null
})
const incomingPages = computed(() => {
  const target = incomingTarget.value
  const chapter = incomingChapterData.value
  if (!target || !chapter) return []
  if (target.chapterIndex === currentChapterIndex.value) return currentPages.value
  const snap = paginator.capturePaginationSnapshot(chapter.id)
  return paginator.getPagesForChapter(chapter.id, snap.hash).slices ?? []
})
const incomingSlice = computed(() => {
  const target = incomingTarget.value
  if (!target) return null
  return incomingPages.value[target.pageIndex] ?? null
})
const incomingRightSlice = computed(() => {
  const target = incomingTarget.value
  if (!target || effectivePageMode.value !== 'double') return null
  return incomingPages.value[target.pageIndex + 1] ?? null
})

const getCachedChapterPages = (chapterIndex: number): { slices: PageSlice[]; complete: boolean } => {
  if (chapterIndex === currentChapterIndex.value) {
    return {
      slices: currentPages.value,
      complete: currentPagesComplete.value,
    }
  }

  const chapter = chapters.value[chapterIndex]
  if (!chapter) return { slices: [], complete: false }

  const snap = paginator.capturePaginationSnapshot(chapter.id)
  const result = paginator.getPagesForChapter(chapter.id, snap.hash)
  return {
    slices: result.slices ?? [],
    complete: result.complete,
  }
}

const previousPageFlipPages = computed(() => {
  if (currentChapterIndex.value <= 0) return []
  const result = getCachedChapterPages(currentChapterIndex.value - 1)
  return result.complete ? result.slices : []
})

const nextPageFlipPages = computed(() => {
  if (!currentPagesComplete.value) return []
  if (currentChapterIndex.value >= chapters.value.length - 1) return []
  return getCachedChapterPages(currentChapterIndex.value + 1).slices
})

const pageFlipTurnMode = computed<'single' | 'outerPage' | 'spread'>(() => (
  effectivePageMode.value === 'single' ? 'single' : simulationDoublePageTurnMode.value
))
const pageFlipSimulationEnabled = computed(() => (
  flipMode.value === 'simulation'
  && (
    effectivePageMode.value === 'single'
    || (effectivePageMode.value === 'double' && (simulationDoublePageTurnMode.value === 'outerPage' || simulationDoublePageTurnMode.value === 'spread'))
  )
))
const pageFlipBookRef = ref<InstanceType<typeof PageFlipOuterBook> | null>(null)
const pageFlipBookReady = ref(false)
let pageFlipClickSuppressedUntil = 0
const { scheduleOuterPageFlip } = usePageFlipScheduler(pageFlipBookRef)

const sliderMax = computed(() => sliderMode.value === 'book' ? Math.max(0, chapters.value.length - 1) : Math.max(0, totalPages.value - 1))
const sliderValue = computed(() => sliderMode.value === 'book' ? currentChapterIndex.value : currentPage.value)

const recordReadingActivity = () => {
  readingTimeTracker.signalActivity().catch((error) => {
    console.error('Record reading activity failed:', error)
  })
}

const trackedNextPage = () => {
  recordReadingActivity()
  if (pageFlipSimulationEnabled.value) {
    if (pageFlipBookRef.value?.flipNext()) return true
    if (!currentPagesComplete.value) {
      scheduleOuterPageFlip(1, prewarmChapterAt(currentChapterIndex.value), () => {
        const nextChapterIndex = currentChapterIndex.value + 1
        if (nextChapterIndex >= chapters.value.length) return false
        scheduleOuterPageFlip(
          1,
          prewarmChapterAt(nextChapterIndex, { mode: 'partial', targetPageIndex: 0, extraPagesAfterTarget: 2 }),
          () => slideToNextChapter(),
        )
        return true
      })
      return true
    }

    const nextChapterIndex = currentChapterIndex.value + 1
    if (nextChapterIndex < chapters.value.length) {
      scheduleOuterPageFlip(
        1,
        prewarmChapterAt(nextChapterIndex, { mode: 'partial', targetPageIndex: 0, extraPagesAfterTarget: 2 }),
        () => slideToNextChapter(),
      )
      return true
    }
    return false
  }
  return nextPage()
}

const trackedPrevPage = () => {
  recordReadingActivity()
  if (pageFlipSimulationEnabled.value) {
    if (pageFlipBookRef.value?.flipPrev()) return true

    const prevChapterIndex = currentChapterIndex.value - 1
    if (prevChapterIndex >= 0) {
      scheduleOuterPageFlip(
        -1,
        prewarmChapterAt(prevChapterIndex),
        () => prevPage(),
      )
      return true
    }
    return false
  }
  return prevPage()
}

const trackedSlideToNextChapter = () => {
  recordReadingActivity()
  return slideToNextChapter()
}

const trackedGoToChapter = (idx: number, keepMenu = false) => {
  recordReadingActivity()
  goToChapter(idx, keepMenu)
}

const trackedSetCurrentPage = (page: number) => {
  recordReadingActivity()
  currentPage.value = pageFlipSimulationEnabled.value && pageFlipTurnMode.value === 'spread'
    ? Math.floor(Math.max(0, page) / 2) * 2
    : page
}

const handlePageFlip = (target: PagingTarget) => {
  recordReadingActivity()
  const safeChapterIndex = Math.max(0, Math.min(chapters.value.length - 1, target.chapterIndex))
  const targetPageIndex = pageFlipSimulationEnabled.value && pageFlipTurnMode.value === 'spread'
    ? Math.floor(Math.max(0, target.pageIndex) / 2) * 2
    : target.pageIndex
  if (safeChapterIndex === currentChapterIndex.value) {
    const currentPageCount = Math.max(1, currentPages.value.length || totalPages.value)
    currentPage.value = Math.max(0, Math.min(currentPageCount - 1, targetPageIndex))
    return
  }

  const targetPages = getCachedChapterPages(safeChapterIndex).slices
  const targetPageCount = Math.max(1, targetPages.length || targetPageIndex + 1)
  currentChapterIndex.value = safeChapterIndex
  currentPage.value = Math.max(0, Math.min(targetPageCount - 1, targetPageIndex))
  nextTick(() => {
    requestAnimationFrame(() => {
      calculatePages()
      saveProgress()
    })
  })
}

const handlePageFlipDrag = () => {
  recordReadingActivity()
  pageFlipClickSuppressedUntil = Date.now() + 500
}

const handleReaderTap = (clientX: number, clientY: number) => {
  recordReadingActivity()
  if (showMenu.value) { closeAll(); return }
  if (handleTtsClick(clientX, clientY)) return
  const w = window.innerWidth
  const h = window.innerHeight
  const isCenterCol = clientX > w / 3 && clientX < (w / 3) * 2
  const isCenterRow = clientY > h / 3 && clientY < (h / 3) * 2
  if (isCenterCol && isCenterRow) showMenu.value = true
  else if (clientX < w / 3 || (isCenterCol && clientY < h / 3)) trackedPrevPage()
  else trackedNextPage()
}

const handlePageFlipTap = (point: { clientX: number; clientY: number }) => {
  pageFlipClickSuppressedUntil = Date.now() + 120
  handleReaderTap(point.clientX, point.clientY)
}

const handlePageFlipReady = () => {
  pageFlipBookReady.value = true
}

const getChapterOffset = () => {
  const slice = currentSlice.value
  if (slice && slice.bodyStartInSlice >= 0) return slice.bodyStartInSlice
  return 0
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
  const prewarm = prewarmChapterAt(nextIndex, { mode: 'partial', targetOffset: pendingWebdavPos.value, extraPagesAfterTarget: 2 })
  if (nextIndex !== currentChapterIndex.value) {
    goToChapter(nextIndex, true)
  } else {
    prewarm.then(() => recalc())
  }
  showBookmarks.value = false
  showMenu.value = false
}

// ---- Theme (composable) ----
const theme = useTheme({
  onStyleChanged: async () => { await saveAllStyling(); recalc() },
})
const { readerBgStyle } = theme

const isAutoNightActive = computed(() => readerAutoNightEnabled.value && resolvedBucket.value === 'dark')
const shouldOverrideAutoNight = computed(() => (
  isAutoNightActive.value && readerAutoNightCustomPolicy.value === 'override'
))
const effectiveFontColor = computed(() => shouldOverrideAutoNight.value ? '#dde7ee' : fontColor.value)
const effectiveReaderBgStyle = computed(() => (
  shouldOverrideAutoNight.value
    ? { backgroundColor: '#0b1320' }
    : readerBgStyle.value
))
const readerPageBgFilter = computed(() => (
  blurAmount.value > 0 && !shouldOverrideAutoNight.value ? `blur(${blurAmount.value}px)` : 'none'
))
const readerPageBgTransform = computed(() => (
  blurAmount.value > 0 && !shouldOverrideAutoNight.value ? 'scale(1.1)' : 'none'
))
const readerPageBgScrim = computed(() => {
  const blurScrim = !!bgImage.value && blurAmount.value > 0 && !shouldOverrideAutoNight.value
  const nightScrim = isAutoNightActive.value && !shouldOverrideAutoNight.value
  if (blurScrim && nightScrim) return 'rgba(0,0,0,0.55)'
  if (blurScrim) return 'rgba(0,0,0,0.4)'
  if (nightScrim) return 'rgba(0,0,0,0.25)'
  return 'transparent'
})

const readerPageMetrics = computed(() => computeReaderPageMetrics({
  containerWidth: containerWidth.value || containerRef.value?.clientWidth || window.innerWidth,
  containerHeight: containerHeight.value || containerRef.value?.clientHeight || window.innerHeight,
  pageMode: effectivePageMode.value,
  marginX: marginX.value,
  marginTop: layoutMarginTop.value,
  marginBottom: layoutMarginBottom.value,
  fontSize: fontSize.value,
  lineHeight: lineHeight.value,
}))

const pageContainerStyle = computed<CSSProperties>(() => ({
  padding: `${readerPageMetrics.value.gridPaddingTop}px 0 ${readerPageMetrics.value.gridPaddingBottom}px`,
  '--reader-page-width': `${readerPageMetrics.value.pageWidth}px`,
  '--reader-margin-x': `${readerPageMetrics.value.effectiveMarginX}px`,
  '--reader-content-column-width': `${readerPageMetrics.value.contentColumnWidth}px`,
  '--reader-line-px': `${readerPageMetrics.value.lineHeightPx}px`,
  '--reader-page-grid-height': `${readerPageMetrics.value.pageGridHeight}px`,
  '--p-indent': `${pIndent.value}em`,
  '--p-spacing': `${pSpacing.value}em`,
} as CSSProperties))

const textStyle = computed(() => ({
  fontFamily: fontFamily.value, fontSize: fontSize.value + 'px',
  lineHeight: `${readerPageMetrics.value.lineHeightPx}px`, letterSpacing: letterSpacing.value + 'em',
  fontWeight: String(fontWeight.value), color: effectiveFontColor.value,
  textAlign: textAlign.value as any,
}))

const pageSpreadStyle = computed<CSSProperties>(() => ({
  ...textStyle.value,
  display: 'grid',
  gridTemplateColumns: effectivePageMode.value === 'double'
    ? `${readerPageMetrics.value.pageWidth}px ${readerPageMetrics.value.pageWidth}px`
    : `${readerPageMetrics.value.pageWidth}px`,
  width: effectivePageMode.value === 'double'
    ? `${readerPageMetrics.value.pageWidth * 2}px`
    : `${readerPageMetrics.value.pageWidth}px`,
  height: `${readerPageMetrics.value.pageGridHeight}px`,
} as CSSProperties))

const readerPageHeight = computed(() => (
  readerPageMetrics.value.pageGridHeight
  + readerPageMetrics.value.gridPaddingTop
  + readerPageMetrics.value.gridPaddingBottom
))

const pageFlipBookKey = computed(() => [
  currentChapterData.value?.id ?? 'none',
  currentPages.value.length,
  currentPagesComplete.value ? 'complete' : 'partial',
  chapters.value[currentChapterIndex.value - 1]?.id ?? 'no-prev',
  previousPageFlipPages.value.length,
  chapters.value[currentChapterIndex.value + 1]?.id ?? 'no-next',
  nextPageFlipPages.value.length,
  pageFlipTurnMode.value,
  doublePageStep.value,
  Math.round(readerPageMetrics.value.pageWidth),
  Math.round(readerPageHeight.value),
  Math.round(readerPageMetrics.value.pageGridHeight),
  Math.round(readerPageMetrics.value.gridPaddingTop),
  Math.round(readerPageMetrics.value.gridPaddingBottom),
  fontSize.value,
  lineHeight.value,
  letterSpacing.value,
  fontFamily.value,
  fontWeight.value,
  textAlign.value,
  marginX.value,
  pIndent.value,
  pSpacing.value,
  readerPaperColor.value,
  readerPaperImage.value,
  readerPageBgFilter.value,
  readerPageBgTransform.value,
  readerPageBgScrim.value,
].join('|'))

watch([pageFlipSimulationEnabled, pageFlipBookKey], () => {
  pageFlipBookReady.value = false
}, { flush: 'sync' })

// HUD logic handled by useHUD
const calculateHudProgress = (chapterIndex: number, pageIndex: number, pageCount: number) => {
  if (chapters.value.length === 0) return 0
  const chapterWeight = 100 / chapters.value.length
  const safePageCount = Math.max(1, pageCount)
  const safePage = Math.min(Math.max(pageIndex, 0), safePageCount - 1)
  const inChapter = ((safePage + 1) / safePageCount) * chapterWeight
  return Math.min(100, Math.round(chapterIndex * chapterWeight + inChapter))
}

const pageCountForHud = (chapterIndex: number, fallback: number) => {
  if (chapterIndex === currentChapterIndex.value) return totalPages.value
  if (chapterIndex === currentChapterIndex.value - 1) return prevPageCount.value

  const chapter = chapters.value[chapterIndex]
  if (!chapter) return Math.max(1, fallback)
  const snap = paginator.capturePaginationSnapshot(chapter.id)
  return paginator.getCachedPageCount(chapter.id, snap.hash) ?? Math.max(1, fallback)
}

const hudPropsFor = (chapterIndex: number, pageIndex: number, pageCount: number) => {
  const chapter = chapters.value[chapterIndex] || null
  const safePageCount = Math.max(1, pageCount)
  const safePage = Math.min(Math.max(pageIndex, 0), safePageCount - 1)
  const context = {
    bookTitle: book.value?.title,
    chapterTitle: chapter?.title,
    isFirstPage: safePage === 0,
    currentPage: safePage,
    totalPages: safePageCount,
    currentChapterIndex: chapterIndex,
    totalChapters: chapters.value.length,
    progressPercent: calculateHudProgress(chapterIndex, safePage, safePageCount),
  }

  return {
    topLeft: formatHUD(hudTopLeft.value, context),
    topCenter: formatHUD(hudTopCenter.value, context),
    topRight: formatHUD(hudTopRight.value, context),
    bottomLeft: formatHUD(hudBottomLeft.value, context),
    bottomCenter: formatHUD(hudBottomCenter.value, context),
    bottomRight: formatHUD(hudBottomRight.value, context),
    topMargin: hudTopMargin.value,
    bottomMargin: hudBottomMargin.value,
  }
}

const spreadHudEnabled = computed(() => pageFlipSimulationEnabled.value && pageFlipTurnMode.value === 'spread')
const spreadHudPage = (pageIndex: number) => Math.floor(Math.max(0, pageIndex) / 2)
const spreadHudPageCount = (pageCount: number) => Math.max(1, Math.ceil(Math.max(1, pageCount) / 2))
const currentHudPage = computed(() => spreadHudEnabled.value ? spreadHudPage(currentPage.value) : currentPage.value)
const currentHudPageCount = computed(() => spreadHudEnabled.value ? spreadHudPageCount(totalPages.value) : totalPages.value)
const currentHudProps = computed(() => hudPropsFor(currentChapterIndex.value, currentHudPage.value, currentHudPageCount.value))
const incomingHudProps = computed(() => {
  const target = incomingTarget.value
  if (!target) return currentHudProps.value
  const fallback = target.chapterIndex === currentChapterIndex.value ? totalPages.value : target.pageIndex + 1
  return hudPropsFor(target.chapterIndex, target.pageIndex, pageCountForHud(target.chapterIndex, fallback))
})

// ---- TTS (composable) ----
const ttsSleepDurationMs = ref(0)
const getFollowingSentenceText = () => {
  const nextSlice = currentPages.value[currentPage.value + 1]
  if (nextSlice?.text?.trim()) return nextSlice.text
  return chapters.value[currentChapterIndex.value + 1]?.body_text || null
}
const tts = useTTS({
  contentRef, containerWidth,
  ttsEngine, ttsVoice, ttsRate, highlightColor,
  flipDurationMs: computed(() => flipDurationMap.value.ms),
  ttsMiMoApiKey, ttsMiMoVoice,
  bookTitle: computed(() => book.value?.title || ''),
  chapterTitle: computed(() => currentChapterData.value?.title || ''),
  nextPage: trackedNextPage, slideToNextChapter: trackedSlideToNextChapter,
  getFollowingSentenceText,
})
const {
  ttsActive, ttsPaused, sleepRemainingMs, edgeVoices, systemVoices,
  stopTts, pauseTts, resumeTts, setSleepTimer,
  handleTtsClick, loadVoices, injectHighlightStyles, speakText,
} = tts

const handleMissingMimoKey = () => {
  if (confirm('尚未配置小米 MiMo API Key，是否立即前往设置？')) {
    showMenu.value = true
    openPanel('tts')
    window.open('https://platform.xiaomimimo.com/#/console/api-keys', '_blank')
  }
}

const startTts = () => {
  const res = tts.startTts(ttsSleepDurationMs.value)
  if (res === 'MIMO_KEY_MISSING') handleMissingMimoKey()
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
const checkRemoteProgressInBackground = async () => {
  if (!book.value || readerDisposed) return
  let suggestionCreated = false
  try {
    const remote = await getApplicableProgressFromWebdav(book.value)
    if (!remote || readerDisposed) return
    if (remote.durChapterIndex < 0 || remote.durChapterIndex >= chapters.value.length) return
    if (isSimilarRemoteProgress(
      remote.durChapterIndex,
      remote.durChapterPos,
      currentChapterIndex.value,
      getChapterOffset(),
    )) return

    const chapter = chapters.value[remote.durChapterIndex]
    const excerpt = await window.electronAPI.library.getChapterTextExcerpt(
      props.bookId,
      chapter.id,
      remote.durChapterPos,
      64,
    )
    if (readerDisposed) return
    remoteProgressSuggestion.value = {
      chapterIndex: remote.durChapterIndex,
      chapterTitle: chapter.title || remote.durChapterTitle || `第 ${remote.durChapterIndex + 1} 章`,
      charOffset: remote.durChapterPos,
      timestamp: remote.durChapterTime,
      excerpt: excerpt || '打开后可从该章的云端位置继续阅读',
    }
    suggestionCreated = true
  } catch (e) { console.error('WebDAV download err:', e) }
  finally {
    if (!suggestionCreated && !readerDisposed) {
      remoteProgressChecking.value = false
      await flushDeferredProgressUpload()
    }
  }
}

const keepLocalProgress = async () => {
  remoteProgressSuggestion.value = null
  remoteProgressChecking.value = false
  await flushDeferredProgressUpload()
}

const jumpToRemoteProgress = async () => {
  const target = remoteProgressSuggestion.value
  if (!target) return
  remoteProgressSuggestion.value = null
  remoteProgressChecking.value = true
  deferredProgressUpload = null

  try {
    pendingWebdavPos.value = target.charOffset
    await prewarmChapterAt(target.chapterIndex, {
      mode: 'partial',
      targetOffset: target.charOffset,
      extraPagesAfterTarget: 2,
    })
    if (readerDisposed) return
    if (target.chapterIndex !== currentChapterIndex.value) goToChapter(target.chapterIndex, true)
    else recalc()
    if (book.value) book.value.lastReadAt = Math.max(book.value.lastReadAt || 0, target.timestamp)
  } catch (error) {
    console.error('Jump to WebDAV progress failed:', error)
  } finally {
    remoteProgressChecking.value = false
    deferredProgressUpload = null
    if (!readerDisposed) window.setTimeout(() => saveProgress(), 160)
  }
}

// ---- Interaction ----
const closeAll = () => {
  showMenu.value = false; showStyling.value = false; showToc.value = false;
  showSearch.value = false; showRules.value = false; showAutoPage.value = false;
  showTts.value = false; showReaderOptions.value = false; showBookmarks.value = false;
  showSelectionMenu.value = false
  clearCustomTextSelection()
}
const closeActiveReaderPanel = () => {
  showStyling.value = false; showToc.value = false; showSearch.value = false;
  showRules.value = false; showAutoPage.value = false; showTts.value = false;
  showReaderOptions.value = false; showBookmarks.value = false;
}
const closeKeyHints = () => { showKeyHints.value = false }
const disableKeyHints = async () => {
  showKeyHints.value = false
  await saveSetting('hideKeyHints', 'true')
}

const isReaderChromeTarget = (target: EventTarget | null) => {
  const t = target as HTMLElement | null
  return !!t?.closest('.m-top, .m-bot, .m-info, .sty-p, .toc-p, .search-p, .rules-p, .copy-modal, .reader-options-p, .bookmark-p, .reader-overlay, .selection-menu-layer, .reader-text-selection-layer, .key-hints-overlay, .remote-progress-banner')
}

const isReaderTextTarget = (target: EventTarget | null) => {
  const t = target as HTMLElement | null
  return !!t?.closest('.page-line-body, .page-line-title, .page-line')
}

const customTextSelection = ref<ReaderCustomTextSelection | null>(null)
const customSelectionPageElement = ref<HTMLElement | null>(null)
const customSelectionDragging = ref<TextSelectionHandle | null>(null)
const selectionLayoutVersion = ref(0)

const refreshCustomSelectionLayout = () => { selectionLayoutVersion.value += 1 }

const renderedLineStart = (line: PageLine) => Math.max(line.bodyStart, line.bodyEnd - String(line.text || '').length)

const sliceBodyRange = (slice: PageSlice | null | undefined) => {
  const bodyLines = (slice?.lines || []).filter(line => line.kind === 'body' && line.bodyEnd > line.bodyStart && line.text)
  if (bodyLines.length === 0) return null
  return {
    start: renderedLineStart(bodyLines[0]),
    end: bodyLines[bodyLines.length - 1].bodyEnd,
  }
}

const getSelectionSlice = (selection = customTextSelection.value) => {
  if (!selection) return null
  return currentPages.value[selection.pageIndex] || null
}

const findSelectionPageElement = (selection = customTextSelection.value) => {
  if (!selection) return null
  const current = customSelectionPageElement.value
  if (current?.isConnected && Number(current.dataset.pageIndex) === selection.pageIndex) return current
  return document.querySelector(`.page-slice[data-page-index="${selection.pageIndex}"]`) as HTMLElement | null
}

const lineElementsForPage = (pageElement: HTMLElement) => (
  Array.from(pageElement.querySelectorAll<HTMLElement>('.page-line'))
)

const getTextNode = (element: HTMLElement) => (
  Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE) as Text | undefined
)

const lineEntriesForPage = (pageElement: HTMLElement, slice: PageSlice): ReaderSelectionLineEntry[] => {
  const elements = lineElementsForPage(pageElement)
  return slice.lines
    .map((line, lineIndex) => {
      const element = elements[lineIndex]
      if (!element || line.kind !== 'body' || line.bodyEnd <= line.bodyStart || !line.text) return null
      return {
        line,
        element,
        lineIndex,
        textStart: renderedLineStart(line),
        textEnd: line.bodyEnd,
        rect: element.getBoundingClientRect(),
      }
    })
    .filter((entry): entry is ReaderSelectionLineEntry => !!entry)
}

const getSelectionLineEntries = (selection = customTextSelection.value): ReaderSelectionLineEntry[] => {
  const slice = getSelectionSlice(selection)
  const pageElement = findSelectionPageElement(selection)
  if (!slice || !pageElement) return []
  return lineEntriesForPage(pageElement, slice)
}

const clampCharIndex = (line: PageLine, offset: number) => {
  const text = String(line.text || '')
  return Math.max(0, Math.min(text.length, offset - renderedLineStart(line)))
}

const rectForLineRange = (entry: ReaderSelectionLineEntry, fromOffset: number, toOffset: number) => {
  const text = String(entry.line.text || '')
  const node = getTextNode(entry.element)
  if (!node || !text) return []
  const nodeLength = node.data.length
  const from = Math.min(clampCharIndex(entry.line, fromOffset), nodeLength)
  const to = Math.min(clampCharIndex(entry.line, toOffset), nodeLength)
  if (to <= from) return []
  const range = document.createRange()
  range.setStart(node, from)
  range.setEnd(node, to)
  const rects = Array.from(range.getClientRects())
  range.detach()
  return rects.filter(rect => rect.width > 0.5 && rect.height > 0.5)
}

const caretPointForLineChar = (entry: ReaderSelectionLineEntry, charIndex: number) => {
  const text = String(entry.line.text || '')
  const node = getTextNode(entry.element)
  const lineRect = entry.rect
  const nodeLength = node?.data.length ?? text.length
  const index = Math.max(0, Math.min(text.length, nodeLength, charIndex))
  if (!node || !text) return { x: lineRect.left, y: lineRect.bottom }

  const range = document.createRange()
  let x = lineRect.left
  if (index <= 0) {
    range.setStart(node, 0)
    range.setEnd(node, Math.min(1, nodeLength))
    const rect = range.getBoundingClientRect()
    x = rect.width > 0 ? rect.left : lineRect.left
  } else {
    range.setStart(node, index - 1)
    range.setEnd(node, index)
    const rect = range.getBoundingClientRect()
    x = rect.width > 0 ? rect.right : lineRect.right
  }
  range.detach()
  return { x, y: lineRect.bottom }
}

const lineOffsetFromClientPoint = (entry: ReaderSelectionLineEntry, clientX: number) => {
  const text = String(entry.line.text || '')
  if (!text) return entry.textStart
  let low = 0
  let high = text.length
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    const point = caretPointForLineChar(entry, mid + 1)
    if (point.x < clientX) low = mid + 1
    else high = mid
  }
  const before = caretPointForLineChar(entry, low)
  const after = caretPointForLineChar(entry, Math.min(text.length, low + 1))
  const index = Math.abs(clientX - before.x) <= Math.abs(clientX - after.x) ? low : Math.min(text.length, low + 1)
  return entry.textStart + index
}

const charIndexFromClientPoint = (entry: ReaderSelectionLineEntry, clientX: number) => {
  const text = String(entry.line.text || '')
  const node = getTextNode(entry.element)
  const length = Math.min(text.length, node?.data.length ?? text.length)
  if (!node || length <= 0) return 0
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < length; index += 1) {
    const range = document.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + 1)
    const rect = range.getBoundingClientRect()
    range.detach()
    if (rect.width <= 0.5) continue
    if (clientX >= rect.left && clientX <= rect.right) return index
    const distance = Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right), Math.abs(clientX - (rect.left + rect.width / 2)))
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  }
  return nearestIndex
}

const isLatinWordChar = (char: string) => /[A-Za-z0-9_]/.test(char)
const isSelectionBoundaryChar = (char: string) => (
  !char
  || /\s/.test(char)
  || /[，。！？；：、,.!?;:()[\]{}<>《》“”‘’"'`~…—–\-+=*/\\|@#$%^&]/.test(char)
)

const nearestSelectableIndex = (text: string, index: number) => {
  if (!isSelectionBoundaryChar(text[index] || '')) return index
  for (let distance = 1; distance <= 3; distance += 1) {
    const right = index + distance
    if (right < text.length && !isSelectionBoundaryChar(text[right])) return right
    const left = index - distance
    if (left >= 0 && !isSelectionBoundaryChar(text[left])) return left
  }
  return -1
}

const contiguousTextRun = (text: string, index: number) => {
  let start = index
  let end = index + 1
  while (start > 0 && !isSelectionBoundaryChar(text[start - 1])) start -= 1
  while (end < text.length && !isSelectionBoundaryChar(text[end])) end += 1
  return { start, end }
}

const shortWindowAroundIndex = (runStart: number, runEnd: number, index: number, targetLength = 6) => {
  const length = Math.min(targetLength, Math.max(1, runEnd - runStart))
  const minStart = runStart
  const maxStart = Math.max(runStart, runEnd - length)
  const centered = index - Math.floor((length - 1) / 2)
  const start = Math.max(minStart, Math.min(centered, maxStart))
  return { start, end: start + length }
}

const smartInitialRangeForLine = (entry: ReaderSelectionLineEntry, clientX: number) => {
  const text = String(entry.line.text || '')
  if (!text) return null
  const rawIndex = charIndexFromClientPoint(entry, clientX)
  const index = nearestSelectableIndex(text, Math.max(0, Math.min(rawIndex, text.length - 1)))
  if (index < 0) return null

  if (isLatinWordChar(text[index])) {
    let start = index
    let end = index + 1
    while (start > 0 && isLatinWordChar(text[start - 1])) start -= 1
    while (end < text.length && isLatinWordChar(text[end])) end += 1
    return { start: entry.textStart + start, end: entry.textStart + end }
  }

  const run = contiguousTextRun(text, index)
  const window = shortWindowAroundIndex(run.start, run.end, index)
  return { start: entry.textStart + window.start, end: entry.textStart + window.end }
}

const selectionLineFromPoint = (clientY: number) => {
  const entries = getSelectionLineEntries()
  if (entries.length === 0) return null
  return entries.find(entry => clientY >= entry.rect.top && clientY <= entry.rect.bottom)
    || entries.reduce((closest, entry) => {
      const currentDistance = Math.abs(clientY - (entry.rect.top + entry.rect.height / 2))
      const closestDistance = Math.abs(clientY - (closest.rect.top + closest.rect.height / 2))
      return currentDistance < closestDistance ? entry : closest
    }, entries[0])
}

const selectedTextFromSliceRange = (slice: PageSlice, startOffset: number, endOffset: number) => (
  slice.lines
    .filter(line => line.kind === 'body' && line.bodyEnd > line.bodyStart && line.text)
    .map((line) => {
      const textStart = renderedLineStart(line)
      const textEnd = line.bodyEnd
      const from = Math.max(startOffset, textStart)
      const to = Math.min(endOffset, textEnd)
      if (to <= from) return ''
      return String(line.text || '').slice(from - textStart, to - textStart)
    })
    .join('')
    .trim()
)

const applyCustomTextSelection = () => {
  const selection = customTextSelection.value
  const slice = getSelectionSlice(selection)
  if (!selection || !slice) return false
  const range = sliceBodyRange(slice)
  if (!range) return false
  selection.startOffset = Math.max(range.start, Math.min(selection.startOffset, range.end - 1))
  selection.endOffset = Math.max(selection.startOffset + 1, Math.min(selection.endOffset, range.end))
  const text = selectedTextFromSliceRange(slice, selection.startOffset, selection.endOffset)
  if (!text) return false
  const chapterText = applyReplacements(currentChapterData.value?.body_text || '')
  const excerpt = quoteContextExcerpt(chapterText, selection.startOffset, selection.endOffset)
  selectedText.value = text
  selectedContextBefore.value = excerpt.before
  selectedContextAfter.value = excerpt.after
  refreshCustomSelectionLayout()
  return true
}

const initialCustomSelectionRange = (pageElement: HTMLElement, slice: PageSlice, clientX: number, clientY: number) => {
  const entries = lineEntriesForPage(pageElement, slice)
  if (entries.length === 0) return null
  const entry = entries.find(item => clientY >= item.rect.top && clientY <= item.rect.bottom)
    || entries.reduce((closest, item) => {
      const distance = Math.abs(clientY - (item.rect.top + item.rect.height / 2))
      const closestDistance = Math.abs(clientY - (closest.rect.top + closest.rect.height / 2))
      return distance < closestDistance ? item : closest
    }, entries[0])
  return smartInitialRangeForLine(entry, clientX)
}

const startCustomTextSelection = (pageElement: HTMLElement, event: MouseEvent) => {
  const pageIndex = Number(pageElement.dataset.pageIndex || currentPage.value)
  const slice = currentPages.value[pageIndex]
  if (!slice) return false
  const range = initialCustomSelectionRange(pageElement, slice, event.clientX, event.clientY)
  if (!range || range.end <= range.start) return false
  customSelectionPageElement.value = pageElement
  customTextSelection.value = { pageIndex, startOffset: range.start, endOffset: range.end }
  const applied = applyCustomTextSelection()
  void nextTick(() => refreshCustomSelectionLayout())
  return applied
}

const updateCustomSelectionFromPoint = (handle: TextSelectionHandle, clientX: number, clientY: number) => {
  const selection = customTextSelection.value
  const slice = getSelectionSlice(selection)
  if (!selection || !slice) return
  const range = sliceBodyRange(slice)
  const entry = selectionLineFromPoint(clientY)
  if (!range || !entry) return
  const offset = Math.max(range.start, Math.min(lineOffsetFromClientPoint(entry, clientX), range.end))
  if (handle === 'start') selection.startOffset = Math.min(offset, selection.endOffset - 1)
  else selection.endOffset = Math.max(offset, selection.startOffset + 1)
  applyCustomTextSelection()
}

const beginCustomSelectionHandleDrag = (handle: TextSelectionHandle, event: PointerEvent) => {
  customSelectionDragging.value = handle
  try {
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  } catch (_) {}
  updateCustomSelectionFromPoint(handle, event.clientX, event.clientY)
}

const dragCustomSelectionHandle = (event: PointerEvent) => {
  const handle = customSelectionDragging.value
  if (!handle) return
  updateCustomSelectionFromPoint(handle, event.clientX, event.clientY)
}

const endCustomSelectionHandleDrag = (event: PointerEvent) => {
  try {
    ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
  } catch (_) {}
  customSelectionDragging.value = null
}

const clearCustomTextSelection = () => {
  customTextSelection.value = null
  customSelectionPageElement.value = null
  customSelectionDragging.value = null
}

const customSelectionRects = computed<ReaderSelectionRect[]>(() => {
  selectionLayoutVersion.value
  const selection = customTextSelection.value
  if (!selection) return []
  const entries = getSelectionLineEntries(selection)
  const rects: ReaderSelectionRect[] = []
  entries.forEach((entry) => {
    const from = Math.max(selection.startOffset, entry.textStart)
    const to = Math.min(selection.endOffset, entry.textEnd)
    rectForLineRange(entry, from, to).forEach((rect, rectIndex) => {
      rects.push({
        key: `${entry.line.key}-${rectIndex}`,
        style: {
          left: `${rect.left}px`,
          top: `${entry.rect.top}px`,
          width: `${rect.width}px`,
          height: `${entry.rect.height}px`,
        },
      })
    })
  })
  return rects
})

const customSelectionHandles = computed<ReaderSelectionHandleView[]>(() => {
  selectionLayoutVersion.value
  const selection = customTextSelection.value
  if (!selection) return []
  const entries = getSelectionLineEntries(selection)
  const pointForOffset = (offset: number, isEnd: boolean) => {
    const entry = entries.find((item) => (
      isEnd
        ? offset > item.textStart && offset <= item.textEnd
        : offset >= item.textStart && offset <= item.textEnd
    )) || (isEnd ? entries[entries.length - 1] : entries[0])
    if (!entry) return null
    return caretPointForLineChar(entry, clampCharIndex(entry.line, offset))
  }
  const start = pointForOffset(selection.startOffset, false)
  const end = pointForOffset(selection.endOffset, true)
  const handles: ReaderSelectionHandleView[] = []
  if (start) handles.push({ key: 'start', style: { left: `${start.x}px`, top: `${start.y}px` } })
  if (end) handles.push({ key: 'end', style: { left: `${end.x}px`, top: `${end.y}px` } })
  return handles
})

const cssPx = (value: unknown) => Number.parseFloat(String(value ?? '0')) || 0
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const customSelectionBounds = computed<ReaderSelectionBounds | null>(() => {
  const rects = customSelectionRects.value
  const handles = customSelectionHandles.value
  if (rects.length === 0 && handles.length === 0) return null
  const bounds: ReaderSelectionBounds = {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  }
  const include = (left: number, top: number, right: number, bottom: number) => {
    bounds.left = Math.min(bounds.left, left)
    bounds.top = Math.min(bounds.top, top)
    bounds.right = Math.max(bounds.right, right)
    bounds.bottom = Math.max(bounds.bottom, bottom)
  }
  rects.forEach((rect) => {
    const left = cssPx(rect.style.left)
    const top = cssPx(rect.style.top)
    include(left, top, left + cssPx(rect.style.width), top + cssPx(rect.style.height))
  })
  handles.forEach((handle) => {
    const x = cssPx(handle.style.left)
    const y = cssPx(handle.style.top)
    include(x - 24, y - 24, x + 24, y + 44)
  })
  if (!Number.isFinite(bounds.left) || !Number.isFinite(bounds.top)) return null
  return bounds
})

const rectsOverlap = (a: ReaderSelectionBounds, b: ReaderSelectionBounds) => (
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
)

const inflateBounds = (bounds: ReaderSelectionBounds, amount: number): ReaderSelectionBounds => ({
  left: bounds.left - amount,
  top: bounds.top - amount,
  right: bounds.right + amount,
  bottom: bounds.bottom + amount,
})

const selectionMenuStyle = computed<CSSProperties>(() => {
  const viewport = viewportSize.value
  const margin = 14
  const edge = 16
  const menuWidth = Math.min(328, Math.max(240, viewport.width - edge * 2))
  const menuHeight = 112
  const safeMaxLeft = Math.max(edge, viewport.width - menuWidth - edge)
  const safeMaxTop = Math.max(edge, viewport.height - menuHeight - edge)
  const anchor = selectionMenuPosition.value
  const fallbackTop = anchor.y > viewport.height * 0.54 ? anchor.y - menuHeight - margin : anchor.y + margin

  const toStyle = (left: number, top: number, origin: string): CSSProperties => ({
    left: `${clampNumber(left, edge, safeMaxLeft)}px`,
    top: `${clampNumber(top, edge, safeMaxTop)}px`,
    width: `${menuWidth}px`,
    transform: 'none',
    transformOrigin: origin,
  })

  const bounds = customSelectionBounds.value
  if (!bounds) {
    return toStyle(anchor.x - menuWidth / 2, fallbackTop, anchor.y > viewport.height * 0.54 ? 'center bottom' : 'center top')
  }

  const avoid = inflateBounds(bounds, 10)
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2
  const candidates = [
    { left: centerX - menuWidth / 2, top: bounds.top - menuHeight - margin, origin: 'center bottom' },
    { left: centerX - menuWidth / 2, top: bounds.bottom + margin, origin: 'center top' },
    { left: bounds.right + margin, top: centerY - menuHeight / 2, origin: 'left center' },
    { left: bounds.left - menuWidth - margin, top: centerY - menuHeight / 2, origin: 'right center' },
  ]

  for (const candidate of candidates) {
    const left = clampNumber(candidate.left, edge, safeMaxLeft)
    const top = clampNumber(candidate.top, edge, safeMaxTop)
    const rect = { left, top, right: left + menuWidth, bottom: top + menuHeight }
    if (!rectsOverlap(rect, avoid)) return toStyle(left, top, candidate.origin)
  }

  const spaces = [
    { value: bounds.top - edge, left: centerX - menuWidth / 2, top: edge, origin: 'center bottom' },
    { value: viewport.height - bounds.bottom - edge, left: centerX - menuWidth / 2, top: viewport.height - menuHeight - edge, origin: 'center top' },
    { value: viewport.width - bounds.right - edge, left: bounds.right + margin, top: centerY - menuHeight / 2, origin: 'left center' },
    { value: bounds.left - edge, left: bounds.left - menuWidth - margin, top: centerY - menuHeight / 2, origin: 'right center' },
  ].sort((a, b) => b.value - a.value)
  const best = spaces[0]
  return toStyle(best.left, best.top, best.origin)
})

const handleClick = (e: MouseEvent) => {
  if (consumeClickAfterDrag()) return
  if (showSelectionMenu.value) {
    showSelectionMenu.value = false
    clearCustomTextSelection()
    return
  }
  if (isReaderChromeTarget(e.target)) return
  if (pageFlipSimulationEnabled.value && Date.now() < pageFlipClickSuppressedUntil) return
  handleReaderTap(e.clientX, e.clientY)
}

const handlePointerDown = (e: PointerEvent) => {
  if (pageFlipSimulationEnabled.value) return
  if (showMenu.value || showSelectionMenu.value || isReaderChromeTarget(e.target)) return
  recordReadingActivity()
  paginationPointerDown(e)
}
const handlePointerMove = (e: PointerEvent) => {
  if (pageFlipSimulationEnabled.value) return
  if (showMenu.value) return
  paginationPointerMove(e)
}
const handlePointerUp = (e: PointerEvent) => {
  if (pageFlipSimulationEnabled.value) return
  paginationPointerUp(e)
}
const handlePointerCancel = (e: PointerEvent) => {
  if (pageFlipSimulationEnabled.value) return
  paginationPointerCancel(e)
}
const setBookmarkStatus = (message: string) => {
  bookmarkStatus.value = message
  if (bookmarkStatusTimer !== null) window.clearTimeout(bookmarkStatusTimer)
  bookmarkStatusTimer = window.setTimeout(() => {
    bookmarkStatus.value = ''
    bookmarkStatusTimer = null
  }, 1800)
}

const handleContextMenu = (e: MouseEvent) => {
  if (showMenu.value) return
  const target = e.target as HTMLElement
  const pageElement = target.closest('.page-slice') as HTMLElement | null
  if (!pageElement || !isReaderTextTarget(target)) return
  const captured = startCustomTextSelection(pageElement, e)
  if (!captured || !selectedText.value.trim()) return
  closeActiveReaderPanel()
  showCopyModal.value = false
  showSharePreview.value = false
  selectionMenuPosition.value = { x: e.clientX, y: e.clientY }
  readerDialogOrigin.value = { x: e.clientX, y: e.clientY }
  showSelectionMenu.value = true
}

const updateTtsSleepTimer = (durationMs: number) => {
  ttsSleepDurationMs.value = durationMs
  if (ttsActive.value) setSleepTimer(durationMs)
}
const copyToClipboard = () => { navigator.clipboard.writeText(selectedText.value); showCopyModal.value = false; setBookmarkStatus('已复制') }

const closeSelectionMenu = () => {
  showSelectionMenu.value = false
  clearCustomTextSelection()
}

const copySelectedText = async () => {
  if (!selectedText.value.trim()) return
  await navigator.clipboard.writeText(selectedText.value)
  closeSelectionMenu()
  setBookmarkStatus('已复制')
}

const editSelectedText = () => {
  closeSelectionMenu()
  readerDialogOrigin.value = selectionMenuPosition.value
  showCopyModal.value = true
}

const shareSelectedText = () => {
  closeSelectionMenu()
  readerDialogOrigin.value = selectionMenuPosition.value
  void generateShareCard()
}

const searchSelectedText = () => {
  const query = selectedText.value.trim()
  if (!query) return
  selectionSearchQuery.value = query
  selectionSearchRunKey.value += 1
  closeSelectionMenu()
  openPanel('search', selectionMenuPosition.value, true)
}

const replaceSelectedText = () => {
  const pattern = selectedText.value.trim()
  if (!pattern) return
  selectionRulePattern.value = pattern
  selectionRuleRunKey.value += 1
  closeSelectionMenu()
  openPanel('rules', selectionMenuPosition.value, true)
}

const speakSelectedText = () => {
  const text = selectedText.value.trim()
  if (!text) return
  closeSelectionMenu()
  const res = speakText(text)
  if (res === 'MIMO_KEY_MISSING') handleMissingMimoKey()
}

const quoteFontSize = computed(() => {
  const length = selectedText.value.length
  if (length > 900) return 34
  if (length > 600) return 40
  if (length > 360) return 46
  return 56
})

const generateShareCard = async () => {
  if (!selectedText.value.trim()) return
  showSelectionMenu.value = false
  shareCardGenerating.value = true
  try {
    await nextTick()
    if (!shareCardRef.value) throw new Error('分享卡尚未就绪')
    const { toPng } = await import('html-to-image')
    shareCardDataUrl.value = await toPng(shareCardRef.value, {
      width: 1080,
      pixelRatio: 1,
      cacheBust: true,
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--app-surface').trim() || '#f9fbfd',
    })
    showCopyModal.value = false
    showSharePreview.value = true
  } catch (error) {
    alert(`生成分享卡失败: ${(error as Error).message}`)
  } finally {
    shareCardGenerating.value = false
  }
}

const copyShareCard = async () => {
  if (!shareCardDataUrl.value) return
  await window.electronAPI.clipboard.writeImage(shareCardDataUrl.value)
  bookmarkStatus.value = '分享图片已复制'
  window.setTimeout(() => { bookmarkStatus.value = '' }, 1800)
}

const saveShareCard = async () => {
  if (!shareCardDataUrl.value) return
  await window.electronAPI.dialog.saveBinaryFile({
    defaultPath: 'PacilRead-引用分享.png',
    dataUrl: shareCardDataUrl.value,
    filters: [{ name: 'PNG 图片', extensions: ['png'] }],
  })
}
const handleWheel = (e: WheelEvent) => {
  if (showCopyModal.value || showSharePreview.value) return
  if (showMenu.value) return
  if (Math.abs(e.deltaY) < 10) return
  e.preventDefault()
  recordReadingActivity()
  if (e.deltaY > 0) trackedNextPage()
  else trackedPrevPage()
}

const isEditableKeyTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return !!element?.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')
}

const shouldBlockReaderShortcuts = (target: EventTarget | null) => (
  showMenu.value
  || showSelectionMenu.value
  || showSharePreview.value
  || showCopyModal.value
  || !!activeReaderPanel.value
  || customSelectionDragging.value !== null
  || isEditableKeyTarget(target)
)

const handleKeydown = (e: KeyboardEvent) => {
  const k = e.key
  if (k === 'Escape') {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
    if (showSelectionMenu.value) { showSelectionMenu.value = false; return }
    if (showSharePreview.value) { showSharePreview.value = false; return }
    if (showCopyModal.value) { showCopyModal.value = false; return }
    if (activeReaderPanel.value) { closeActiveReaderPanel(); return }
    if (props.isImmersive) { toggleImmersiveMode(); return }
    if (showMenu.value) { closeAll(); return }
    if (ttsActive.value) { stopTts(); return }
    if (autoPageActive.value) { stopAutoPage(); return }
    handleGoBack(); return
  }
  if (e.defaultPrevented || shouldBlockReaderShortcuts(e.target)) return
  const eventKeys = shortcutEventKeys(e)
  if (eventKeys.some(key => nextKeys.value.includes(key))) { e.preventDefault(); trackedNextPage() }
  else if (eventKeys.some(key => prevKeys.value.includes(key))) { e.preventDefault(); trackedPrevPage() }
}
const toggleImmersiveMode = () => {
  emit('toggle-immersive', !props.isImmersive)
  if (props.isImmersive) { setTimeout(recalc, 400); setTimeout(recalc, 800) }
}
const handleGoBack = async () => {
  try {
    remoteProgressSuggestion.value = null
    remoteProgressChecking.value = false
    deferredProgressUpload = null
    await readingTimeTracker.stop()
    await flushProgress()
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

const openPanel = (panel: string, origin?: ReaderPanelLaunchOrigin, preserveSeed = false) => {
  const key = panel as ReaderPanelKey
  const shouldOpen = activeReaderPanel.value !== key
  readerDialogOrigin.value = origin || { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  showSelectionMenu.value = false
  if (!preserveSeed) {
    if (panel === 'search') {
      selectionSearchQuery.value = ''
      selectionSearchRunKey.value = 0
    } else if (panel === 'rules') {
      selectionRulePattern.value = ''
      selectionRuleRunKey.value = 0
    }
  }
  showToc.value = shouldOpen && panel === 'toc'
  showStyling.value = shouldOpen && panel === 'styling'
  showSearch.value = shouldOpen && panel === 'search'
  showRules.value = shouldOpen && panel === 'rules'
  showAutoPage.value = shouldOpen && panel === 'autopage'
  showTts.value = shouldOpen && panel === 'tts'
  showReaderOptions.value = shouldOpen && panel === 'readerOptions'
  showBookmarks.value = shouldOpen && panel === 'bookmarks'
}

const jumpToSearchResult = (result: BookSearchResult) => {
  recordReadingActivity()
  const nextIndex = Math.max(0, Math.min(chapters.value.length - 1, result.chapterIndex))
  pendingWebdavPos.value = Math.max(0, result.charOffset)
  const prewarm = prewarmChapterAt(nextIndex, {
    mode: 'partial',
    targetOffset: pendingWebdavPos.value,
    extraPagesAfterTarget: 2,
  })
  if (nextIndex !== currentChapterIndex.value) goToChapter(nextIndex, true)
  else prewarm.then(() => recalc())
}

const handleWindowBlur = () => {
  flushProgress().catch((error) => {
    console.error('Flush progress on blur failed:', error)
  })
  readingTimeTracker.flush().catch((error) => {
    console.error('Flush reading stats on blur failed:', error)
  })
}

const handleVisibilityChange = () => {
  if (!document.hidden) return
  flushProgress().catch((error) => {
    console.error('Flush progress on visibility change failed:', error)
  })
  readingTimeTracker.flush().catch((error) => {
    console.error('Flush reading stats on visibility change failed:', error)
  })
}

let paginationLayoutRun = 0
const refreshPaginationLayout = () => {
  const runId = ++paginationLayoutRun
  const targetOffset = pendingWebdavPos.value >= 0 ? pendingWebdavPos.value : undefined
  paginator.clearCache()
  prewarmChapterAt(currentChapterIndex.value, {
    mode: 'partial',
    targetPageIndex: targetOffset === undefined ? currentPage.value : undefined,
    targetOffset,
    extraPagesAfterTarget: 2,
  })
    .then(() => {
      if (runId !== paginationLayoutRun || readerDisposed) return
      recalc()
      prewarmChapterAt(currentChapterIndex.value)
    })
  prewarmNearbyChapters()
}
const styleLayoutScheduler = createThrottledTask(refreshPaginationLayout, 100)
const resizeLayoutScheduler = createThrottledTask(refreshPaginationLayout, 120)
let viewportResizeInProgress = false
const handleResize = () => {
  if (pendingWebdavPos.value < 0) pendingWebdavPos.value = getChapterOffset()
  viewportResizeInProgress = true
  viewportSize.value = { width: window.innerWidth, height: window.innerHeight }
  viewportResizeInProgress = false
  refreshCustomSelectionLayout()
  resizeLayoutScheduler.schedule()
}

watch(effectivePageMode, (mode, previousMode) => {
  if (mode === previousMode) return
  pendingWebdavPos.value = getChapterOffset()
  if (!viewportResizeInProgress) styleLayoutScheduler.schedule()
}, { flush: 'sync' })

watch(currentChapterIndex, (index) => {
  flushProgress().catch((error) => console.error('Flush progress on chapter change failed:', error))
  prewarmChapterAt(index, { mode: 'partial', targetPageIndex: currentPage.value, extraPagesAfterTarget: 2 })
    .then(() => {
      recalc()
      prewarmChapterAt(index)
    })
  prewarmNearbyChapters()
})
watch([
  fontSize, lineHeight, letterSpacing, marginX, marginTop, marginBottom, fontFamily, fontWeight,
  textAlign, doublePageStep, pIndent, pSpacing, chapterTitleDisplay,
  hudTopMargin, hudBottomMargin, hudTopLeft, hudTopCenter, hudTopRight, hudBottomLeft, hudBottomCenter, hudBottomRight,
], () => {
  styleLayoutScheduler.schedule()
})
watch([pageFlipSimulationEnabled, pageFlipTurnMode, currentPage], () => {
  if (!pageFlipSimulationEnabled.value || pageFlipTurnMode.value !== 'spread') return
  const normalized = Math.floor(Math.max(0, currentPage.value) / 2) * 2
  if (currentPage.value !== normalized) currentPage.value = normalized
})
watch(currentPage, () => saveProgress())
watch([currentPage, currentChapterIndex], () => {
  showSelectionMenu.value = false
  clearCustomTextSelection()
})

// ---- Lifecycle ----
onMounted(async () => {
  const openedAt = perfNow()
  window.electronAPI.win.setControlsVisible(false)
  await loadAllSettings()
  await fetchBook()
  await fetchChapters()
  await fetchRules(props.bookId)
  startHUD()
  const prefetchedProgress = !props.initialBookmark && book.value
    ? consumePrefetchedProgressFromWebdav(book.value)
    : null
  const prefetchedRemote = prefetchedProgress?.payload ?? null
  let appliedPrefetchedProgress = false
  if (props.initialBookmark && chapters.value.length > 0) {
    const targetIndex = chapters.value.findIndex((chapter) => chapter.order_index === props.initialBookmark?.chapterOrderIndex)
    currentChapterIndex.value = targetIndex >= 0
      ? targetIndex
      : Math.min(Math.max(props.initialBookmark.chapterOrderIndex, 0), chapters.value.length - 1)
    pendingWebdavPos.value = Math.max(0, props.initialBookmark.chapterOffset)
    currentPage.value = 0
  } else if (
    prefetchedProgress
    && prefetchedRemote
    && book.value
    && chapters.value.length > 0
    && prefetchedRemote.durChapterIndex < chapters.value.length
    && shouldUsePrefetchedProgress(prefetchedRemote, book.value, prefetchedProgress.appliedToLocal)
  ) {
    const targetIndex = prefetchedRemote.durChapterIndex
    currentChapterIndex.value = targetIndex
    pendingWebdavPos.value = Math.max(0, prefetchedRemote.durChapterPos)
    currentPage.value = 0
    book.value.progressIndex = targetIndex
    book.value.progressOffset = 0
    book.value.lastReadAt = Math.max(book.value.lastReadAt || 0, prefetchedRemote.durChapterTime)
    appliedPrefetchedProgress = true
  } else if (book.value) {
    currentPage.value = book.value.progressOffset || 0
  }
  const shouldCheckRemoteProgress = !props.initialBookmark
    && !appliedPrefetchedProgress
    && !!book.value
    && chapters.value.length > 0
    && canDownloadProgressFromWebdav()
  remoteProgressChecking.value = shouldCheckRemoteProgress
  setProgressReady(true)
  await ensureChapterContent(currentChapterIndex.value)
  await prewarmChapterAt(currentChapterIndex.value, {
    mode: 'partial',
    targetPageIndex: currentPage.value,
    targetOffset: pendingWebdavPos.value >= 0 ? pendingWebdavPos.value : undefined,
    extraPagesAfterTarget: 2,
  })
  await readingTimeTracker.start()
  loading.value = false
  await nextTick()
  requestAnimationFrame(() => {
    calculatePages()
    if (lastFirstReadableLoggedBookId !== props.bookId) {
      lastFirstReadableLoggedBookId = props.bookId
      perfLog('reader:firstReadablePage', openedAt, `book=${props.bookId}`)
    }
    prewarmNearbyChapters()
    prewarmChapterAt(currentChapterIndex.value)
    if (appliedPrefetchedProgress) window.setTimeout(() => saveProgress(), 160)
    if (shouldCheckRemoteProgress) void checkRemoteProgressInBackground()
  })
  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeydown, true)
  window.addEventListener('blur', handleWindowBlur)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  loadVoices()
  injectHighlightStyles()
})
onUnmounted(async () => {
  styleLayoutScheduler.cancel()
  resizeLayoutScheduler.cancel()
  readerDisposed = true
  remoteProgressSuggestion.value = null
  remoteProgressChecking.value = false
  deferredProgressUpload = null
  stopHUD()
  stopTts()
  stopAutoPage()
  await readingTimeTracker.stop()
  window.electronAPI.win.setControlsVisible(true)
  await flushProgress()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('blur', handleWindowBlur)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div class="reader-root" :style="{ 
    touchAction: showMenu ? 'auto' : 'none',
    '--dur-slide': flipDurationMap.slide,
    '--dur-cover': flipDurationMap.cover,
    '--dur-simulation': flipDurationMap.simulation,
    '--dur-scroll': flipDurationMap.scroll,
    '--p-indent': pIndent + 'em',
    '--p-spacing': pSpacing + 'em'
  }" @wheel="handleWheel" @click="handleClick" @contextmenu.prevent="handleContextMenu" @pointerdown="handlePointerDown" @pointermove="handlePointerMove" @pointerup="handlePointerUp" @pointercancel="handlePointerCancel">
    <!-- Background layer -->
    <div class="fixed inset-0 pointer-events-none transition-all duration-300 transform-gpu origin-center" 
         :style="[effectiveReaderBgStyle, { filter: blurAmount > 0 && !shouldOverrideAutoNight ? `blur(${blurAmount}px)` : 'none', transform: blurAmount > 0 && !shouldOverrideAutoNight ? 'scale(1.1)' : 'none' }]"
         :class="{ 'bg-[#0b1320]': !bgImage }">
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
              ? '本地 JSON 里保留了书籍信息，但没有对应章节内容。请先从完整备份恢复，或重新导入这本书。'
              : '当前书籍记录不存在，可能已被删除或同步数据不完整。'
            }}
          </p>
          <button @click="handleGoBack">返回书架</button>
        </div>
      </div>

      <template v-else>
      <div
        class="page-stage"
        :style="{
          '--reader-paper': readerPaperColor,
          '--reader-paper-image': readerPaperImage,
          '--reader-bg-filter': readerPageBgFilter,
          '--reader-bg-transform': readerPageBgTransform,
          '--reader-bg-scrim': readerPageBgScrim,
          backgroundColor: (bgImage || shouldOverrideAutoNight) ? 'transparent' : readerPaperColor
        }"
      >
        <PageFlipOuterBook
          v-if="pageFlipSimulationEnabled"
          :key="pageFlipBookKey"
          ref="pageFlipBookRef"
          :turn-mode="pageFlipTurnMode"
          :current-chapter-index="currentChapterIndex"
          :pages="currentPages"
          :prev-pages="previousPageFlipPages"
          :next-pages="nextPageFlipPages"
          :current-page="currentPage"
          :double-page-step="doublePageStep"
          :page-width="readerPageMetrics.pageWidth"
          :page-height="readerPageHeight"
          :page-grid-height="readerPageMetrics.pageGridHeight"
          :grid-padding-top="readerPageMetrics.gridPaddingTop"
          :grid-padding-bottom="readerPageMetrics.gridPaddingBottom"
          :margin-x="readerPageMetrics.effectiveMarginX"
          :content-column-width="readerPageMetrics.contentColumnWidth"
          :line-height-px="readerPageMetrics.lineHeightPx"
          :p-indent="pIndent"
          :p-spacing="pSpacing"
          :page-style="textStyle"
          :paper-color="readerPaperColor"
          :paper-image="readerPaperImage"
          :bg-filter="readerPageBgFilter"
          :bg-transform="readerPageBgTransform"
          :bg-scrim="readerPageBgScrim"
          :refresh-rate="effectiveRefreshRate"
          :justify="textAlign === 'justify'"
          :show-hud="!showMenu && hudFollowPage"
          :hud-props="currentHudProps"
          @flip="handlePageFlip"
          @page-drag="handlePageFlipDrag"
          @page-tap="handlePageFlipTap"
          @ready="handlePageFlipReady"
        />

        <div class="page-layer page-current" :style="pageFlipSimulationEnabled && pageFlipBookReady ? { ...pagingVisuals.current, visibility: 'hidden', pointerEvents: 'none' } : pagingVisuals.current">
          <div ref="containerRef" class="pg-ctr" :style="pageContainerStyle">
            <div
              ref="contentRef"
              class="pg-spread"
              :class="{ 'pg-cache-fade': paginator.isCacheHit.value && !suppressAnim }"
              :style="pageSpreadStyle"
            >
              <div class="pg-page-slot">
                <PageSliceView v-if="currentSlice" :slice="currentSlice" :justify="textAlign === 'justify'" />
              </div>
              <div v-if="effectivePageMode === 'double'" class="pg-page-slot">
                <PageSliceView v-if="currentRightSlice" :slice="currentRightSlice" :justify="textAlign === 'justify'" />
              </div>
            </div>
            <ReaderHUD v-if="!showMenu && hudFollowPage" v-bind="currentHudProps" />
          </div>
        </div>

        <div v-if="!pageFlipSimulationEnabled && incomingTarget && incomingChapterData" class="page-layer page-incoming" :style="pagingVisuals.incoming">
          <div class="pg-ctr" :style="pageContainerStyle">
            <div class="pg-spread" :style="pageSpreadStyle">
              <div class="pg-page-slot">
                <PageSliceView v-if="incomingSlice" :slice="incomingSlice" :justify="textAlign === 'justify'" />
              </div>
              <div v-if="effectivePageMode === 'double'" class="pg-page-slot">
                <PageSliceView v-if="incomingRightSlice" :slice="incomingRightSlice" :justify="textAlign === 'justify'" />
              </div>
            </div>
            <ReaderHUD v-if="!showMenu && hudFollowPage" v-bind="incomingHudProps" />
          </div>
        </div>

        <div v-if="animationState.active && animationState.mode === 'simulation' && !pageFlipSimulationEnabled" class="page-snapshot" :style="pagingVisuals.currentSnapshot">
          <div v-html="animationState.currentSnapshotHtml"></div>
        </div>
        <div v-if="animationState.active && animationState.mode === 'simulation' && !pageFlipSimulationEnabled" class="page-fold" :style="pagingVisuals.fold">
          <div class="page-fold-inner" :style="pagingVisuals.foldInner" v-html="animationState.currentSnapshotHtml"></div>
        </div>
        <div v-if="animationState.active && animationState.mode === 'simulation' && !pageFlipSimulationEnabled" class="page-fold-shadow" :style="pagingVisuals.shadow"></div>
        <div v-if="animationState.active && animationState.mode === 'simulation' && !pageFlipSimulationEnabled" class="page-fold-highlight" :style="pagingVisuals.highlight"></div>
      </div>

      <div v-if="customTextSelection" class="reader-text-selection-layer">
        <div
          v-for="rect in customSelectionRects"
          :key="rect.key"
          class="reader-text-selection-mark"
          :style="rect.style"
        ></div>
        <button
          v-for="handle in customSelectionHandles"
          :key="handle.key"
          type="button"
          class="reader-text-selection-handle"
          :class="`reader-text-selection-handle-${handle.key}`"
          :style="handle.style"
          :aria-label="handle.key === 'start' ? '调整选择起点' : '调整选择终点'"
          @pointerdown.stop.prevent="beginCustomSelectionHandleDrag(handle.key, $event)"
          @pointermove.stop.prevent="dragCustomSelectionHandle"
          @pointerup.stop.prevent="endCustomSelectionHandleDrag"
          @pointercancel.stop.prevent="endCustomSelectionHandleDrag"
          @click.stop.prevent
          @contextmenu.prevent.stop
        ></button>
      </div>

      <!-- Key Hints -->
      <Transition name="fade">
        <div
          v-if="showKeyHints"
          class="key-hints-overlay absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          @click.stop
          @pointerdown.stop
          @pointermove.stop
          @pointerup.stop
          @pointercancel.stop
          @wheel.stop
          @contextmenu.prevent.stop
        >
          <div class="glass-dark p-8 rounded-3xl w-full max-w-md shadow-2xl border border-white/10 animate-scale-up">
            <h3 class="text-2xl font-bold mb-6 flex items-center gap-3">⌨️ 快捷键指南</h3>
            <div class="space-y-4 mb-8">
              <div class="flex items-center justify-between gap-4 p-3 glass rounded-xl"><span class="text-slate-300 shrink-0">上一页</span><div class="flex flex-wrap justify-end gap-1"><kbd v-for="key in previousKeyLabels" :key="key" class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">{{ key }}</kbd></div></div>
              <div class="flex items-center justify-between gap-4 p-3 glass rounded-xl"><span class="text-slate-300 shrink-0">下一页</span><div class="flex flex-wrap justify-end gap-1"><kbd v-for="key in nextKeyLabels" :key="key" class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">{{ key }}</kbd></div></div>
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

      <ReaderHUD v-if="!showMenu && !hudFollowPage" v-bind="currentHudProps" />

      <Transition name="fade">
        <div v-if="bookmarkStatus" class="bookmark-toast">
          {{ bookmarkStatus }}
        </div>
      </Transition>

      <Transition name="remote-progress">
        <div
          v-if="remoteProgressSuggestion"
          class="remote-progress-banner"
          role="status"
          aria-live="polite"
          @click.stop
          @pointerdown.stop
          @wheel.stop.prevent
          @contextmenu.stop
        >
          <div class="remote-progress-copy">
            <strong>云端进度 · {{ remoteProgressSuggestion.chapterTitle }}</strong>
            <small>大约读到：{{ remoteProgressSuggestion.excerpt }}</small>
          </div>
          <div class="remote-progress-actions">
            <button type="button" @click.stop="keepLocalProgress">留在这里</button>
            <button type="button" class="remote-progress-jump" @click.stop="jumpToRemoteProgress">跳转</button>
          </div>
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
        />
      </Transition>

      <ReaderOverlayDialog
        :open="!!activeReaderPanel"
        :kind="readerDialogKind"
        :origin="readerDialogTransformOrigin"
        @close="closeActiveReaderPanel"
      >
        <Transition name="reader-panel-content" mode="out-in">
          <SearchPanel
            v-if="showSearch"
            key="search"
            :book-id="props.bookId"
            :chapters="chapters"
            :initial-query="selectionSearchQuery"
            :auto-run-key="selectionSearchRunKey"
            @close="showSearch=false"
            @jump="(result) => { jumpToSearchResult(result); showSearch=false; showMenu=false; }"
          />
          <TOCPanel
            v-else-if="showToc"
            key="toc"
            :chapters="chapters"
            :currentChapterIndex="currentChapterIndex"
            @close="showToc=false"
            @jump="(idx) => { trackedGoToChapter(idx, true); showToc=false; showMenu=false; }"
          />
          <BookmarksPanel
            v-else-if="showBookmarks"
            key="bookmarks"
            :book-id="props.bookId"
            :refresh-key="bookmarkPanelVersion"
            @close="showBookmarks=false"
            @jump="goToBookmarkTarget"
          />
          <RulesPanel
            v-else-if="showRules"
            key="rules"
            :rules="rules"
            :bookId="props.bookId"
            :initial-pattern="selectionRulePattern"
            :initial-pattern-key="selectionRuleRunKey"
            @close="showRules=false"
            @refresh="() => { fetchRules(props.bookId); paginator.clearCache(); recalc(); }"
          />
          <StylePanel
            v-else-if="showStyling"
            key="styling"
            :effective-page-mode="effectivePageMode"
            :double-page-available="doublePageAvailable"
            @close="showStyling=false"
          />
          <AutoPagePanel
            v-else-if="showAutoPage"
            key="autopage"
            :autoPageActive="autoPageActive"
            @close="showAutoPage=false"
            @toggle="toggleAutoPage"
          />
          <TTSPanel
            v-else-if="showTts"
            key="tts"
            :ttsActive="ttsActive"
            :ttsPaused="ttsPaused"
            :edgeVoices="edgeVoices"
            :systemVoices="systemVoices"
            :sleepDurationMs="ttsSleepDurationMs"
            :sleepRemainingMs="sleepRemainingMs"
            @close="showTts=false"
            @start="startTts"
            @pause="pauseTts"
            @resume="resumeTts"
            @stop="stopTts"
            @timer-change="updateTtsSleepTimer"
          />
          <OptionsPanel
            v-else-if="showReaderOptions"
            key="reader-options"
            :book="book"
            :effective-page-mode="effectivePageMode"
            @close="showReaderOptions=false"
            @update-book="(d) => { if(book) { book.title = d.title; book.author = d.author; } }"
          />
        </Transition>
      </ReaderOverlayDialog>

      <Transition name="selection-menu">
        <div
          v-if="showSelectionMenu"
          class="selection-menu-layer"
          @click="closeSelectionMenu"
          @contextmenu.prevent.stop="closeSelectionMenu"
          @wheel.stop
        >
          <div class="selection-action-menu" :style="selectionMenuStyle" @click.stop @contextmenu.prevent.stop>
            <button style="--d:0ms;--rd:80ms" type="button" @click="copySelectedText">复制</button>
            <button style="--d:22ms;--rd:64ms" type="button" @click="shareSelectedText">分享</button>
            <button style="--d:44ms;--rd:48ms" type="button" @click="replaceSelectedText">替换</button>
            <button style="--d:66ms;--rd:32ms" type="button" @click="searchSelectedText">搜索</button>
            <button style="--d:88ms;--rd:16ms" type="button" @click="speakSelectedText">朗读</button>
            <button style="--d:110ms;--rd:0ms" type="button" @click="editSelectedText">编辑</button>
          </div>
        </div>
      </Transition>

      <!-- Copy Modal -->
      <ReaderOverlayDialog
        :open="showCopyModal"
        kind="large"
        :origin="readerDialogTransformOrigin"
        @close="showCopyModal = false"
      >
        <div class="copy-modal reader-text-modal" @click.stop @wheel.stop>
          <div class="reader-text-modal-head">
            <h3>文字提取与复制</h3>
            <button @click="showCopyModal = false">✕</button>
          </div>
          <textarea v-model="selectedText" class="reader-text-area"></textarea>
          <div class="reader-text-modal-actions">
            <button @click="showCopyModal = false">取消</button>
            <button @click="copyToClipboard">复制全文</button>
            <button @click="generateShareCard" :disabled="shareCardGenerating">{{ shareCardGenerating ? '生成中...' : '分享' }}</button>
          </div>
        </div>
      </ReaderOverlayDialog>

      <ReaderOverlayDialog
        :open="showSharePreview"
        kind="large"
        :origin="readerDialogTransformOrigin"
        @close="showSharePreview = false"
      >
        <div class="share-preview-panel" @click.stop @wheel.stop>
          <div class="share-preview-head">
            <div><h3 class="share-preview-title">分享图片预览</h3><p class="share-preview-detail">完整图片 · 1080px 宽 PNG</p></div>
            <button @click="showSharePreview = false" class="share-preview-close">✕</button>
          </div>
          <div class="share-preview-scroll" @wheel.stop>
            <img :src="shareCardDataUrl" alt="引用分享卡预览" />
          </div>
          <div class="share-preview-actions">
            <button @click="saveShareCard" class="app-button">保存到本地</button>
            <button @click="copyShareCard" class="app-button app-button-primary">复制图片</button>
          </div>
          <button @click="showSharePreview = false" class="app-button share-preview-dismiss">关闭</button>
        </div>
      </ReaderOverlayDialog>

      <div class="quote-render-host" aria-hidden="true">
        <div ref="shareCardRef" class="quote-share-card">
          <div class="quote-mark-row"><span class="quote-accent"></span><span class="quote-mark">“</span></div>
          <div v-if="selectedContextBefore" class="quote-context">{{ selectedContextBefore }}</div>
          <div class="quote-body" :style="{ fontSize: `${quoteFontSize}px` }">{{ selectedText }}</div>
          <div v-if="selectedContextAfter" class="quote-context">{{ selectedContextAfter }}</div>
          <div class="quote-divider"></div>
          <div class="quote-source">《{{ book?.title || '未命名书籍' }}》</div>
          <div class="quote-meta">{{ [currentChapterData?.title, book?.author].filter(Boolean).join('  ·  ') }}</div>
        </div>
      </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.reader-root { position:fixed; inset:0; overflow:hidden; user-select:none; display:flex; flex-direction:column; color:white; color-scheme:only light; }
.quote-render-host { position:fixed; left:-20000px; top:0; width:1080px; pointer-events:none; }
.quote-share-card { width:1080px; box-sizing:border-box; padding:92px 96px 72px; background:var(--app-surface); color:var(--app-text); font-family:"Noto Serif SC","Source Han Serif SC","Microsoft YaHei",serif; }
.quote-mark-row { height:130px; display:flex; align-items:flex-start; gap:28px; color:var(--app-accent); }
.quote-accent { width:10px; height:104px; flex:none; background:var(--app-accent); }
.quote-mark { font:700 112px/0.9 Arial,sans-serif; }
.quote-context { color:color-mix(in srgb, var(--app-text-muted) 34%, var(--app-surface)); font-size:36px; line-height:1.32; white-space:pre-wrap; margin-bottom:34px; }
.quote-body { line-height:1.35; white-space:pre-wrap; overflow-wrap:anywhere; }
.quote-body + .quote-context { margin-top:34px; margin-bottom:0; }
.quote-divider { height:2px; margin:88px 0 42px; background:var(--app-border); }
.quote-source { color:var(--app-text-secondary); font:700 34px/1.2 var(--app-font-body,"Microsoft YaHei",sans-serif); }
.quote-meta { margin-top:24px; color:var(--app-text-muted); font:400 26px/1.2 var(--app-font-body,"Microsoft YaHei",sans-serif); }
.reader-text-selection-layer { position:fixed; inset:0; z-index:99; pointer-events:none; }
.reader-text-selection-mark { position:fixed; border-radius:4px; background:rgba(96,165,250,.28); box-shadow:inset 0 0 0 1px rgba(147,197,253,.24); mix-blend-mode:multiply; animation:reader-selection-mark-in 120ms ease-out; pointer-events:none; }
.reader-text-selection-handle { position:fixed; width:30px; height:38px; padding:0; margin:-3px 0 0 -15px; border:0; background:transparent; cursor:grab; pointer-events:auto; touch-action:none; }
.reader-text-selection-handle:active { cursor:grabbing; }
.reader-text-selection-handle::before { content:""; position:absolute; left:14px; top:-15px; width:2px; height:24px; border-radius:999px; background:#60a5fa; box-shadow:0 0 0 1px rgba(15,23,42,.36),0 2px 8px rgba(37,99,235,.28); }
.reader-text-selection-handle::after { content:""; position:absolute; left:7px; top:7px; width:16px; height:16px; border-radius:999px; background:#60a5fa; box-shadow:0 0 0 3px rgba(15,23,42,.86),0 8px 18px rgba(0,0,0,.28); }
.reader-text-selection-handle-start::before { top:-15px; }
.reader-text-selection-handle-end::before { top:-15px; }
@keyframes reader-selection-mark-in { from { opacity:0; transform:scaleY(.82); } to { opacity:1; transform:scaleY(1); } }
.selection-menu-layer { position:fixed; inset:0; z-index:98; pointer-events:none; }
.selection-action-menu { position:fixed; width:min(328px, calc(100vw - 32px)); display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; padding:10px; border:1px solid rgba(255,255,255,.12); border-radius:16px; background:rgba(15,23,42,.96); box-shadow:0 22px 58px rgba(0,0,0,.48); backdrop-filter:blur(22px) saturate(140%); -webkit-backdrop-filter:blur(22px) saturate(140%); }
.selection-action-menu,
.selection-action-menu button { pointer-events:auto; }
.selection-action-menu button { min-height:40px; border:1px solid rgba(255,255,255,.1); border-radius:10px; color:white; background:rgba(255,255,255,.075); font-size:13px; font-weight:750; cursor:pointer; opacity:0; transform:translateY(6px) scale(.98); animation:selection-action-in 180ms cubic-bezier(.16,1,.3,1) forwards; animation-delay:var(--d); }
.selection-action-menu button:hover { border-color:rgba(96,165,250,.5); background:rgba(59,130,246,.22); }
.selection-menu-enter-active,.selection-menu-leave-active { transition:opacity 150ms ease; }
.selection-menu-enter-from,.selection-menu-leave-to { opacity:0; }
.selection-menu-leave-active .selection-action-menu button { animation:selection-action-out 110ms ease forwards; animation-delay:var(--rd); }
@keyframes selection-action-in { to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes selection-action-out { to { opacity:0; transform:translateY(4px) scale(.98); } }
.reader-text-modal { height:100%; display:flex; flex-direction:column; gap:16px; padding:22px; color:#f8fafc; }
.reader-text-modal-head { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.reader-text-modal-head h3 { margin:0; color:#f8fafc; font-size:18px; font-weight:800; }
.reader-text-modal-head button,.reader-text-modal-actions button { border:1px solid rgba(255,255,255,.1); border-radius:10px; color:#e2e8f0; background:rgba(255,255,255,.07); cursor:pointer; }
.reader-text-modal-head button { width:34px; height:34px; }
.reader-text-area { flex:1; min-height:180px; resize:none; user-select:text; color:#e2e8f0; background:rgba(15,23,42,.62); border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:14px; outline:none; line-height:1.7; }
.reader-text-area:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.18); }
.reader-text-modal-actions { display:flex; justify-content:flex-end; gap:10px; }
.reader-text-modal-actions button { min-height:40px; padding:0 16px; font-weight:750; }
.reader-text-modal-actions button:last-child { border-color:#3b82f6; color:white; background:#2563eb; }
.reader-text-modal-actions button:disabled { opacity:.55; cursor:default; }
.share-preview-panel { height:100%; min-height:0; padding:22px; display:flex; flex-direction:column; gap:16px; color:#f8fafc; }
.share-preview-head { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.share-preview-title { margin:0; color:#f8fafc; font-size:20px; font-weight:800; }
.share-preview-detail { margin:4px 0 0; color:rgba(226,232,240,.5); font-size:12px; }
.share-preview-close { width:34px; height:34px; border:1px solid rgba(255,255,255,.1); border-radius:10px; color:rgba(226,232,240,.65); background:rgba(255,255,255,.07); cursor:pointer; }
.share-preview-close:hover { color:var(--app-text); }
.share-preview-scroll { flex:1; min-height:0; overflow:auto; padding:12px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1); border-radius:14px; overscroll-behavior:contain; }
.share-preview-scroll img { width:100%; height:auto; border-radius:10px; }
.share-preview-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.share-preview-actions .app-button,.share-preview-dismiss { min-height:48px; justify-content:center; }
.bookmark-toast { position:absolute; left:50%; top:86px; transform:translateX(-50%); z-index:70; padding:8px 14px; border-radius:999px; background:rgba(15,23,42,0.9); border:1px solid rgba(255,255,255,0.12); color:white; font-size:13px; font-weight:700; box-shadow:0 12px 32px rgba(0,0,0,0.35); backdrop-filter:blur(16px); }
.remote-progress-banner { position:absolute; z-index:80; top:16px; left:50%; width:min(780px,calc(100% - 32px)); min-height:68px; transform:translateX(-50%); box-sizing:border-box; display:flex; align-items:center; gap:18px; padding:12px 14px 12px 18px; border:1px solid var(--app-border); border-radius:var(--app-radius-card); color:var(--app-text); background:color-mix(in srgb,var(--app-surface) 92%,transparent); box-shadow:var(--app-shadow-hover); backdrop-filter:blur(18px); user-select:none; }
.remote-progress-copy { min-width:0; flex:1; display:flex; flex-direction:column; gap:5px; }
.remote-progress-copy strong { overflow:hidden; color:var(--app-text); font-size:14px; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
.remote-progress-copy small { display:-webkit-box; overflow:hidden; color:var(--app-text-muted); font-size:12px; line-height:1.45; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
.remote-progress-actions { flex:none; display:flex; align-items:center; gap:8px; }
.remote-progress-actions button { min-width:76px; height:36px; padding:0 13px; border:1px solid var(--app-border); border-radius:10px; color:var(--app-text-secondary); background:var(--app-surface-secondary); font-size:13px; font-weight:700; cursor:pointer; }
.remote-progress-actions button:hover { color:var(--app-text); background:var(--app-surface-hover); }
.remote-progress-actions .remote-progress-jump { border-color:color-mix(in srgb,var(--app-accent) 70%,transparent); color:white; background:var(--app-accent); }
.remote-progress-actions .remote-progress-jump:hover { background:var(--app-accent-hover); }
.remote-progress-enter-active,.remote-progress-leave-active { transition:opacity .2s ease,transform .24s cubic-bezier(.16,1,.3,1); }
.remote-progress-enter-from,.remote-progress-leave-to { opacity:0; transform:translate(-50%,-12px); }
@media (max-width:640px) {
  .remote-progress-banner { align-items:flex-start; gap:10px; padding:12px; }
  .remote-progress-actions { flex-direction:column-reverse; }
  .remote-progress-actions button { min-width:70px; height:32px; padding:0 10px; }
}
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

.page-stage { position:absolute; inset:0; z-index:1; overflow:hidden; contain:layout paint; }
.page-layer,
.page-snapshot,
.page-fold,
.page-fold-shadow,
.page-fold-highlight { position:absolute; inset:0; overflow:hidden; pointer-events:none; will-change:transform, clip-path, opacity; backface-visibility:hidden; transform-style:preserve-3d; }
.page-layer,
.page-snapshot { background-color:var(--reader-paper, #f7f2e6); }
.page-layer::before,
.page-snapshot::before { content:""; position:absolute; inset:0; z-index:0; background-color:var(--reader-paper, #f7f2e6); background-image:var(--reader-paper-image, none); background-size:cover; background-position:center; filter:var(--reader-bg-filter, none); transform:var(--reader-bg-transform, none); transform-origin:center; pointer-events:none; }
.page-layer::after,
.page-snapshot::after { content:""; position:absolute; inset:0; z-index:0; background:var(--reader-bg-scrim, transparent); pointer-events:none; }
.page-layer > .pg-ctr,
.page-snapshot > div { position:relative; z-index:1; }
.page-current { z-index:3; pointer-events:auto; }
.page-incoming { z-index:2; }
.page-snapshot :deep(.pg-ctr),
.page-fold-inner :deep(.pg-ctr) { width:100vw; height:100vh; }
.page-fold { background-color:var(--reader-paper, #f7f2e6); background-image:var(--reader-paper-image, none); background-size:cover; background-position:center; box-shadow:-10px 0 18px rgba(0,0,0,0.12), inset 8px 0 14px rgba(255,255,255,0.14); }
.page-fold::before { content:""; position:absolute; inset:0; z-index:0; background-color:var(--reader-paper, #f7f2e6); background-image:var(--reader-paper-image, none); background-size:cover; background-position:center; pointer-events:none; }
.page-fold::after { content:""; position:absolute; inset:0; z-index:2; background:linear-gradient(to right, rgba(255,255,255,0.16), rgba(0,0,0,0.025) 52%, rgba(0,0,0,0.055)); pointer-events:none; }
.page-fold-inner { position:absolute; inset:0; z-index:1; overflow:hidden; background-color:var(--reader-paper, #f7f2e6); background-image:var(--reader-paper-image, none); background-size:cover; background-position:center; }
.page-fold-shadow { top:0; bottom:0; left:0; right:auto; background:linear-gradient(to right, transparent, rgba(0,0,0,0.14), transparent); }
.page-fold-highlight { top:0; bottom:0; left:0; right:auto; background:linear-gradient(to right, transparent, rgba(255,255,255,0.18), transparent); mix-blend-mode:screen; }
.pg-ctr { width:100%; height:100%; overflow:hidden; box-sizing:border-box; --reader-line-px:1.8em; --reader-page-grid-height:100%; }
.pg-spread { height:var(--reader-page-grid-height); line-height:var(--reader-line-px); }
.pg-page-slot { width:var(--reader-page-width); height:var(--reader-page-grid-height); padding:0 var(--reader-margin-x); box-sizing:border-box; overflow:hidden; }
.pg-cache-fade { animation: paginator-fade-in 0.1s ease-out; }
@keyframes paginator-fade-in { from { opacity: 0.85; } to { opacity: 1; } }
/* kbd style */
.kbd { padding: 0.25rem 0.5rem; background-color: rgba(255, 255, 255, 0.1); border-radius: 0.5rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); border: 1px solid rgba(255, 255, 255, 0.05); font-size: 0.875rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

.fade-enter-active,.fade-leave-active { transition:opacity .25s ease; }
.fade-enter-from,.fade-leave-to { opacity:0; }
.sf-enter-active,.sf-leave-active { transition:all .3s ease; }
.sf-enter-from { opacity:0; transform:translateY(12px); }
.sf-leave-to { opacity:0; transform:translateY(12px); }

.reader-panel-content-enter-active,.reader-panel-content-leave-active { transition:opacity .14s ease; }
.reader-panel-content-enter-from,.reader-panel-content-leave-to { opacity:0; }

.menu-slide-enter-active, .menu-slide-leave-active { transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-slide-enter-active :deep(.m-top),
.menu-slide-leave-active :deep(.m-top),
.menu-slide-enter-active :deep(.m-bottom-stack),
.menu-slide-leave-active :deep(.m-bottom-stack) { transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-slide-enter-from, .menu-slide-leave-to { opacity: 0; }
.menu-slide-enter-from :deep(.m-top), .menu-slide-leave-to :deep(.m-top) { opacity:0; transform:translateY(-10px); }
.menu-slide-enter-from :deep(.m-bottom-stack), .menu-slide-leave-to :deep(.m-bottom-stack) { opacity:0; transform:translateY(14px); }
@media (prefers-reduced-motion: reduce) {
  .sf-enter-active,.sf-leave-active,
  .reader-panel-content-enter-active,.reader-panel-content-leave-active,
  .selection-menu-enter-active,.selection-menu-leave-active,
  .menu-slide-enter-active,.menu-slide-leave-active,
  .menu-slide-enter-active :deep(.m-top),
  .menu-slide-leave-active :deep(.m-top),
  .menu-slide-enter-active :deep(.m-bottom-stack),
  .menu-slide-leave-active :deep(.m-bottom-stack) { transition-duration:80ms; }
  .sf-enter-from,.sf-leave-to,
  .menu-slide-enter-from :deep(.m-top),
  .menu-slide-leave-to :deep(.m-top),
  .menu-slide-enter-from :deep(.m-bottom-stack),
  .menu-slide-leave-to :deep(.m-bottom-stack) { transform:none; }
  .selection-action-menu button { animation:none; opacity:1; transform:none; }
}
</style>
