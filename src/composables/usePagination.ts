import { ref, computed, nextTick, type Ref } from 'vue'
import type { PageSlice } from '../types/pagination'

export function usePagination(opts: {
  contentRef: Ref<HTMLElement | null>
  containerRef: Ref<HTMLElement | null>
  prevContentRef: Ref<HTMLElement | null>
  prevContainerRef: Ref<HTMLElement | null>
  pageMode: Ref<'single' | 'double'>
  doublePageStep: Ref<1 | 2>
  flipMode: Ref<'slide' | 'cover' | 'curl'>
  flipSpeed: Ref<'fast' | 'medium' | 'slow'>
  marginX: Ref<number>
  coverColor: Ref<string>
  chapters: Ref<any[]>
  currentChapterIndex: Ref<number>
  saveProgress: () => void
  precomputedPages?: Ref<PageSlice[] | null>
  pageCacheHit?: Ref<boolean>
  onBeforeChapterChange?: (newIndex: number) => void
}) {
  const currentPage = ref(0)
  const totalPages = ref(1)
  const containerWidth = ref(0)
  const pendingWebdavPos = ref(-1)

  // Carousel state
  const carouselSliding = ref(false)
  const carouselPos = ref(0)
  const prevPageCount = ref(1)
  const suppressAnim = ref(false)
  const showingCover = ref(false)
  const sweepDir = ref('left')
  const snapshotHtml = ref('')
  const showMenu = ref(false)

  let flipLock = false
  let lastFlipTime = 0
  let recalcTimer: number | null = null

  // ---- Flip duration map ----
  const flipDurationMap = computed(() => {
    if (opts.flipSpeed.value === 'fast') return { slide: '0.2s', cover: '0.25s', curl: '0.35s', ms: 300 }
    if (opts.flipSpeed.value === 'slow') return { slide: '0.6s', cover: '0.8s', curl: '1.0s', ms: 800 }
    return { slide: '0.38s', cover: '0.45s', curl: '0.55s', ms: 500 }
  })

  // ---- Page calculation ----
  const waitForStableLayout = (attempt = 0, lastWidth = -1) => {
    nextTick(() => {
      requestAnimationFrame(() => {
        const width = opts.containerRef.value?.clientWidth || 0
        if (width <= 0 && attempt < 10) {
          waitForStableLayout(attempt + 1, width)
          return
        }
        if (attempt < 6 && width !== lastWidth) {
          waitForStableLayout(attempt + 1, width)
          return
        }
        calculatePages()
      })
    })
  }

  const recalc = () => {
    if (recalcTimer) window.clearTimeout(recalcTimer)
    recalcTimer = window.setTimeout(() => waitForStableLayout(), 40)
  }

  const calculatePages = () => {
    if (!opts.containerRef.value) return

    // Use precomputed pages when available
    if (opts.precomputedPages?.value && opts.precomputedPages.value.length > 0) {
      const cw = opts.containerRef.value.clientWidth
      if (cw > 0) containerWidth.value = cw
      totalPages.value = opts.precomputedPages.value.length

      if (pendingWebdavPos.value >= 0) {
        const ch = opts.chapters.value[opts.currentChapterIndex.value]
        const L = ch?.body_text?.length || ch?.body?.length || 0
        if (L > 0) {
          currentPage.value = Math.floor((pendingWebdavPos.value / L) * totalPages.value)
        } else {
          currentPage.value = 0
        }
        pendingWebdavPos.value = -1
      }

      if (currentPage.value >= totalPages.value) currentPage.value = totalPages.value - 1
      calcPrevPages()
      return
    }

    if (!opts.contentRef.value) return
    const cw = opts.containerRef.value.clientWidth
    if (cw <= 0) return
    containerWidth.value = cw
    const pageWidth = opts.pageMode.value === 'double' ? cw / 2 : cw
    totalPages.value = Math.max(1, Math.ceil(opts.contentRef.value.scrollWidth / pageWidth))
    
    if (pendingWebdavPos.value >= 0) {
      const ch = opts.chapters.value[opts.currentChapterIndex.value]
      const L = ch?.body_text?.length || ch?.body?.length || 0
      if (L > 0) {
        currentPage.value = Math.floor((pendingWebdavPos.value / L) * totalPages.value)
      } else {
        currentPage.value = 0
      }
      pendingWebdavPos.value = -1
    }

    if (currentPage.value >= totalPages.value) currentPage.value = totalPages.value - 1
    calcPrevPages()
  }

  const calcPrevPages = () => {
    if (!opts.prevContentRef.value || !opts.prevContainerRef.value) return
    const cw = opts.prevContainerRef.value.clientWidth
    if (cw <= 0) return
    const pageWidth = opts.pageMode.value === 'double' ? cw / 2 : cw
    prevPageCount.value = Math.max(1, Math.ceil(opts.prevContentRef.value.scrollWidth / pageWidth))
  }

  // ---- Offsets ----
  const pageOffset = computed(() => {
    const cw = containerWidth.value || 0
    const pageWidth = opts.pageMode.value === 'double' ? cw / 2 : cw
    return `-${currentPage.value * pageWidth}px`
  })

  const prevPageOffset = computed(() => {
    const cw = containerWidth.value || 0
    if (cw <= 0) return '0px'
    const pageWidth = opts.pageMode.value === 'double' ? cw / 2 : cw
    return `-${Math.max(0, prevPageCount.value - 1) * pageWidth}px`
  })

  const carouselTransform = computed(() => `translateX(${-100 + carouselPos.value * -100}vw)`)

  // ---- Chapter transitions ----
  const slideToNextChapter = () => {
    if (flipLock || opts.currentChapterIndex.value >= opts.chapters.value.length - 1) return
    opts.onBeforeChapterChange?.(opts.currentChapterIndex.value + 1)
    flipLock = true
    suppressAnim.value = true
    
    if (opts.flipMode.value === 'cover' || opts.flipMode.value === 'curl') {
      if (opts.containerRef.value) snapshotHtml.value = opts.containerRef.value.outerHTML
      sweepDir.value = 'left'
      showingCover.value = true
      requestAnimationFrame(() => {
        opts.currentChapterIndex.value++
        currentPage.value = 0
        opts.saveProgress()
      })
      setTimeout(() => {
        nextTick(() => { calculatePages(); suppressAnim.value = false; showingCover.value = false; flipLock = false })
      }, 450)
    } else {
      carouselSliding.value = true
      carouselPos.value = 1
      setTimeout(() => {
        carouselSliding.value = false
        opts.currentChapterIndex.value++
        currentPage.value = 0
        carouselPos.value = 0
        opts.saveProgress()
        nextTick(() => { requestAnimationFrame(() => { calculatePages(); requestAnimationFrame(() => { suppressAnim.value = false; flipLock = false }) }) })
      }, 380)
    }
  }

  const slideToPrevChapter = () => {
    if (flipLock || opts.currentChapterIndex.value <= 0) return
    opts.onBeforeChapterChange?.(opts.currentChapterIndex.value - 1)
    flipLock = true
    suppressAnim.value = true

    const setLastPage = () => {
      calculatePages()
      const step = (opts.pageMode.value === 'double' && opts.doublePageStep.value === 2) ? 2 : 1
      currentPage.value = Math.max(0, Math.floor((totalPages.value - 1) / step) * step)
      opts.saveProgress()
    }

    if (opts.flipMode.value === 'cover' || opts.flipMode.value === 'curl') {
      if (opts.containerRef.value) snapshotHtml.value = opts.containerRef.value.outerHTML
      sweepDir.value = 'right'
      showingCover.value = true
      requestAnimationFrame(() => {
        opts.currentChapterIndex.value--
        nextTick(setLastPage)
      })
      setTimeout(() => { suppressAnim.value = false; showingCover.value = false; flipLock = false }, 450)
    } else {
      carouselSliding.value = true
      carouselPos.value = -1
      setTimeout(() => {
        carouselSliding.value = false
        opts.currentChapterIndex.value--
        carouselPos.value = 0
        nextTick(() => { requestAnimationFrame(() => { setLastPage(); requestAnimationFrame(() => { suppressAnim.value = false; flipLock = false }) }) })
      }, 380)
    }
  }

  // ---- Page flip animation wrapper ----
  const doPageFlip = (dir: 'left' | 'right', action: () => void) => {
    if (opts.flipMode.value === 'cover' || opts.flipMode.value === 'curl') {
      if (opts.containerRef.value) snapshotHtml.value = opts.containerRef.value.outerHTML
      sweepDir.value = dir === 'left' ? 'left' : 'right'
      showingCover.value = true
      flipLock = true
      suppressAnim.value = true
      
      let duration = 450
      if (opts.flipSpeed.value === 'fast') duration = 250
      else if (opts.flipSpeed.value === 'slow') duration = 700

      requestAnimationFrame(() => { action() })
      setTimeout(() => {
        showingCover.value = false
        suppressAnim.value = false
        flipLock = false
      }, duration)
    } else {
      action()
    }
  }

  // ---- Navigation ----
  const nextPage = () => {
    const now = Date.now()
    if (flipLock) {
      if (now - lastFlipTime < 150) return
      flipLock = false
    }
    lastFlipTime = now
    const step = (opts.pageMode.value === 'double' && opts.doublePageStep.value === 2) ? 2 : 1
    if (currentPage.value < totalPages.value - step) {
      doPageFlip('left', () => { currentPage.value += step })
    } else {
      slideToNextChapter()
    }
  }

  const prevPage = () => {
    const now = Date.now()
    if (flipLock) {
      if (now - lastFlipTime < 150) return
      flipLock = false
    }
    lastFlipTime = now
    const step = (opts.pageMode.value === 'double' && opts.doublePageStep.value === 2) ? 2 : 1
    if (currentPage.value >= step) {
      doPageFlip('right', () => { currentPage.value -= step })
    } else if (currentPage.value > 0) {
      doPageFlip('right', () => { currentPage.value = 0 })
    } else {
      slideToPrevChapter()
    }
  }

  const goToChapter = (idx: number, keepMenu = false) => {
    if (idx >= 0 && idx < opts.chapters.value.length && idx !== opts.currentChapterIndex.value) {
      opts.onBeforeChapterChange?.(idx)
      suppressAnim.value = true
      opts.currentChapterIndex.value = idx
      currentPage.value = 0
      opts.saveProgress()
      // If we have precomputed pages, skip the RAF layout wait
      if (opts.precomputedPages?.value && opts.precomputedPages.value.length > 0) {
        containerWidth.value = opts.containerRef.value?.clientWidth || 0
        totalPages.value = opts.precomputedPages.value.length
        nextTick(() => { requestAnimationFrame(() => { suppressAnim.value = false }) })
      } else {
        nextTick(() => { requestAnimationFrame(() => { calculatePages(); requestAnimationFrame(() => { suppressAnim.value = false }) }) })
      }
    }
    if (!keepMenu) showMenu.value = false
  }

  // ---- Progress ----
  const progressPercent = computed(() => {
    if (opts.chapters.value.length === 0) return 0
    const cw = 100 / opts.chapters.value.length
    const inC = totalPages.value > 0 ? ((currentPage.value + 1) / totalPages.value) * cw : cw
    return Math.min(100, Math.round(opts.currentChapterIndex.value * cw + inC))
  })

  return {
    currentPage, totalPages, containerWidth, pendingWebdavPos,
    carouselSliding, carouselPos, prevPageCount,
    suppressAnim, showingCover, sweepDir, snapshotHtml,
    flipDurationMap,
    pageOffset, prevPageOffset, carouselTransform,
    progressPercent,
    recalc, calculatePages,
    nextPage, prevPage,
    slideToNextChapter, slideToPrevChapter,
    goToChapter,
  }
}
