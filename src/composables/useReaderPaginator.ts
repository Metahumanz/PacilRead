import { computed, nextTick, ref, type Ref } from 'vue'
import type { PageLine, PageSlice, PaginationResult, PaginationSnapshot } from '../types/pagination'
import { computeReaderPageMetrics } from '../utils/readerLayout'
import { findPageForOffsetInSlices } from '../utils/pagination'

interface PrewarmOptions {
  mode?: 'partial' | 'full'
  targetPageIndex?: number
  targetOffset?: number
  extraPagesAfterTarget?: number
}

const cachedPageSlicesMap = new Map<string, PaginationResult>()
const cacheInsertionOrder: string[] = []
const pendingPaginationTasks = new Map<string, Promise<PaginationResult | null>>()
const cacheVersion = ref(0)
const MAX_CACHE_ENTRIES = 50
let cacheEpoch = 0

function computeSnapshotHash(snap: Omit<PaginationSnapshot, 'hash'>): string {
  const parts = [
    snap.containerWidth, snap.containerHeight, snap.pageWidth,
    snap.effectiveMarginX, snap.contentColumnWidth, snap.lineHeightPx,
    snap.pageGridHeight, snap.gridPaddingTop, snap.gridPaddingBottom,
    snap.fontSize, snap.lineHeight, snap.letterSpacing, snap.fontWeight,
    snap.fontFamily, snap.textAlign, snap.chapterTitleDisplay, snap.pageMode,
    snap.marginX, snap.marginTop, snap.marginBottom, snap.pIndent, snap.pSpacing,
    snap.chapterId,
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

function cacheSet(key: string, result: PaginationResult): void {
  const existing = cachedPageSlicesMap.get(key)
  if (existing?.complete && !result.complete) return
  if (!result.complete && existing && !existing.complete && existing.slices.length >= result.slices.length) return

  if (!cachedPageSlicesMap.has(key)) {
    cacheInsertionOrder.push(key)
  }
  cachedPageSlicesMap.set(key, result)
  while (cachedPageSlicesMap.size > MAX_CACHE_ENTRIES) {
    const oldest = cacheInsertionOrder.shift()
    if (oldest) cachedPageSlicesMap.delete(oldest)
  }
  cacheVersion.value += 1
}

function createMeasureRoot(snapshot: PaginationSnapshot): {
  root: HTMLDivElement
  destroy: () => void
} {
  const root = document.createElement('div')
  root.style.cssText = [
    'position:fixed; left:-9999px; top:0;',
    `width:${snapshot.contentColumnWidth}px;`,
    'visibility:hidden; pointer-events:none;',
    'contain:layout style paint;',
    `font-family:${snapshot.fontFamily};`,
    `font-size:${snapshot.fontSize}px;`,
    `line-height:${snapshot.lineHeightPx}px;`,
    `letter-spacing:${snapshot.letterSpacing}em;`,
    `font-weight:${snapshot.fontWeight};`,
    `text-align:${snapshot.textAlign};`,
    'white-space:normal;',
    'word-break:break-word;',
  ].join('')
  document.body.appendChild(root)
  return {
    root,
    destroy: () => {
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ')
}

function sanitizeHtmlForTextExtraction(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('script, style, noscript, iframe, object, embed, link, meta, base').forEach(node => node.remove())
  return template.innerHTML
}

function extractParagraphs(bodyHtml: string, bodyText: string): string[] {
  const template = document.createElement('template')
  template.innerHTML = sanitizeHtmlForTextExtraction(bodyHtml || '').replace(/<br\s*\/?>/gi, '\n')
  const paragraphNodes = Array.from(template.content.querySelectorAll('p'))
  const paragraphs = paragraphNodes
    .map((node) => normalizeText(node.textContent || '').trim())
    .filter(Boolean)
  if (paragraphs.length > 0) return paragraphs

  const text = normalizeText(template.content.textContent || bodyText || '')
  return text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function visibleRectCount(range: Range): number {
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0).length
}

function findLineEnd(node: Text, start: number, textLength: number): number {
  let low = start + 1
  let high = textLength
  let best = Math.min(textLength, start + 1)
  const range = document.createRange()

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    range.setStart(node, start)
    range.setEnd(node, mid)
    if (visibleRectCount(range) <= 1) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  range.detach()
  return Math.max(best, start + 1)
}

function splitMeasuredText(params: {
  root: HTMLElement
  text: string
  keyPrefix: string
  kind: 'title' | 'body'
  height: number
  fontSize: number
  fontWeight: number
  lineHeight: number
  textAlign: string
  indentPx: number
  afterBlockSpacing: number
  bodyOffset: number
}): PageLine[] {
  const text = normalizeText(params.text).replace(/\s+/g, ' ').trim()
  if (!text) return []

  const el = document.createElement(params.kind === 'title' ? 'h2' : 'p')
  el.style.cssText = [
    'width:100%; margin:0; padding:0; box-sizing:border-box;',
    `font-size:${params.fontSize}px;`,
    `font-weight:${params.fontWeight};`,
    `line-height:${params.lineHeight}px;`,
    `text-align:${params.textAlign};`,
    params.kind === 'body' ? `text-indent:${params.indentPx}px;` : 'text-indent:0;',
    'white-space:normal; word-break:break-word;',
  ].join('')

  const node = document.createTextNode(text)
  el.appendChild(node)
  params.root.appendChild(el)

  const lines: PageLine[] = []
  let cursor = 0
  let lineIndex = 0
  while (cursor < text.length) {
    const end = findLineEnd(node, cursor, text.length)
    const rawText = text.slice(cursor, end)
    const lineText = rawText.trimStart()
    const lineStart = params.kind === 'body' ? params.bodyOffset + cursor : -1
    const lineEnd = params.kind === 'body' ? params.bodyOffset + end : -1
    lines.push({
      key: `${params.keyPrefix}-${lineIndex}`,
      kind: params.kind,
      text: lineText,
      bodyStart: lineStart,
      bodyEnd: lineEnd,
      height: params.height,
      afterSpacing: 0,
      indentPx: params.kind === 'body' && lineIndex === 0 ? params.indentPx : 0,
      textAlign: params.textAlign,
      isParagraphStart: lineIndex === 0,
      isParagraphEnd: false,
    })
    cursor = end
    lineIndex += 1
  }

  if (lines.length > 0) {
    const last = lines[lines.length - 1]
    last.isParagraphEnd = true
    last.afterSpacing = params.afterBlockSpacing
  }

  params.root.removeChild(el)
  return lines
}

function finalizeSlices(rawPages: PageLine[][], pageGridHeight: number, complete = true): PageSlice[] {
  const safePages = rawPages.length > 0 ? rawPages : [[]]
  return safePages.map((rawLines, pageIndex) => {
    const lines = rawLines.map((line) => ({ ...line }))
    if (lines.length > 0) {
      lines[lines.length - 1].afterSpacing = 0
    }
    const bodyLines = lines.filter((line) => line.kind === 'body' && line.bodyEnd > line.bodyStart)
    const startChar = bodyLines.length > 0 ? bodyLines[0].bodyStart : 0
    const endChar = bodyLines.length > 0 ? bodyLines[bodyLines.length - 1].bodyEnd : startChar
    const baseHeight = lines.reduce((sum, line) => sum + line.height + line.afterSpacing, 0)
    const isLast = complete && pageIndex === safePages.length - 1
    const adjustableGaps = Math.max(0, lines.length - 1)
    const extraLineGap = !isLast && adjustableGaps > 0
      ? Math.max(0, (pageGridHeight - baseHeight) / adjustableGaps)
      : 0

    return {
      pageIndex,
      startChar,
      endChar,
      charCount: Math.max(0, endChar - startChar),
      isLast,
      text: bodyLines.map((line) => line.text).join(''),
      lines,
      bodyStartInSlice: bodyLines.length > 0 ? startChar : -1,
      bodyEndInSlice: bodyLines.length > 0 ? endChar : -1,
      baseHeight,
      extraLineGap,
    }
  })
}

function paginateLines(lines: PageLine[], pageGridHeight: number, complete = true): PageSlice[] {
  const pages: PageLine[][] = []
  let current: PageLine[] = []
  let currentHeight = 0

  for (const line of lines) {
    const lineTotalHeight = line.height + line.afterSpacing
    if (current.length > 0 && currentHeight + lineTotalHeight > pageGridHeight + 0.5) {
      pages.push(current)
      current = []
      currentHeight = 0
    }
    current.push(line)
    currentHeight += lineTotalHeight
  }

  if (current.length > 0 || pages.length === 0) {
    pages.push(current)
  }

  return finalizeSlices(pages, pageGridHeight, complete)
}

function hasReachedPaginationGoal(slices: PageSlice[], opts: PrewarmOptions): boolean {
  if (opts.mode !== 'partial' || slices.length === 0) return false
  const extraPages = Math.max(0, opts.extraPagesAfterTarget ?? 2)

  if (Number.isFinite(opts.targetPageIndex)) {
    return slices.length > Math.max(0, Math.floor(opts.targetPageIndex!)) + extraPages
  }

  if (Number.isFinite(opts.targetOffset)) {
    const safeOffset = Math.max(0, Math.floor(opts.targetOffset!))
    const containingPage = slices.findIndex((slice) => (
      slice.bodyEndInSlice >= 0
      && safeOffset >= slice.startChar
      && safeOffset < Math.max(slice.endChar, slice.startChar + 1)
    ))
    return containingPage >= 0 && slices.length > containingPage + extraPages
  }

  return slices.length > extraPages + 1
}

export function useReaderPaginator(opts: {
  containerRef: Ref<HTMLElement | null>
  fontSize: Ref<number>
  lineHeight: Ref<number>
  letterSpacing: Ref<number>
  fontWeight: Ref<number>
  fontFamily: Ref<string>
  textAlign: Ref<string>
  chapterTitleDisplay: Ref<string>
  marginX: Ref<number>
  marginTop: Ref<number>
  marginBottom: Ref<number>
  pageMode: Ref<'single' | 'double'>
  pIndent: Ref<number>
  pSpacing: Ref<number>
}) {
  const isCacheHit = ref(false)

  const capturePaginationSnapshot = (chapterId: number): PaginationSnapshot => {
    const cw = opts.containerRef.value?.clientWidth ?? 0
    const ch = opts.containerRef.value?.clientHeight ?? 0
    const metrics = computeReaderPageMetrics({
      containerWidth: cw,
      containerHeight: ch,
      pageMode: opts.pageMode.value,
      marginX: opts.marginX.value,
      marginTop: opts.marginTop.value,
      marginBottom: opts.marginBottom.value,
      fontSize: opts.fontSize.value,
      lineHeight: opts.lineHeight.value,
    })

    const snap: Omit<PaginationSnapshot, 'hash'> = {
      containerWidth: cw,
      containerHeight: ch,
      pageWidth: metrics.pageWidth,
      effectiveMarginX: metrics.effectiveMarginX,
      contentColumnWidth: metrics.contentColumnWidth,
      lineHeightPx: metrics.lineHeightPx,
      pageGridHeight: metrics.pageGridHeight,
      gridPaddingTop: metrics.gridPaddingTop,
      gridPaddingBottom: metrics.gridPaddingBottom,
      fontSize: opts.fontSize.value,
      lineHeight: opts.lineHeight.value,
      letterSpacing: opts.letterSpacing.value,
      fontWeight: opts.fontWeight.value,
      fontFamily: opts.fontFamily.value,
      textAlign: opts.textAlign.value,
      chapterTitleDisplay: opts.chapterTitleDisplay.value,
      marginX: opts.marginX.value,
      marginTop: opts.marginTop.value,
      marginBottom: opts.marginBottom.value,
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
    options: PrewarmOptions = {},
  ): Promise<PaginationResult | null> => {
    const key = cacheKey(chapterId, snapshot.hash)
    const cached = cachedPageSlicesMap.get(key)
    const wantsFull = options.mode !== 'partial'
    if (cached && (!wantsFull || cached.complete)) return cached
    if (snapshot.containerWidth <= 0 || snapshot.containerHeight <= 0 || snapshot.contentColumnWidth <= 0) return null
    const taskKey = [
      key,
      options.mode || 'full',
      options.targetPageIndex ?? '',
      options.targetOffset ?? '',
      options.extraPagesAfterTarget ?? '',
    ].join('|')
    const pending = pendingPaginationTasks.get(taskKey)
    if (pending) return pending
    const taskEpoch = cacheEpoch

    const task = (async (): Promise<PaginationResult | null> => {
      let measureRoot: ReturnType<typeof createMeasureRoot> | null = null
      try {
        measureRoot = createMeasureRoot(snapshot)
        await nextTick()
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

        const lines: PageLine[] = []
        const titleFontSize = snapshot.fontSize * 1.4
        const titleLineHeight = titleFontSize * 1.35
        if (title && snapshot.chapterTitleDisplay !== 'none') {
          lines.push(...splitMeasuredText({
            root: measureRoot.root,
            text: title,
            keyPrefix: 'title',
            kind: 'title',
            height: titleLineHeight,
            fontSize: titleFontSize,
            fontWeight: Math.max(700, snapshot.fontWeight),
            lineHeight: titleLineHeight,
            textAlign: snapshot.chapterTitleDisplay === 'center' ? 'center' : 'left',
            indentPx: 0,
            afterBlockSpacing: titleFontSize * 1.5,
            bodyOffset: -1,
          }))
        }

        const paragraphs = extractParagraphs(bodyHtml, bodyText)
        let bodyOffset = 0
        for (let index = 0; index < paragraphs.length; index++) {
          const paragraph = paragraphs[index]
          const isLastParagraph = index === paragraphs.length - 1
          lines.push(...splitMeasuredText({
            root: measureRoot.root,
            text: paragraph,
            keyPrefix: `body-${index}`,
            kind: 'body',
            height: snapshot.lineHeightPx,
            fontSize: snapshot.fontSize,
            fontWeight: snapshot.fontWeight,
            lineHeight: snapshot.lineHeightPx,
            textAlign: snapshot.textAlign,
            indentPx: snapshot.fontSize * snapshot.pIndent,
            afterBlockSpacing: isLastParagraph ? 0 : snapshot.fontSize * snapshot.pSpacing,
            bodyOffset,
          }))
          bodyOffset += paragraph.length + (isLastParagraph ? 0 : 1)

          if (index % 8 === 7) {
            const partialSlices = paginateLines(lines, snapshot.pageGridHeight, false)
            if (hasReachedPaginationGoal(partialSlices, options)) {
              const result = { slices: partialSlices, complete: false }
              if (taskEpoch !== cacheEpoch) return null
              cacheSet(key, result)
              return result
            }
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          }
        }

        const slices = paginateLines(lines, snapshot.pageGridHeight, true)
        const result = { slices, complete: true }
        if (taskEpoch !== cacheEpoch) return null
        cacheSet(key, result)
        return result
      } finally {
        if (measureRoot) measureRoot.destroy()
        pendingPaginationTasks.delete(taskKey)
      }
    })()

    pendingPaginationTasks.set(taskKey, task)
    return task
  }

  const getPagesForChapter = (chapterId: number, snapshotHash: string): {
    slices: PageSlice[] | null
    complete: boolean
    isCacheHit: boolean
  } => {
    cacheVersion.value
    const key = cacheKey(chapterId, snapshotHash)
    const result = cachedPageSlicesMap.get(key) ?? null
    isCacheHit.value = result !== null
    return { slices: result?.slices ?? null, complete: result?.complete ?? false, isCacheHit: result !== null }
  }

  const getCachedPageCount = (chapterId: number, snapshotHash: string): number | null => {
    cacheVersion.value
    const result = cachedPageSlicesMap.get(cacheKey(chapterId, snapshotHash))
    return result?.complete ? result.slices.length : null
  }

  const findPageForOffset = (slices: PageSlice[] | null | undefined, offset: number): number => {
    return findPageForOffsetInSlices(slices, offset)
  }

  const clearCache = (): void => {
    cachedPageSlicesMap.clear()
    cacheInsertionOrder.length = 0
    pendingPaginationTasks.clear()
    cacheEpoch += 1
    isCacheHit.value = false
    cacheVersion.value += 1
  }

  const cacheSize = computed(() => {
    cacheVersion.value
    return cachedPageSlicesMap.size
  })

  return {
    capturePaginationSnapshot,
    prewarmChapterText,
    getPagesForChapter,
    getCachedPageCount,
    findPageForOffset,
    isCacheHit,
    clearCache,
    cacheSize,
  }
}
