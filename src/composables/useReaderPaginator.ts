import { ref, computed, nextTick, type Ref } from 'vue'
import type { PageSlice, PaginationSnapshot } from '../types/pagination'

// Module-level cache — persists across composable lifecycles
const cachedPageSlicesMap = new Map<string, PageSlice[]>()
const cacheInsertionOrder: string[] = []
const MAX_CACHE_ENTRIES = 50

let prewarmGeneration = 0

function computeSnapshotHash(snap: Omit<PaginationSnapshot, 'hash'>): string {
  const parts = [
    snap.containerWidth, snap.containerHeight, snap.pageWidth,
    snap.fontSize, snap.lineHeight, snap.letterSpacing, snap.fontWeight,
    snap.fontFamily, snap.textAlign, snap.pageMode, snap.marginX, snap.marginY,
    snap.pIndent, snap.pSpacing, snap.chapterId,
  ]
  const str = parts.join('|')
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

function cacheKey(chapterId: number, snapshotHash: string): string {
  return `${chapterId}@${snapshotHash}`
}

function cacheSet(key: string, slices: PageSlice[]): void {
  if (cachedPageSlicesMap.size >= MAX_CACHE_ENTRIES) {
    const oldest = cacheInsertionOrder.shift()
    if (oldest) cachedPageSlicesMap.delete(oldest)
  }
  cachedPageSlicesMap.set(key, slices)
  cacheInsertionOrder.push(key)
}

function createOffscreenContainer(snapshot: PaginationSnapshot): {
  wrapper: HTMLDivElement
  content: HTMLDivElement
  destroy: () => void
} {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = [
    'position:fixed; left:-9999px; top:0;',
    `width:${snapshot.containerWidth}px;`,
    `height:${snapshot.containerHeight}px;`,
    'overflow:hidden; box-sizing:border-box;',
    `padding:${snapshot.marginY}px ${snapshot.marginX}px;`,
  ].join('')

  const content = document.createElement('div')
  const colWidth = snapshot.pageMode === 'double'
    ? `calc(50vw - ${snapshot.marginX * 2}px)`
    : `calc(100vw - ${snapshot.marginX * 2}px)`
  content.style.cssText = [
    'height:100%; column-fill:auto;',
    `font-family:${snapshot.fontFamily};`,
    `font-size:${snapshot.fontSize}px;`,
    `line-height:${snapshot.lineHeight};`,
    `letter-spacing:${snapshot.letterSpacing}em;`,
    `font-weight:${snapshot.fontWeight};`,
    `text-align:${snapshot.textAlign};`,
    `column-width:${colWidth};`,
    `column-gap:${snapshot.marginX * 2}px;`,
    'align-content:start;',
    `--p-indent:${snapshot.pIndent}em;`,
    `--p-spacing:${snapshot.pSpacing}em;`,
  ].join('')

  wrapper.appendChild(content)
  document.body.appendChild(wrapper)

  return {
    wrapper,
    content,
    destroy: () => {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper)
    },
  }
}

export function useReaderPaginator(opts: {
  containerRef: Ref<HTMLElement | null>
  fontSize: Ref<number>
  lineHeight: Ref<number>
  letterSpacing: Ref<number>
  fontWeight: Ref<number>
  fontFamily: Ref<string>
  textAlign: Ref<string>
  marginX: Ref<number>
  marginY: Ref<number>
  pageMode: Ref<'single' | 'double'>
  pIndent: Ref<number>
  pSpacing: Ref<number>
}) {
  const isCacheHit = ref(false)

  const capturePaginationSnapshot = (chapterId: number): PaginationSnapshot => {
    const cw = opts.containerRef.value?.clientWidth ?? 0
    const ch = opts.containerRef.value?.clientHeight ?? 0
    const pageWidth = opts.pageMode.value === 'double' ? cw / 2 : cw

    const snap: Omit<PaginationSnapshot, 'hash'> = {
      containerWidth: cw,
      containerHeight: ch,
      pageWidth,
      fontSize: opts.fontSize.value,
      lineHeight: opts.lineHeight.value,
      letterSpacing: opts.letterSpacing.value,
      fontWeight: opts.fontWeight.value,
      fontFamily: opts.fontFamily.value,
      textAlign: opts.textAlign.value,
      marginX: opts.marginX.value,
      marginY: opts.marginY.value,
      pageMode: opts.pageMode.value,
      pIndent: opts.pIndent.value,
      pSpacing: opts.pSpacing.value,
      chapterId,
    }

    return { ...snap, hash: computeSnapshotHash(snap) }
  }

  const prewarmChapterText = async (
    chapterId: number,
    bodyHtml: string,
    bodyText: string,
    title: string,
    snapshot: PaginationSnapshot,
  ): Promise<void> => {
    const key = cacheKey(chapterId, snapshot.hash)
    if (cachedPageSlicesMap.has(key)) return

    const gen = ++prewarmGeneration

    const checkCancelled = (): boolean => {
      if (gen !== prewarmGeneration) return true
      return false
    }

    let offscreen: ReturnType<typeof createOffscreenContainer> | null = null

    try {
      if (checkCancelled()) return

      if (snapshot.containerWidth <= 0) return

      offscreen = createOffscreenContainer(snapshot)
      if (checkCancelled()) { offscreen.destroy(); return }

      // Build chapter HTML
      let html = ''
      if (title) {
        html += `<h2 style="font-weight:700; margin-bottom:1.5em; opacity:0.85; font-size:${snapshot.fontSize * 1.4}px; color:inherit; text-align:${snapshot.textAlign}">${title}</h2>`
      }
      html += `<div>${bodyHtml}</div>`

      // Inject a style that mirrors .ch-body :deep(p) rules
      const style = document.createElement('style')
      style.textContent = '.ch-body-offscreen p { text-indent: var(--p-indent); margin-bottom: var(--p-spacing); }'
      offscreen.content.innerHTML = html
      offscreen.content.querySelector('div')?.classList.add('ch-body-offscreen')
      offscreen.content.insertBefore(style, offscreen.content.firstChild)

      if (checkCancelled()) { offscreen.destroy(); return }

      // Wait for browser layout
      await nextTick()
      if (checkCancelled()) { offscreen.destroy(); return }

      await new Promise<void>(r => requestAnimationFrame(() => r()))
      if (checkCancelled()) { offscreen.destroy(); return }

      // Second RAF for stability (mirrors waitForStableLayout pattern)
      await new Promise<void>(r => requestAnimationFrame(() => r()))
      if (checkCancelled()) { offscreen.destroy(); return }

      const scrollWidth = offscreen.content.scrollWidth
      if (scrollWidth <= 0) { offscreen.destroy(); return }

      const pageWidth = snapshot.pageWidth
      const totalPages = Math.max(1, Math.ceil(scrollWidth / pageWidth))
      const bodyLen = (bodyText || '').length || 1

      const slices: PageSlice[] = []
      for (let i = 0; i < totalPages; i++) {
        const startChar = Math.floor((i / totalPages) * bodyLen)
        const endChar = Math.floor(((i + 1) / totalPages) * bodyLen)
        slices.push({
          pageIndex: i,
          startChar,
          endChar,
          charCount: endChar - startChar,
          isLast: i === totalPages - 1,
        })
      }

      cacheSet(key, slices)
    } finally {
      if (offscreen) offscreen.destroy()
    }
  }

  const getPagesForChapter = (chapterId: number, snapshotHash: string): {
    slices: PageSlice[] | null
    isCacheHit: boolean
  } => {
    const key = cacheKey(chapterId, snapshotHash)
    const slices = cachedPageSlicesMap.get(key) ?? null
    isCacheHit.value = slices !== null
    return { slices, isCacheHit: slices !== null }
  }

  const clearCache = (): void => {
    cachedPageSlicesMap.clear()
    cacheInsertionOrder.length = 0
    isCacheHit.value = false
  }

  const cacheSize = computed(() => cachedPageSlicesMap.size)

  return {
    capturePaginationSnapshot,
    prewarmChapterText,
    getPagesForChapter,
    isCacheHit,
    clearCache,
    cacheSize,
  }
}
