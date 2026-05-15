<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import PageSliceView from './PageSliceView.vue'
import ReaderHUD from './ReaderHUD.vue'
import type { PageSlice, PagingTarget } from '../../types/pagination'
import { PageFlip } from '../../vendor/page-flip/page-flip.module.js'

type HudProps = InstanceType<typeof ReaderHUD>['$props']

const props = defineProps<{
  turnMode: 'outerPage' | 'spread'
  currentChapterIndex: number
  pages: PageSlice[]
  prevPages: PageSlice[]
  nextPages: PageSlice[]
  currentPage: number
  doublePageStep: 1 | 2
  pageWidth: number
  pageHeight: number
  pageGridHeight: number
  gridPaddingTop: number
  gridPaddingBottom: number
  marginX: number
  contentColumnWidth: number
  lineHeightPx: number
  pIndent: number
  pSpacing: number
  pageStyle: CSSProperties
  paperColor: string
  paperImage: string
  bgFilter: string
  bgTransform: string
  bgScrim: string
  justify: boolean
  showHud: boolean
  hudProps: HudProps
}>()

const emit = defineEmits<{
  flip: [target: PagingTarget]
  'page-drag': []
  'page-tap': [point: { clientX: number; clientY: number }]
}>()

interface FlipSpreadItem {
  key: string
  chapterIndex: number
  pageIndex: number
  pages: PageSlice[]
}

interface FlipPageItem {
  key: string
  slice: PageSlice | null
  rightSlice: PageSlice | null
  side: 'left' | 'right' | 'spread'
}

const bookRef = ref<HTMLElement | null>(null)
let pageFlip: PageFlip | null = null
let suppressFlipEmit = false
let tapStart: { x: number; y: number; time: number } | null = null
let pageDragStarted = false
let pendingFlipEmitFrame: number | null = null

const DRAG_COMMIT_PROGRESS = 38
const wholeSpreadMode = computed(() => props.turnMode === 'spread')
const clampPageFor = (pages: PageSlice[], pageIndex: number) => Math.max(0, Math.min(Math.max(0, pages.length - 1), pageIndex))
const logicalStep = computed(() => wholeSpreadMode.value ? 2 : props.doublePageStep === 2 ? 2 : 1)
const flipPageWidth = computed(() => wholeSpreadMode.value ? props.pageWidth * 2 : props.pageWidth)
const flipBookWidth = computed(() => wholeSpreadMode.value ? props.pageWidth * 2 : props.pageWidth * 2)

const normalizeLogicalPageFor = (pages: PageSlice[], pageIndex: number) => {
  const safe = clampPageFor(pages, pageIndex)
  return logicalStep.value === 1 ? safe : Math.floor(safe / 2) * 2
}

const lastLogicalPageFor = (pages: PageSlice[]) => {
  if (pages.length <= 0) return 0
  if (logicalStep.value === 1) return pages.length - 1
  return Math.max(0, Math.floor((pages.length - 1) / 2) * 2)
}

const logicalPagesFor = (pagesForChapter: PageSlice[]) => {
  const pages: number[] = []
  const lastPage = lastLogicalPageFor(pagesForChapter)
  for (let page = 0; pagesForChapter.length > 0 && page <= lastPage; page += logicalStep.value) {
    pages.push(page)
  }
  return pages
}

const currentLogicalPage = computed(() => normalizeLogicalPageFor(props.pages, props.currentPage))

const flipSpreads = computed<FlipSpreadItem[]>(() => {
  const spreads: FlipSpreadItem[] = []
  const prevChapterIndex = props.currentChapterIndex - 1
  const nextChapterIndex = props.currentChapterIndex + 1

  if (props.prevPages.length > 0) {
    const pageIndex = lastLogicalPageFor(props.prevPages)
    spreads.push({
      key: `chapter-${prevChapterIndex}-page-${pageIndex}`,
      chapterIndex: prevChapterIndex,
      pageIndex,
      pages: props.prevPages,
    })
  }

  for (const pageIndex of logicalPagesFor(props.pages)) {
    spreads.push({
      key: `chapter-${props.currentChapterIndex}-page-${pageIndex}`,
      chapterIndex: props.currentChapterIndex,
      pageIndex,
      pages: props.pages,
    })
  }

  if (props.nextPages.length > 0) {
    spreads.push({
      key: `chapter-${nextChapterIndex}-page-0`,
      chapterIndex: nextChapterIndex,
      pageIndex: 0,
      pages: props.nextPages,
    })
  }

  return spreads
})

const targetToFlipPage = (target: PagingTarget) => {
  const spreadIndex = flipSpreads.value.findIndex((spread) => (
    spread.chapterIndex === target.chapterIndex
    && spread.pageIndex === normalizeLogicalPageFor(spread.pages, target.pageIndex)
  ))
  if (spreadIndex >= 0) return wholeSpreadMode.value ? spreadIndex : spreadIndex * 2

  const currentIndex = flipSpreads.value.findIndex((spread) => (
    spread.chapterIndex === props.currentChapterIndex
    && spread.pageIndex === currentLogicalPage.value
  ))
  return Math.max(0, wholeSpreadMode.value ? currentIndex : currentIndex * 2)
}

const flipToTarget = (flipPageIndex: number): PagingTarget => {
  const localSpread = wholeSpreadMode.value
    ? Math.max(0, flipPageIndex)
    : Math.floor(Math.max(0, flipPageIndex) / 2)
  const spread = flipSpreads.value[localSpread]
  if (spread) {
    return {
      chapterIndex: spread.chapterIndex,
      pageIndex: spread.pageIndex,
    }
  }
  return {
    chapterIndex: props.currentChapterIndex,
    pageIndex: currentLogicalPage.value,
  }
}

const flipPages = computed<FlipPageItem[]>(() => {
  if (wholeSpreadMode.value) {
    return flipSpreads.value.map((spread) => ({
      key: `${spread.key}-spread`,
      slice: spread.pages[spread.pageIndex] ?? null,
      rightSlice: spread.pages[spread.pageIndex + 1] ?? null,
      side: 'spread' as const,
    }))
  }

  return flipSpreads.value.flatMap((spread) => ([
    { key: `${spread.key}-left`, slice: spread.pages[spread.pageIndex] ?? null, rightSlice: null, side: 'left' as const },
    { key: `${spread.key}-right`, slice: spread.pages[spread.pageIndex + 1] ?? null, rightSlice: null, side: 'right' as const },
  ]))
})

const rootStyle = computed<CSSProperties>(() => ({
  ...props.pageStyle,
  '--reader-paper': props.paperColor,
  '--reader-paper-image': props.paperImage,
  '--reader-bg-filter': props.bgFilter,
  '--reader-bg-transform': props.bgTransform,
  '--reader-bg-scrim': props.bgScrim,
  '--reader-page-width': `${props.pageWidth}px`,
  '--reader-flip-page-width': `${flipPageWidth.value}px`,
  '--reader-book-width': `${flipBookWidth.value}px`,
  '--reader-page-height': `${props.pageHeight}px`,
  '--reader-page-grid-height': `${props.pageGridHeight}px`,
  '--reader-grid-padding-top': `${props.gridPaddingTop}px`,
  '--reader-grid-padding-bottom': `${props.gridPaddingBottom}px`,
  '--reader-margin-x': `${props.marginX}px`,
  '--reader-content-column-width': `${props.contentColumnWidth}px`,
  '--reader-line-px': `${props.lineHeightPx}px`,
  '--p-indent': `${props.pIndent}em`,
  '--p-spacing': `${props.pSpacing}em`,
} as CSSProperties))

const patchDemoTouchBehavior = (instance: PageFlip) => {
  const patched = instance as any
  if (!patched.startUserTouch || !patched.getFlipController) return

  let grabStartY = 0
  let hasGrabStart = false
  let dragEmitted = false
  const originalStartUserTouch = patched.startUserTouch.bind(patched)
  patched.startUserTouch = function startUserTouch(point: { x: number; y: number }) {
    const rect = patched.getRender().getRect()
    if (rect) grabStartY = point.y / Math.max(1, rect.height)
    hasGrabStart = true
    dragEmitted = false
    return originalStartUserTouch(point)
  }

  const controller = patched.getFlipController()
  if (!controller?.fold || !controller?.flip) return

  if (wholeSpreadMode.value) {
    const collection = patched.getPageCollection?.()
    const render = patched.getRender?.()
    if (collection?.getFlippingPage && collection?.getBottomPage && render?.drawBottomPage) {
      const originalGetFlippingPage = collection.getFlippingPage.bind(collection)
      const originalGetBottomPage = collection.getBottomPage.bind(collection)
      collection.getFlippingPage = function getFlippingPage(direction: number) {
        if (render.getOrientation?.() === 'portrait' && direction === 1) {
          const currentIndex = this.getCurrentPageIndex?.() ?? patched.getCurrentPageIndex?.()
          const currentPage = Number.isFinite(currentIndex) ? this.getPage?.(currentIndex) : null
          return currentPage?.newTemporaryCopy?.() ?? originalGetFlippingPage(direction)
        }
        return originalGetFlippingPage(direction)
      }
      collection.getBottomPage = function getBottomPage(direction: number) {
        if (render.getOrientation?.() === 'portrait' && direction === 1) {
          const currentIndex = this.getCurrentPageIndex?.() ?? patched.getCurrentPageIndex?.()
          const prevIndex = Number.isFinite(currentIndex) ? currentIndex - 1 : -1
          if (prevIndex >= 0) return this.getPage?.(prevIndex) ?? originalGetBottomPage(direction)
        }
        return originalGetBottomPage(direction)
      }

      const originalDrawBottomPage = render.drawBottomPage.bind(render)
      render.drawBottomPage = function drawBottomPage() {
        if (this.getOrientation?.() === 'portrait' && this.getDirection?.() === 1 && this.bottomPage) {
          const density = this.flippingPage?.getDrawingDensity?.() ?? null
          const bottomElement = this.bottomPage.getElement?.()
          if (bottomElement) bottomElement.style.zIndex = String(this.getSettings().startZIndex + 3)
          this.bottomPage.draw?.(density)
          return
        }
        return originalDrawBottomPage()
      }
    }
  }

  const originalFold = controller.fold.bind(controller)
  controller.fold = function fold(point: { x: number; y: number }) {
    const nextPoint = { ...point }
    if (!dragEmitted) {
      dragEmitted = true
      pageDragStarted = true
      emit('page-drag')
    }
    if (hasGrabStart && grabStartY > 0.33 && grabStartY < 0.66) {
      nextPoint.y = 1
    }
    return originalFold(nextPoint)
  }

  const originalFlip = controller.flip.bind(controller)
  controller.flip = function flip(point: { x: number; y: number }) {
    if (hasGrabStart) {
      hasGrabStart = false
      dragEmitted = false
      return
    }
    const nextPoint = { ...point }
    const rect = patched.getRender().getRect()
    if (rect) {
      const relY = nextPoint.y / Math.max(1, rect.height)
      const zoneY = hasGrabStart ? grabStartY : relY
      if (zoneY > 0.33 && zoneY < 0.66) {
        nextPoint.y = 1
      } else if (zoneY <= 0.33) {
        nextPoint.y = rect.height * 0.15
      } else {
        nextPoint.y = rect.height * 0.85
      }
    }
    hasGrabStart = false
    if (
      !controller.start
      || !controller.getBoundsRect
      || !controller.setState
      || !controller.animateFlippingTo
    ) {
      return originalFlip(nextPoint)
    }
    try {
      controller.render?.finishAnimation?.()
      if (!controller.start(nextPoint)) return
      const bounds = controller.getBoundsRect()
      const corner = controller.calc?.getCorner?.() ?? controller.getCalculation?.()?.getCorner?.()
      const inset = bounds.height / 10
      const startY = corner === 'bottom' ? bounds.height - inset : inset
      const finishY = corner === 'bottom' ? bounds.height : 0
      controller.setState('flipping')
      controller.calc?.calc?.({ x: bounds.pageWidth - inset, y: startY })
      return controller.animateFlippingTo(
        { x: bounds.pageWidth - inset, y: startY },
        { x: -bounds.pageWidth * 1.12, y: finishY },
        true,
      )
    } catch (_) {
      return originalFlip(nextPoint)
    }
  }

  if (controller.stopMove) {
    controller.stopMove = function stopMove() {
      const calc = controller.getCalculation?.() ?? controller.calc
      hasGrabStart = false
      dragEmitted = false
      if (!calc?.getPosition || !controller.getBoundsRect || !controller.animateFlippingTo) return
      const position = calc.getPosition()
      const bounds = controller.getBoundsRect()
      const progress = calc.getFlippingProgress?.() ?? Math.abs((position.x - bounds.pageWidth) / (2 * bounds.pageWidth) * 100)
      const finishY = calc.getCorner?.() === 'bottom' ? bounds.height : 0
      const shouldCommit = progress >= DRAG_COMMIT_PROGRESS
      return controller.animateFlippingTo(
        position,
        { x: shouldCommit ? -bounds.pageWidth * 1.12 : bounds.pageWidth, y: finishY },
        shouldCommit,
      )
    }
  }
}

const destroyPageFlip = () => {
  if (pendingFlipEmitFrame !== null) {
    cancelAnimationFrame(pendingFlipEmitFrame)
    pendingFlipEmitFrame = null
  }
  if (!pageFlip) return
  pageFlip.destroy()
  pageFlip = null
}

const initPageFlip = async () => {
  destroyPageFlip()
  await nextTick()
  if (!bookRef.value || flipPages.value.length === 0) return

  const pageWidth = Math.max(1, Math.round(flipPageWidth.value))
  const pageHeight = Math.max(1, Math.round(props.pageHeight))
  const fixedSpread = wholeSpreadMode.value
  const pageFlipSettings = {
    width: pageWidth,
    height: pageHeight,
    size: fixedSpread ? 'fixed' : 'stretch',
    minWidth: fixedSpread ? pageWidth : 100,
    maxWidth: fixedSpread ? pageWidth : Math.max(100, pageWidth),
    minHeight: fixedSpread ? pageHeight : 100,
    maxHeight: fixedSpread ? pageHeight : Math.max(100, pageHeight),
    maxShadowOpacity: 0.5,
    showCover: false,
    mobileScrollSupport: true,
    showPageCorners: false,
    disableFlipByClick: true,
    autoSize: false,
    flippingTime: 300,
    swipeDistance: 10,
    startPage: targetToFlipPage({ chapterIndex: props.currentChapterIndex, pageIndex: props.currentPage }),
    usePortrait: true,
  }

  pageFlip = new PageFlip(bookRef.value, pageFlipSettings as any)

  pageFlip.loadFromHTML(bookRef.value.querySelectorAll('.r-page'))
  patchDemoTouchBehavior(pageFlip)
  pageFlip.on<number>('flip', (event) => {
    if (suppressFlipEmit) return
    if (typeof event.data !== 'number') return
    const target = flipToTarget(event.data)
    if (pendingFlipEmitFrame !== null) cancelAnimationFrame(pendingFlipEmitFrame)
    pendingFlipEmitFrame = requestAnimationFrame(() => {
      pendingFlipEmitFrame = null
      emit('flip', target)
    })
  })
}

const turnToPage = (pageIndex: number) => {
  if (!pageFlip) return
  const target = targetToFlipPage({ chapterIndex: props.currentChapterIndex, pageIndex })
  if (pageFlip.getCurrentPageIndex() === target) return
  suppressFlipEmit = true
  pageFlip.turnToPage(target)
  requestAnimationFrame(() => {
    suppressFlipEmit = false
  })
}

const flipNext = () => {
  if (!pageFlip) return false
  const currentSpreadIndex = wholeSpreadMode.value
    ? Math.max(0, pageFlip.getCurrentPageIndex())
    : Math.floor(Math.max(0, pageFlip.getCurrentPageIndex()) / 2)
  if (currentSpreadIndex >= flipSpreads.value.length - 1) return false
  pageFlip.flipNext('bottom')
  return true
}

const flipPrev = () => {
  if (!pageFlip) return false
  const currentSpreadIndex = wholeSpreadMode.value
    ? Math.max(0, pageFlip.getCurrentPageIndex())
    : Math.floor(Math.max(0, pageFlip.getCurrentPageIndex()) / 2)
  if (currentSpreadIndex <= 0) return false
  pageFlip.flipPrev('top')
  return true
}

const startTapCandidate = (clientX: number, clientY: number) => {
  tapStart = { x: clientX, y: clientY, time: Date.now() }
  pageDragStarted = false
}

const finishTapCandidate = (clientX: number, clientY: number) => {
  if (!tapStart || pageDragStarted) {
    tapStart = null
    return
  }
  const dx = clientX - tapStart.x
  const dy = clientY - tapStart.y
  const elapsed = Date.now() - tapStart.time
  tapStart = null
  if (Math.hypot(dx, dy) <= 8 && elapsed <= 500) {
    emit('page-tap', { clientX, clientY })
  }
}

const handleMouseDownCapture = (event: MouseEvent) => {
  if (event.button !== 0) return
  startTapCandidate(event.clientX, event.clientY)
}

const handleMouseUpCapture = (event: MouseEvent) => {
  if (event.button !== 0) return
  finishTapCandidate(event.clientX, event.clientY)
}

const handleTouchStartCapture = (event: TouchEvent) => {
  const touch = event.changedTouches[0]
  if (!touch) return
  startTapCandidate(touch.clientX, touch.clientY)
}

const handleTouchEndCapture = (event: TouchEvent) => {
  const touch = event.changedTouches[0]
  if (!touch) return
  finishTapCandidate(touch.clientX, touch.clientY)
}

watch(() => [props.currentChapterIndex, props.currentPage] as const, ([, pageIndex]) => turnToPage(pageIndex))

onMounted(initPageFlip)
onBeforeUnmount(destroyPageFlip)

defineExpose({
  flipNext,
  flipPrev,
  turnToPage,
})
</script>

<template>
  <div
    class="pageflip-reader"
    :class="{ 'pageflip-spread-reader': wholeSpreadMode }"
    :style="rootStyle"
    @mousedown.capture="handleMouseDownCapture"
    @mouseup.capture="handleMouseUpCapture"
    @touchstart.capture="handleTouchStartCapture"
    @touchend.capture="handleTouchEndCapture"
  >
    <div ref="bookRef" class="pageflip-book">
      <div
        v-for="item in flipPages"
        :key="item.key"
        class="r-page"
        data-density="soft"
      >
        <div class="pageflip-page-bg"></div>
        <div
          v-if="!wholeSpreadMode"
          class="pageflip-binding"
          :class="item.side === 'left' ? 'pageflip-binding-left' : 'pageflip-binding-right'"
        ></div>
        <div v-if="wholeSpreadMode" class="pageflip-spread-slot">
          <div class="pageflip-spread-page-slot">
            <PageSliceView v-if="item.slice" :slice="item.slice" :justify="justify" />
          </div>
          <div class="pageflip-spread-page-slot">
            <PageSliceView v-if="item.rightSlice" :slice="item.rightSlice" :justify="justify" />
          </div>
        </div>
        <div v-else class="pageflip-page-slot">
          <PageSliceView v-if="item.slice" :slice="item.slice" :justify="justify" />
        </div>
      </div>
    </div>
    <ReaderHUD v-if="showHud" v-bind="hudProps" />
  </div>
</template>

<style scoped>
.pageflip-reader {
  position: absolute;
  inset: 0;
  z-index: 4;
  overflow: hidden;
  color: inherit;
  contain: layout paint;
  pointer-events: auto;
  box-sizing: border-box;
}

.pageflip-book {
  width: var(--reader-book-width);
  height: var(--reader-page-height);
  margin: 0 auto;
  position: relative;
}

.pageflip-book :deep(.stf__wrapper) {
  position: relative;
  width: 100%;
  height: var(--reader-page-height);
  padding-bottom: 0 !important;
  box-sizing: border-box;
}

.pageflip-book :deep(.stf__block) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  perspective: 2000px;
}

.pageflip-book :deep(.stf__item) {
  display: none;
  position: absolute;
  transform-style: preserve-3d;
}

.pageflip-book :deep(.stf__outerShadow),
.pageflip-book :deep(.stf__innerShadow),
.pageflip-book :deep(.stf__hardShadow),
.pageflip-book :deep(.stf__hardInnerShadow) {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}

.pageflip-book :deep(canvas) {
  width: 100%;
  height: var(--reader-page-height);
}

.pageflip-spread-reader .pageflip-book,
.pageflip-spread-reader .pageflip-book :deep(.stf__wrapper),
.pageflip-spread-reader .pageflip-book :deep(.stf__block) {
  width: var(--reader-book-width) !important;
  height: var(--reader-page-height) !important;
}

.pageflip-spread-reader .pageflip-book :deep(.stf__block) {
  overflow: visible;
}

.pageflip-spread-reader .pageflip-book :deep(.stf__hardShadow),
.pageflip-spread-reader .pageflip-book :deep(.stf__hardInnerShadow) {
  display: none !important;
  opacity: 0 !important;
}

.r-page {
  position: relative;
  width: var(--reader-flip-page-width);
  height: var(--reader-page-height);
  overflow: hidden;
  background: var(--reader-paper, #f7f2e6);
  color: inherit;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.035);
}

.pageflip-spread-reader .r-page {
  width: var(--reader-book-width) !important;
  height: var(--reader-page-height) !important;
  box-shadow: none;
}

.pageflip-page-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-color: var(--reader-paper, #f7f2e6);
  background-image: var(--reader-paper-image, none);
  background-size: cover;
  background-position: center;
  filter: var(--reader-bg-filter, none);
  transform: var(--reader-bg-transform, none);
  transform-origin: center;
}

.r-page::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  background: var(--reader-bg-scrim, transparent);
  pointer-events: none;
}

.pageflip-page-slot {
  position: absolute;
  top: var(--reader-grid-padding-top);
  left: 0;
  z-index: 2;
  width: var(--reader-page-width);
  height: var(--reader-page-grid-height);
  padding: 0 var(--reader-margin-x);
  box-sizing: border-box;
  overflow: hidden;
}

.pageflip-spread-slot {
  position: absolute;
  top: var(--reader-grid-padding-top);
  left: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: var(--reader-page-width) var(--reader-page-width);
  column-gap: 0;
  width: calc(var(--reader-page-width) * 2);
  height: var(--reader-page-grid-height);
  box-sizing: border-box;
  overflow: hidden;
}

.pageflip-spread-page-slot {
  width: var(--reader-page-width);
  height: var(--reader-page-grid-height);
  padding: 0 var(--reader-margin-x);
  box-sizing: border-box;
  overflow: hidden;
}

.pageflip-binding {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 28px;
  z-index: 3;
  pointer-events: none;
  opacity: 0.22;
}

.pageflip-binding-left {
  left: 0;
  background: linear-gradient(to right, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.04) 42%, transparent);
}

.pageflip-binding-right {
  right: 0;
  background: linear-gradient(to left, rgba(0, 0, 0, 0.14), rgba(0, 0, 0, 0.04) 42%, transparent);
}
</style>
