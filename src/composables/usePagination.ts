import { computed, nextTick, ref, type CSSProperties, type Ref } from 'vue'
import type {
  FlipMode,
  PageSlice,
  PagingAnimationState,
  PagingDirection,
  PagingTarget,
} from '../types/pagination'

type FlipDurationMap = {
  slide: string
  cover: string
  simulation: string
  scroll: string
  ms: number
}

interface PointerSession {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastTime: number
  velocityX: number
  candidate: boolean
  dragStarted: boolean
}

const IDLE_ANIMATION_STATE: PagingAnimationState = {
  active: false,
  phase: 'idle',
  mode: 'slide',
  direction: 1,
  progress: 0,
  touchYRatio: 0.5,
  currentSnapshotHtml: '',
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2

const clipInset = (top: number, right: number, bottom: number, left: number) =>
  `inset(${top}px ${Math.max(0, right)}px ${bottom}px ${Math.max(0, left)}px)`

export function usePagination(opts: {
  contentRef: Ref<HTMLElement | null>
  containerRef: Ref<HTMLElement | null>
  prevContentRef: Ref<HTMLElement | null>
  prevContainerRef: Ref<HTMLElement | null>
  pageMode: Ref<'single' | 'double'>
  doublePageStep: Ref<1 | 2>
  flipMode: Ref<FlipMode>
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
  const prevPageCount = ref(1)
  const suppressAnim = ref(false)

  const incomingTarget = ref<PagingTarget | null>(null)
  const animationState = ref<PagingAnimationState>({ ...IDLE_ANIMATION_STATE })

  let recalcTimer: number | null = null
  let animationFrame: number | null = null
  let pointerSession: PointerSession | null = null
  let clickSuppressed = false
  let lastFlipTime = 0

  const stageWidth = () => {
    const width = opts.containerRef.value?.clientWidth || containerWidth.value || window.innerWidth
    return Math.max(width, 1)
  }

  const stageHeight = () => {
    const height = opts.containerRef.value?.clientHeight || window.innerHeight
    return Math.max(height, 1)
  }

  const pageStep = () => (opts.pageMode.value === 'double' && opts.doublePageStep.value === 2) ? 2 : 1

  const pageWidth = computed(() => {
    const width = containerWidth.value || stageWidth()
    return opts.pageMode.value === 'double' ? width / 2 : width
  })

  const flipDurationMs = (mode: FlipMode = opts.flipMode.value) => {
    if (mode === 'none') return 0
    const base = mode === 'cover' ? 220
      : mode === 'simulation' ? 300
        : mode === 'scroll' ? 190
          : 180
    if (opts.flipSpeed.value === 'fast') return Math.round(base * 0.6)
    if (opts.flipSpeed.value === 'slow') return Math.round(base * 1.5)
    return base
  }

  const flipDurationMap = computed<FlipDurationMap>(() => ({
    slide: `${flipDurationMs('slide')}ms`,
    cover: `${flipDurationMs('cover')}ms`,
    simulation: `${flipDurationMs('simulation')}ms`,
    scroll: `${flipDurationMs('scroll')}ms`,
    ms: flipDurationMs(opts.flipMode.value),
  }))

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

    if (opts.precomputedPages?.value && opts.precomputedPages.value.length > 0) {
      const cw = opts.containerRef.value.clientWidth
      if (cw > 0) containerWidth.value = cw
      totalPages.value = opts.precomputedPages.value.length
      applyPendingWebdavPosition()
      if (currentPage.value >= totalPages.value) currentPage.value = totalPages.value - 1
      calcPrevPages()
      return
    }

    if (!opts.contentRef.value) return
    const cw = opts.containerRef.value.clientWidth
    if (cw <= 0) return
    containerWidth.value = cw
    const widthPerPage = opts.pageMode.value === 'double' ? cw / 2 : cw
    totalPages.value = Math.max(1, Math.ceil(opts.contentRef.value.scrollWidth / widthPerPage))
    applyPendingWebdavPosition()
    if (currentPage.value >= totalPages.value) currentPage.value = totalPages.value - 1
    calcPrevPages()
  }

  const applyPendingWebdavPosition = () => {
    if (pendingWebdavPos.value < 0) return
    const ch = opts.chapters.value[opts.currentChapterIndex.value]
    const len = ch?.body_text?.length || ch?.body?.length || 0
    currentPage.value = len > 0
      ? clamp(Math.floor((pendingWebdavPos.value / len) * totalPages.value), 0, totalPages.value - 1)
      : 0
    pendingWebdavPos.value = -1
  }

  const calcPrevPages = () => {
    if (!opts.prevContentRef.value || !opts.prevContainerRef.value) return
    const cw = opts.prevContainerRef.value.clientWidth
    if (cw <= 0) return
    const widthPerPage = opts.pageMode.value === 'double' ? cw / 2 : cw
    prevPageCount.value = Math.max(1, Math.ceil(opts.prevContentRef.value.scrollWidth / widthPerPage))
  }

  const pageOffset = computed(() => `-${currentPage.value * pageWidth.value}px`)

  const prevPageOffset = computed(() => {
    const lastPage = Math.max(0, prevPageCount.value - 1)
    return `-${lastPage * pageWidth.value}px`
  })

  const incomingPageOffset = computed(() => {
    const targetPage = incomingTarget.value?.pageIndex ?? 0
    return `-${targetPage * pageWidth.value}px`
  })

  const lastSpreadStart = (pageCount: number) => {
    const step = pageStep()
    return Math.max(0, Math.floor((Math.max(1, pageCount) - 1) / step) * step)
  }

  const resolveTarget = (direction: PagingDirection): PagingTarget | null => {
    const step = pageStep()
    if (direction > 0) {
      const nextPageIndex = currentPage.value + step
      if (nextPageIndex < totalPages.value) {
        return { chapterIndex: opts.currentChapterIndex.value, pageIndex: nextPageIndex }
      }
      if (opts.currentChapterIndex.value < opts.chapters.value.length - 1) {
        return { chapterIndex: opts.currentChapterIndex.value + 1, pageIndex: 0 }
      }
      return null
    }

    if (currentPage.value >= step) {
      return { chapterIndex: opts.currentChapterIndex.value, pageIndex: Math.max(0, currentPage.value - step) }
    }
    if (currentPage.value > 0) {
      return { chapterIndex: opts.currentChapterIndex.value, pageIndex: 0 }
    }
    if (opts.currentChapterIndex.value > 0) {
      return { chapterIndex: opts.currentChapterIndex.value - 1, pageIndex: lastSpreadStart(prevPageCount.value) }
    }
    return null
  }

  const captureCurrentSnapshot = () => opts.containerRef.value?.outerHTML || ''

  const cancelFrame = () => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
  }

  const clearAnimation = () => {
    cancelFrame()
    incomingTarget.value = null
    animationState.value = { ...IDLE_ANIMATION_STATE, mode: opts.flipMode.value }
    suppressAnim.value = false
    pointerSession = null
  }

  const setAnimationProgress = (progress: number, phase = animationState.value.phase) => {
    animationState.value = {
      ...animationState.value,
      active: true,
      phase,
      progress: clamp(progress, 0, 1),
    }
  }

  const beginPaging = (
    target: PagingTarget,
    direction: PagingDirection,
    phase: 'dragging' | 'settling',
    touchYRatio = 0.5,
  ) => {
    cancelFrame()
    if (target.chapterIndex !== opts.currentChapterIndex.value) {
      opts.onBeforeChapterChange?.(target.chapterIndex)
    }
    incomingTarget.value = target
    suppressAnim.value = true
    animationState.value = {
      active: true,
      phase,
      mode: opts.flipMode.value,
      direction,
      progress: 0,
      touchYRatio: clamp(touchYRatio, 0, 1),
      currentSnapshotHtml: captureCurrentSnapshot(),
    }
  }

  const completeTarget = (target: PagingTarget) => {
    const chapterChanged = target.chapterIndex !== opts.currentChapterIndex.value
    opts.currentChapterIndex.value = target.chapterIndex
    currentPage.value = target.pageIndex
    nextTick(() => {
      requestAnimationFrame(() => {
        calculatePages()
        if (currentPage.value >= totalPages.value) currentPage.value = Math.max(0, totalPages.value - 1)
        if (chapterChanged) opts.saveProgress()
        clearAnimation()
      })
    })
  }

  const animateTo = (end: number, commit: boolean) => {
    const target = incomingTarget.value
    if (!animationState.value.active || !target) {
      clearAnimation()
      return
    }

    const start = animationState.value.progress
    const mode = animationState.value.mode
    const duration = Math.max(90, Math.round(flipDurationMs(mode) * Math.max(0.2, Math.abs(end - start))))
    const startedAt = performance.now()
    const easing = mode === 'simulation' ? easeInOut : easeOutCubic

    cancelFrame()
    animationState.value = { ...animationState.value, phase: 'settling' }

    const tick = (now: number) => {
      const t = clamp((now - startedAt) / duration, 0, 1)
      setAnimationProgress(start + (end - start) * easing(t), 'settling')
      if (t < 1) {
        animationFrame = requestAnimationFrame(tick)
        return
      }
      animationFrame = null
      if (commit) completeTarget(target)
      else clearAnimation()
    }

    animationFrame = requestAnimationFrame(tick)
  }

  const startAnimationToTarget = (target: PagingTarget | null, direction: PagingDirection) => {
    if (!target || animationState.value.active) return false
    const now = Date.now()
    if (now - lastFlipTime < 90) return false
    lastFlipTime = now

    if (opts.flipMode.value === 'none') {
      suppressAnim.value = true
      completeTarget(target)
      return true
    }

    beginPaging(target, direction, 'settling')
    nextTick(() => animateTo(1, true))
    return true
  }

  const requestPageTurn = (direction: PagingDirection) => startAnimationToTarget(resolveTarget(direction), direction)

  const nextPage = () => requestPageTurn(1)

  const prevPage = () => requestPageTurn(-1)

  const slideToNextChapter = () => {
    if (opts.currentChapterIndex.value >= opts.chapters.value.length - 1) return false
    return startAnimationToTarget({ chapterIndex: opts.currentChapterIndex.value + 1, pageIndex: 0 }, 1)
  }

  const slideToPrevChapter = () => {
    if (opts.currentChapterIndex.value <= 0) return false
    return startAnimationToTarget({
      chapterIndex: opts.currentChapterIndex.value - 1,
      pageIndex: lastSpreadStart(prevPageCount.value),
    }, -1)
  }

  const goToChapter = (idx: number, keepMenu = false) => {
    if (idx >= 0 && idx < opts.chapters.value.length && idx !== opts.currentChapterIndex.value) {
      clearAnimation()
      opts.onBeforeChapterChange?.(idx)
      suppressAnim.value = true
      opts.currentChapterIndex.value = idx
      currentPage.value = 0
      nextTick(() => {
        requestAnimationFrame(() => {
          calculatePages()
          opts.saveProgress()
          suppressAnim.value = false
        })
      })
    }
    return keepMenu
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || animationState.value.active || opts.chapters.value.length === 0) return false
    pointerSession = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: event.timeStamp || performance.now(),
      velocityX: 0,
      candidate: true,
      dragStarted: false,
    }
    try {
      ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
    } catch (_) {}
    return true
  }

  const handlePointerMove = (event: PointerEvent) => {
    const session = pointerSession
    if (!session || session.pointerId !== event.pointerId || !session.candidate) return false

    const now = event.timeStamp || performance.now()
    const elapsed = Math.max(1, now - session.lastTime)
    const deltaFromLast = event.clientX - session.lastX
    session.velocityX = deltaFromLast / elapsed
    session.lastX = event.clientX
    session.lastTime = now

    const deltaX = event.clientX - session.startX
    const deltaY = event.clientY - session.startY
    const slop = 8

    if (!session.dragStarted) {
      if ((deltaX * deltaX + deltaY * deltaY) <= slop * slop) return false
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
        pointerSession = null
        return false
      }
      const direction: PagingDirection = deltaX < 0 ? 1 : -1
      const target = resolveTarget(direction)
      if (!target) {
        pointerSession = null
        return false
      }
      beginPaging(target, direction, 'dragging', session.startY / stageHeight())
      session.dragStarted = true
      clickSuppressed = true
    }

    const direction = animationState.value.direction
    const progress = direction > 0 ? -deltaX / stageWidth() : deltaX / stageWidth()
    animationState.value = {
      ...animationState.value,
      touchYRatio: clamp(event.clientY / stageHeight(), 0, 1),
      progress: clamp(progress, 0, 1),
    }
    event.preventDefault()
    return true
  }

  const shouldCommitInteractivePaging = () => {
    const state = animationState.value
    const directionalVelocity = state.direction > 0
      ? -(pointerSession?.velocityX ?? 0)
      : (pointerSession?.velocityX ?? 0)
    const threshold = state.mode === 'cover' ? 0.18
      : state.mode === 'simulation' ? 0.24
        : state.mode === 'scroll' ? 0.28
          : 0.22
    const velocityThreshold = state.mode === 'scroll' ? 0.7 : 0.85
    if (state.progress >= threshold) return true
    if (directionalVelocity > velocityThreshold) return true
    return false
  }

  const handlePointerUp = (event: PointerEvent) => {
    const session = pointerSession
    if (!session || session.pointerId !== event.pointerId) return false
    try {
      ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId)
    } catch (_) {}
    const commit = shouldCommitInteractivePaging()
    pointerSession = null
    if (!session.dragStarted) return false
    animateTo(commit ? 1 : 0, commit)
    event.preventDefault()
    return true
  }

  const handlePointerCancel = (event?: PointerEvent) => {
    const session = pointerSession
    if (!session) return false
    if (event && session.pointerId !== event.pointerId) return false
    pointerSession = null
    if (animationState.value.active) animateTo(0, false)
    return true
  }

  const consumeClickAfterDrag = () => {
    const suppressed = clickSuppressed
    clickSuppressed = false
    return suppressed
  }

  const simulationGeometry = () => {
    const width = stageWidth()
    const height = stageHeight()
    const state = animationState.value
    const progress = clamp(state.progress, 0, 1)
    const turnedWidth = width * progress
    const remainingWidth = width - turnedWidth
    const bias = (state.touchYRatio - 0.5) * Math.min(180, width * 0.18) * (1 - progress * 0.35)
    const crease = state.direction > 0 ? remainingWidth : turnedWidth
    const top = clamp(crease + bias, 0, width)
    const bottom = clamp(crease - bias, 0, width)
    const middle = (top + bottom) / 2
    const maxFoldWidth = clamp(width * 0.18, 140, 320)
    const foldWidth = clamp(
      Math.min(turnedWidth * 0.58, remainingWidth * 0.58, maxFoldWidth),
      0,
      maxFoldWidth,
    )
    const foldLeft = state.direction > 0
      ? clamp(middle, 0, width)
      : clamp(middle - foldWidth, 0, width)
    const foldRight = clamp(foldLeft + foldWidth, 0, width)
    const incomingEdgeTop = state.direction > 0
      ? clamp(top + foldWidth, 0, width)
      : clamp(top - foldWidth, 0, width)
    const incomingEdgeBottom = state.direction > 0
      ? clamp(bottom + foldWidth, 0, width)
      : clamp(bottom - foldWidth, 0, width)
    const currentClip = state.direction > 0
      ? `polygon(0 0, ${top}px 0, ${bottom}px ${height}px, 0 ${height}px)`
      : `polygon(${top}px 0, ${width}px 0, ${width}px ${height}px, ${bottom}px ${height}px)`
    const incomingClip = state.direction > 0
      ? `polygon(${incomingEdgeTop}px 0, ${width}px 0, ${width}px ${height}px, ${incomingEdgeBottom}px ${height}px)`
      : `polygon(0 0, ${incomingEdgeTop}px 0, ${incomingEdgeBottom}px ${height}px, 0 ${height}px)`
    const foldInnerTranslate = state.direction > 0 ? foldRight : middle
    return { width, height, progress, middle, foldWidth, foldLeft, foldRight, foldInnerTranslate, currentClip, incomingClip }
  }

  const pagingVisuals = computed<{
    current: CSSProperties
    incoming: CSSProperties
    currentSnapshot: CSSProperties
    fold: CSSProperties
    foldInner: CSSProperties
    shadow: CSSProperties
    highlight: CSSProperties
  }>(() => {
    const state = animationState.value
    const width = stageWidth()
    const height = stageHeight()
    const progress = clamp(state.progress, 0, 1)
    const direction = state.direction

    const hidden: CSSProperties = { display: 'none' }
    const baseLayer: CSSProperties = {
      transform: 'translate3d(0, 0, 0)',
      clipPath: 'none',
      opacity: 1,
      visibility: 'visible',
    }

    if (!state.active || !incomingTarget.value) {
      return {
        current: baseLayer,
        incoming: hidden,
        currentSnapshot: hidden,
        fold: hidden,
        foldInner: hidden,
        shadow: hidden,
        highlight: hidden,
      }
    }

    if (state.mode === 'simulation') {
      const geo = simulationGeometry()
      const foldRotation = direction > 0 ? -10 - (1 - progress) * 18 : 10 + (1 - progress) * 18
      const foldVisible = geo.foldWidth > 1 && progress > 0.005 && progress < 0.995
      return {
        current: { ...baseLayer, visibility: 'hidden' },
        incoming: { ...baseLayer, zIndex: 2, clipPath: geo.incomingClip },
        currentSnapshot: { ...baseLayer, display: 'block', zIndex: 4, clipPath: geo.currentClip },
        fold: {
          display: foldVisible ? 'block' : 'none',
          zIndex: 5,
          width: `${geo.foldWidth}px`,
          transform: `translate3d(${geo.foldLeft}px, 0, 0) perspective(900px) rotateY(${foldRotation}deg)`,
          transformOrigin: direction > 0 ? 'left center' : 'right center',
          opacity: 0.98,
          backgroundColor: opts.coverColor.value,
        },
        foldInner: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate3d(${geo.foldInnerTranslate}px, 0, 0) scaleX(-1)`,
          transformOrigin: 'left top',
          backgroundColor: opts.coverColor.value,
          opacity: 0.16,
        },
        shadow: {
          display: foldVisible ? 'block' : 'none',
          zIndex: 6,
          width: `${clamp(geo.foldWidth * 0.82, 0, 120)}px`,
          transform: `translate3d(${direction > 0 ? geo.foldLeft - geo.foldWidth * 0.2 : geo.foldRight - geo.foldWidth * 1.05}px, 0, 0)`,
          opacity: clamp(0.08 + Math.sin(progress * Math.PI) * 0.2, 0, 0.3),
        },
        highlight: {
          display: foldVisible ? 'block' : 'none',
          zIndex: 7,
          width: `${clamp(geo.foldWidth * 0.52, 0, 82)}px`,
          transform: `translate3d(${direction > 0 ? geo.foldLeft + geo.foldWidth * 0.18 : geo.foldRight - geo.foldWidth * 0.72}px, 0, 0)`,
          opacity: clamp(0.08 + Math.sin(progress * Math.PI) * 0.2, 0, 0.28),
        },
      }
    }

    if (state.mode === 'cover') {
      const reveal = width * progress
      return {
        current: {
          ...baseLayer,
          zIndex: 4,
          transform: `translate3d(${direction > 0 ? -width * progress : width * progress}px, 0, 0)`,
        },
        incoming: {
          ...baseLayer,
          zIndex: 2,
          clipPath: direction > 0 ? clipInset(0, 0, 0, width - reveal) : clipInset(0, width - reveal, 0, 0),
        },
        currentSnapshot: hidden,
        fold: hidden,
        foldInner: hidden,
        shadow: hidden,
        highlight: hidden,
      }
    }

    if (state.mode === 'scroll') {
      const offsetY = (direction > 0 ? 1 : -1) * height * progress
      return {
        current: { ...baseLayer, zIndex: 3, transform: `translate3d(0, ${-offsetY}px, 0)` },
        incoming: {
          ...baseLayer,
          zIndex: 2,
          transform: `translate3d(0, ${(direction > 0 ? 1 : -1) * height * (1 - progress)}px, 0)`,
          opacity: 0.94 + 0.06 * progress,
        },
        currentSnapshot: hidden,
        fold: hidden,
        foldInner: hidden,
        shadow: hidden,
        highlight: hidden,
      }
    }

    const reveal = width * progress
    return {
      current: {
        ...baseLayer,
        zIndex: 3,
        transform: `translate3d(${direction > 0 ? -reveal : reveal}px, 0, 0)`,
      },
      incoming: {
        ...baseLayer,
        zIndex: 2,
        transform: `translate3d(${direction > 0 ? width - reveal : -width + reveal}px, 0, 0)`,
        clipPath: direction > 0 ? clipInset(0, width - reveal, 0, 0) : clipInset(0, 0, 0, width - reveal),
        opacity: 0.95 + 0.05 * progress,
      },
      currentSnapshot: hidden,
      fold: hidden,
      foldInner: hidden,
      shadow: hidden,
      highlight: hidden,
    }
  })

  const progressPercent = computed(() => {
    if (opts.chapters.value.length === 0) return 0
    const chapterWeight = 100 / opts.chapters.value.length
    const inChapter = totalPages.value > 0 ? ((currentPage.value + 1) / totalPages.value) * chapterWeight : chapterWeight
    return Math.min(100, Math.round(opts.currentChapterIndex.value * chapterWeight + inChapter))
  })

  return {
    currentPage,
    totalPages,
    containerWidth,
    pendingWebdavPos,
    prevPageCount,
    suppressAnim,
    incomingTarget,
    animationState,
    pagingVisuals,
    flipDurationMap,
    pageOffset,
    prevPageOffset,
    incomingPageOffset,
    progressPercent,
    recalc,
    calculatePages,
    requestPageTurn,
    nextPage,
    prevPage,
    slideToNextChapter,
    slideToPrevChapter,
    goToChapter,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    consumeClickAfterDrag,
  }
}
