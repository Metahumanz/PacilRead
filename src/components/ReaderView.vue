<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted, nextTick, type CSSProperties } from 'vue'
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
import { useDisplayRefreshRate } from '../composables/useDisplayRefreshRate'
import { createBookmark, type BookmarkTarget } from '../composables/useBookmarks'
import { computeReaderPageMetrics } from '../utils/readerLayout'
import { perfLog, perfNow } from '../utils/perf'

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
import PageSliceView from './reader/PageSliceView.vue'
import PageFlipOuterBook from './reader/PageFlipOuterBook.vue'
import type { PageSlice, PagingTarget } from '../types/pagination'

interface Chapter {
  id: number
  title: string
  body?: string
  body_text?: string
  order_index: number
  body_text_storage?: string
  body_text_missing?: number
  body_text_fallback?: string | null
  body_text_size?: number
  body_text_loaded?: boolean
}
interface Book { id: number; title: string; author: string | null; bookType: string; progressIndex: number; progressOffset: number; lastReadAt: number; readingStatsKey: string }

interface ChapterContentPayload {
  id: number
  title: string
  order_index: number
  body: string
  body_text: string
  body_text_storage: string
  body_text_missing: number
  body_text_fallback: string | null
  body_text_size?: number
}

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

const CHAPTER_CONTENT_CACHE_MAX_ENTRIES = 12
const CHAPTER_CONTENT_CACHE_MAX_BYTES = 32 * 1024 * 1024
const chapterContentCache = new Map<number, ChapterContentPayload & { estimatedBytes: number }>()
const pendingChapterContentLoads = new Map<number, Promise<Chapter | null>>()
let chapterContentCacheBytes = 0
let progressSaveTimer: number | null = null
let lastFirstReadableLoggedBookId = -1
let readerProgressReady = false

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
  webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
  hudTopLeft, hudTopCenter, hudTopRight,
  hudBottomLeft, hudBottomCenter, hudBottomRight,
  hudFollowPage, hudTopMargin, hudBottomMargin,
  chapterTitleDisplay,
  readerAutoNightEnabled, readerAutoNightCustomPolicy,
  loadAllSettings, saveAllStyling, saveSetting,
  sliderMode, pIndent, pSpacing
} = settings

const { rules, fetchRules, applyReplacements } = useRules()
const { effectiveRefreshRate } = useDisplayRefreshRate()
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
  const startedAt = perfNow()
  try {
    const b = await window.electronAPI.library.getBookSummary(props.bookId)
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
  finally { perfLog('reader:fetchBook', startedAt, `book=${props.bookId}`) }
}
const fetchChapters = async () => {
  const startedAt = perfNow()
  try {
    const r = await window.electronAPI.library.getBookChapterList(props.bookId)
    chapters.value = r as Chapter[]
    if (chapters.value.length > 0) {
      currentChapterIndex.value = Math.min(Math.max(currentChapterIndex.value, 0), chapters.value.length - 1)
    } else {
      currentChapterIndex.value = 0
    }
  } catch (e) { console.error(e) }
  finally { perfLog('reader:fetchChapterList', startedAt, `book=${props.bookId} chapters=${chapters.value.length}`) }
}

const estimateChapterPayloadBytes = (content: ChapterContentPayload) => (
  content.body_text_size && content.body_text_size > 0
    ? content.body_text_size
    : (content.body_text?.length || 0) * 2 + (content.body?.length || 0) * 2
)

const clearChapterInlineContent = (chapterId: number) => {
  const idx = chapters.value.findIndex((chapter) => chapter.id === chapterId)
  if (idx < 0) return
  const chapter = chapters.value[idx]
  chapters.value[idx] = {
    ...chapter,
    body: '',
    body_text: '',
    body_text_loaded: false,
  }
}

const pruneChapterContentCache = () => {
  const protectedIds = new Set<number>()
  for (const index of [currentChapterIndex.value - 1, currentChapterIndex.value, currentChapterIndex.value + 1]) {
    const chapter = chapters.value[index]
    if (chapter) protectedIds.add(chapter.id)
  }

  while (
    chapterContentCache.size > CHAPTER_CONTENT_CACHE_MAX_ENTRIES
    || chapterContentCacheBytes > CHAPTER_CONTENT_CACHE_MAX_BYTES
  ) {
    const victim = Array.from(chapterContentCache.keys()).find((id) => !protectedIds.has(id))
    if (victim === undefined) break
    const removed = chapterContentCache.get(victim)
    if (removed) chapterContentCacheBytes -= removed.estimatedBytes
    chapterContentCache.delete(victim)
    clearChapterInlineContent(victim)
  }
}

const mergeChapterContent = (content: ChapterContentPayload): Chapter | null => {
  const idx = chapters.value.findIndex((chapter) => chapter.id === content.id)
  if (idx < 0) return null
  const estimatedBytes = estimateChapterPayloadBytes(content)
  const previous = chapterContentCache.get(content.id)
  if (previous) chapterContentCacheBytes -= previous.estimatedBytes
  chapterContentCache.set(content.id, { ...content, estimatedBytes })
  chapterContentCacheBytes += estimatedBytes

  const chapter = {
    ...chapters.value[idx],
    ...content,
    body_text_loaded: true,
  }
  chapters.value[idx] = chapter
  pruneChapterContentCache()
  return chapter
}

const ensureChapterContent = async (chapterIndex: number): Promise<Chapter | null> => {
  const chapter = chapters.value[chapterIndex]
  if (!chapter) return null
  if (chapter.body_text_loaded && chapter.body_text !== undefined && chapter.body !== undefined) return chapter

  const cached = chapterContentCache.get(chapter.id)
  if (cached) return mergeChapterContent(cached)

  const pending = pendingChapterContentLoads.get(chapter.id)
  if (pending) return pending

  const startedAt = perfNow()
  const loadPromise = window.electronAPI.library
    .getChapterContentBatch(props.bookId, [chapter.id])
    .then((items) => {
      const item = (items as ChapterContentPayload[])[0]
      return item ? mergeChapterContent(item) : null
    })
    .catch((error) => {
      console.error('Load chapter content failed:', error)
      return null
    })
    .finally(() => {
      pendingChapterContentLoads.delete(chapter.id)
      perfLog('reader:loadChapterContent', startedAt, `chapter=${chapter.id}`)
    })
  pendingChapterContentLoads.set(chapter.id, loadPromise)
  return loadPromise
}

const ensureChapterContents = async (chapterIndexes: number[]): Promise<void> => {
  const unique = Array.from(new Set(chapterIndexes))
    .map((index) => chapters.value[index])
    .filter(Boolean)
  const missing = unique.filter((chapter) => (
    !chapter.body_text_loaded
    && !chapterContentCache.has(chapter.id)
    && !pendingChapterContentLoads.has(chapter.id)
  ))
  if (missing.length === 0) return

  const startedAt = perfNow()
  const ids = missing.map((chapter) => chapter.id)
  const batchPromise = window.electronAPI.library
    .getChapterContentBatch(props.bookId, ids)
    .then((items) => {
      for (const item of items as ChapterContentPayload[]) {
        mergeChapterContent(item)
      }
    })
    .catch((error) => {
      console.error('Load chapter content batch failed:', error)
    })
    .finally(() => {
      for (const id of ids) pendingChapterContentLoads.delete(id)
      perfLog('reader:loadChapterContentBatch', startedAt, `count=${ids.length}`)
    })

  for (const chapter of missing) {
    pendingChapterContentLoads.set(
      chapter.id,
      batchPromise.then(() => chapters.value.find((item) => item.id === chapter.id) || null),
    )
  }
  await batchPromise
}

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
const persistProgressNow = async () => {
  if (progressSaveTimer) {
    window.clearTimeout(progressSaveTimer)
    progressSaveTimer = null
  }
  if (!book.value) return
  if (!readerProgressReady) return
  const startedAt = perfNow()
  try {
    await window.electronAPI.library.updateBook(props.bookId, {
      progressIndex: currentChapterIndex.value,
      progressOffset: pagination.currentPage.value,
      lastReadAt: Date.now(),
      currentChapterTitle: currentChapterData.value?.title || '',
    })
    
    uploadProgressToWebdav({
      bookId: props.bookId,
      title: book.value.title,
      author: book.value.author || '',
      currentChapterIndex: currentChapterIndex.value,
      currentChapterTitle: currentChapterData.value?.title || '',
      currentChapterBodyLength: currentChapterData.value?.body_text?.length || 0,
      currentChapterOffset: getChapterOffset(),
      currentPage: pagination.currentPage.value,
      totalPages: pagination.totalPages.value,
      pendingWebdavPos: pagination.pendingWebdavPos.value
    })
  } catch (e) { console.error(e) }
  finally { perfLog('reader:saveProgress', startedAt, `book=${props.bookId}`) }
}

const saveProgress = () => {
  if (progressSaveTimer) window.clearTimeout(progressSaveTimer)
  progressSaveTimer = window.setTimeout(() => {
    persistProgressNow().catch((error) => console.error('Persist progress failed:', error))
  }, 400)
}

const flushProgress = async () => {
  await persistProgressNow()
}

// ---- Reader Paginator (async prewarm + cache) ----
const paginator = useReaderPaginator({
  containerRef, fontSize, lineHeight, letterSpacing, fontWeight, fontFamily,
  textAlign, chapterTitleDisplay, marginX, marginTop: layoutMarginTop, marginBottom: layoutMarginBottom, pageMode, pIndent, pSpacing,
})

const prewarmChapterAt = async (index: number, options: {
  mode?: 'partial' | 'full'
  targetPageIndex?: number
  targetOffset?: number
  extraPagesAfterTarget?: number
} = {}) => {
  const loaded = await ensureChapterContent(index)
  if (!loaded) return null
  const ch = chapters.value[index]
  if (!ch) return Promise.resolve(null)
  const snap = paginator.capturePaginationSnapshot(ch.id)
  const body = applyReplacements(ch.body || '')
  const startedAt = perfNow()
  const result = await paginator.prewarmChapterText(
    ch.id,
    body,
    ch.body_text || '',
    ch.title,
    snap,
    options,
  )
  perfLog('reader:paginateChapter', startedAt, `chapter=${ch.id} complete=${result?.complete ? '1' : '0'} pages=${result?.slices.length || 0}`)
  return result
}

const prewarmNearbyChapters = () => {
  ensureChapterContents([currentChapterIndex.value - 1, currentChapterIndex.value + 1]).then(() => {
    prewarmChapterAt(currentChapterIndex.value - 1)
    prewarmChapterAt(currentChapterIndex.value + 1)
  })
}

const pagesResult = computed(() => {
  if (!currentChapterData.value) return null
  const snap = paginator.capturePaginationSnapshot(currentChapterData.value.id)
  return paginator.getPagesForChapter(currentChapterData.value.id, snap.hash)
})

const currentPages = computed(() => pagesResult.value?.slices ?? [])
const currentPagesComplete = computed(() => pagesResult.value?.complete ?? false)
const currentSlice = computed(() => currentPages.value[currentPage.value] ?? null)
const currentRightSlice = computed(() => pageMode.value === 'double'
  ? currentPages.value[currentPage.value + 1] ?? null
  : null
)

const readerPaperColor = computed(() => (
  readerAutoNightEnabled.value && resolvedBucket.value === 'dark' && readerAutoNightCustomPolicy.value === 'override'
    ? '#0f172a'
    : coverColor.value
))
const readerPaperImage = computed(() => (
  bgImage.value && !shouldOverrideAutoNight.value ? `url('${bgImage.value}')` : 'none'
))

// ---- Pagination (composable) ----
const pagination = usePagination({
  contentRef, containerRef, prevContentRef, prevContainerRef,
  pageMode, doublePageStep, flipMode, flipSpeed, marginX, coverColor: readerPaperColor,
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
  if (!target || pageMode.value !== 'double') return null
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
  pageMode.value === 'single' ? 'single' : simulationDoublePageTurnMode.value
))
const pageFlipSimulationEnabled = computed(() => (
  flipMode.value === 'simulation'
  && (
    pageMode.value === 'single'
    || (pageMode.value === 'double' && (simulationDoublePageTurnMode.value === 'outerPage' || simulationDoublePageTurnMode.value === 'spread'))
  )
))
const pageFlipBookRef = ref<InstanceType<typeof PageFlipOuterBook> | null>(null)
const pageFlipBookReady = ref(false)
let pageFlipClickSuppressedUntil = 0

const scheduleOuterPageFlip = (
  direction: 1 | -1,
  prepare: Promise<unknown>,
  fallback?: () => boolean | void,
) => {
  prepare
    .then(() => {
      nextTick(() => {
        requestAnimationFrame(() => {
          const flipped = direction > 0
            ? pageFlipBookRef.value?.flipNext()
            : pageFlipBookRef.value?.flipPrev()
          if (!flipped) fallback?.()
        })
      })
    })
    .catch((error) => {
      console.error('Prepare outer page flip failed:', error)
      fallback?.()
    })
}

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
const effectiveFontColor = computed(() => shouldOverrideAutoNight.value ? '#e2e8f0' : fontColor.value)
const effectiveReaderBgStyle = computed(() => (
  shouldOverrideAutoNight.value
    ? { backgroundColor: '#0f172a' }
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
  pageMode: pageMode.value,
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
  gridTemplateColumns: pageMode.value === 'double'
    ? `${readerPageMetrics.value.pageWidth}px ${readerPageMetrics.value.pageWidth}px`
    : `${readerPageMetrics.value.pageWidth}px`,
  width: pageMode.value === 'double'
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
          await prewarmChapterAt(remote.durChapterIndex, {
            mode: 'partial',
            targetOffset: pendingWebdavPos.value,
            extraPagesAfterTarget: 2,
          })
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
const disableKeyHints = async () => {
  showKeyHints.value = false
  await saveSetting('hideKeyHints', 'true')
}

const isReaderChromeTarget = (target: EventTarget | null) => {
  const t = target as HTMLElement | null
  return !!t?.closest('.m-top, .m-bot, .m-info, .sty-p, .toc-p, .search-p, .rules-p, .copy-modal, .reader-options-p, .bookmark-p, .key-hints-overlay')
}

const handleClick = (e: MouseEvent) => {
  if (consumeClickAfterDrag()) return
  if (isReaderChromeTarget(e.target)) return
  if (pageFlipSimulationEnabled.value && Date.now() < pageFlipClickSuppressedUntil) return
  handleReaderTap(e.clientX, e.clientY)
}

const handlePointerDown = (e: PointerEvent) => {
  if (pageFlipSimulationEnabled.value) return
  if (showMenu.value || isReaderChromeTarget(e.target)) return
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
const handleContextMenu = (e: MouseEvent) => {
  if (showMenu.value) return
  const t = e.target as HTMLElement; const p = t.closest('.page-slice') || t.closest('.page-line')
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

const handleResize = () => {
  paginator.clearCache()
  prewarmChapterAt(currentChapterIndex.value, { mode: 'partial', targetPageIndex: currentPage.value, extraPagesAfterTarget: 2 })
    .then(() => {
      recalc()
      prewarmChapterAt(currentChapterIndex.value)
    })
  prewarmNearbyChapters()
}

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
  textAlign, pageMode, doublePageStep, pIndent, pSpacing, chapterTitleDisplay,
  hudTopMargin, hudBottomMargin, hudTopLeft, hudTopCenter, hudTopRight, hudBottomLeft, hudBottomCenter, hudBottomRight,
], () => {
  paginator.clearCache()
  prewarmChapterAt(currentChapterIndex.value, { mode: 'partial', targetPageIndex: currentPage.value, extraPagesAfterTarget: 2 })
    .then(() => {
      recalc()
      prewarmChapterAt(currentChapterIndex.value)
    })
  prewarmNearbyChapters()
})
watch([pageFlipSimulationEnabled, pageFlipTurnMode, currentPage], () => {
  if (!pageFlipSimulationEnabled.value || pageFlipTurnMode.value !== 'spread') return
  const normalized = Math.floor(Math.max(0, currentPage.value) / 2) * 2
  if (currentPage.value !== normalized) currentPage.value = normalized
})
watch(currentPage, () => saveProgress())

// ---- Lifecycle ----
onMounted(async () => {
  const openedAt = perfNow()
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
  readerProgressReady = true
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
  })
  window.addEventListener('resize', handleResize)
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
  await flushProgress()
  window.removeEventListener('resize', handleResize)
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
    '--dur-simulation': flipDurationMap.simulation,
    '--dur-scroll': flipDurationMap.scroll,
    '--p-indent': pIndent + 'em',
    '--p-spacing': pSpacing + 'em'
  }" @wheel="handleWheel" @click="handleClick" @contextmenu.prevent="handleContextMenu" @pointerdown="handlePointerDown" @pointermove="handlePointerMove" @pointerup="handlePointerUp" @pointercancel="handlePointerCancel">
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
              <div v-if="pageMode === 'double'" class="pg-page-slot">
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
              <div v-if="pageMode === 'double'" class="pg-page-slot">
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

      <ReaderHUD v-if="!showMenu && !hudFollowPage" v-bind="currentHudProps" />

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
          <Transition name="sf"><SearchPanel v-if="showSearch" :book-id="props.bookId" :chapters="chapters" @close="showSearch=false" @jump="(idx) => { jumpToSearchResult(idx); showSearch=false; showMenu=false; }" /></Transition>
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

.menu-slide-enter-active, .menu-slide-leave-active { transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-slide-enter-from, .menu-slide-leave-to { opacity: 0; }
</style>
