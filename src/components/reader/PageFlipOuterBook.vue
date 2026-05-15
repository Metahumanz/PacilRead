<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import PageSliceView from './PageSliceView.vue'
import ReaderHUD from './ReaderHUD.vue'
import type { PageSlice } from '../../types/pagination'
import { PageFlip } from '../../vendor/page-flip/page-flip.module.js'

type HudProps = InstanceType<typeof ReaderHUD>['$props']

const props = defineProps<{
  pages: PageSlice[]
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
  flip: [pageIndex: number]
  'page-drag': []
  'page-tap': [point: { clientX: number; clientY: number }]
}>()

interface FlipPageItem {
  key: string
  slice: PageSlice | null
  side: 'left' | 'right'
}

const bookRef = ref<HTMLElement | null>(null)
let pageFlip: PageFlip | null = null
let suppressFlipEmit = false
let tapStart: { x: number; y: number; time: number } | null = null
let pageDragStarted = false

const clampPage = (pageIndex: number) => Math.max(0, Math.min(Math.max(0, props.pages.length - 1), pageIndex))
const logicalStep = computed(() => props.doublePageStep === 2 ? 2 : 1)
const lastLogicalPage = computed(() => {
  if (props.pages.length <= 0) return 0
  if (props.doublePageStep === 1) return props.pages.length - 1
  return Math.max(0, Math.floor((props.pages.length - 1) / 2) * 2)
})
const currentLogicalPage = computed(() => {
  const safe = clampPage(props.currentPage)
  return props.doublePageStep === 1 ? safe : Math.floor(safe / 2) * 2
})
const logicalPagesInWindow = computed(() => {
  const pages: number[] = []
  for (let page = 0; page <= lastLogicalPage.value; page += logicalStep.value) {
    pages.push(page)
  }
  return pages
})
const logicalToFlipPage = (pageIndex: number) => {
  const safe = props.doublePageStep === 1
    ? clampPage(pageIndex)
    : Math.floor(clampPage(pageIndex) / 2) * 2
  const spreadIndex = logicalPagesInWindow.value.indexOf(safe)
  return Math.max(0, spreadIndex) * 2
}
const flipToLogicalPage = (flipPageIndex: number) => {
  const localSpread = Math.floor(Math.max(0, flipPageIndex) / 2)
  return logicalPagesInWindow.value[localSpread] ?? currentLogicalPage.value
}

const flipPages = computed<FlipPageItem[]>(() => {
  return logicalPagesInWindow.value.flatMap((page) => ([
    { key: `page-${page}-left`, slice: props.pages[page] ?? null, side: 'left' as const },
    { key: `page-${page}-right`, slice: props.pages[page + 1] ?? null, side: 'right' as const },
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
    return originalFlip(nextPoint)
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
      const shouldCommit = progress >= 62
      return controller.animateFlippingTo(
        position,
        { x: shouldCommit ? -bounds.pageWidth : bounds.pageWidth, y: finishY },
        shouldCommit,
      )
    }
  }
}

const destroyPageFlip = () => {
  if (!pageFlip) return
  pageFlip.destroy()
  pageFlip = null
}

const initPageFlip = async () => {
  destroyPageFlip()
  await nextTick()
  if (!bookRef.value || flipPages.value.length === 0) return

  pageFlip = new PageFlip(bookRef.value, {
    width: Math.max(1, Math.round(props.pageWidth)),
    height: Math.max(1, Math.round(props.pageHeight)),
    size: 'stretch',
    minWidth: 100,
    maxWidth: Math.max(100, Math.round(props.pageWidth)),
    minHeight: 100,
    maxHeight: Math.max(100, Math.round(props.pageHeight)),
    maxShadowOpacity: 0.5,
    showCover: false,
    mobileScrollSupport: true,
    showPageCorners: false,
    disableFlipByClick: true,
    flippingTime: 300,
    swipeDistance: 10,
    startPage: logicalToFlipPage(props.currentPage),
  })

  pageFlip.loadFromHTML(bookRef.value.querySelectorAll('.r-page'))
  patchDemoTouchBehavior(pageFlip)
  pageFlip.on<number>('flip', (event) => {
    if (suppressFlipEmit) return
    if (typeof event.data === 'number') emit('flip', flipToLogicalPage(event.data))
  })
}

const turnToPage = (pageIndex: number) => {
  if (!pageFlip) return
  const target = logicalToFlipPage(pageIndex)
  if (pageFlip.getCurrentPageIndex() === target) return
  suppressFlipEmit = true
  pageFlip.turnToPage(target)
  requestAnimationFrame(() => {
    suppressFlipEmit = false
  })
}

const flipNext = () => {
  if (!pageFlip) return false
  if (clampPage(props.currentPage) >= lastLogicalPage.value) return false
  pageFlip.flipNext('top')
  return true
}

const flipPrev = () => {
  if (!pageFlip) return false
  if (clampPage(props.currentPage) <= 0) return false
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

watch(() => props.currentPage, (pageIndex) => turnToPage(pageIndex))

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
          class="pageflip-binding"
          :class="item.side === 'left' ? 'pageflip-binding-left' : 'pageflip-binding-right'"
        ></div>
        <div class="pageflip-page-slot">
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
  width: calc(var(--reader-page-width) * 2);
  height: var(--reader-page-height);
  margin: 0 auto;
  position: relative;
}

.pageflip-book :deep(.stf__wrapper) {
  position: relative;
  width: 100%;
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

.r-page {
  position: relative;
  width: var(--reader-page-width);
  height: var(--reader-page-height);
  overflow: hidden;
  background: var(--reader-paper, #f7f2e6);
  color: inherit;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.035);
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
