export interface ReaderPageMetricsInput {
  containerWidth: number
  containerHeight: number
  pageMode: string
  marginX: number
  marginY: number
  fontSize: number
  lineHeight: number
}

export interface ReaderPageMetrics {
  pageWidth: number
  effectiveMarginX: number
  contentColumnWidth: number
  lineHeightPx: number
  availableHeight: number
  pageGridLineCount: number
  pageGridHeight: number
  gridPaddingY: number
}

const finiteNumber = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback
const roundPx = (value: number) => Math.round(value * 1000) / 1000

export function computeReaderPageMetrics(input: ReaderPageMetricsInput): ReaderPageMetrics {
  const containerWidth = Math.max(0, finiteNumber(input.containerWidth))
  const containerHeight = Math.max(0, finiteNumber(input.containerHeight))
  const requestedMarginX = Math.max(0, finiteNumber(input.marginX))
  const requestedMarginY = Math.max(0, finiteNumber(input.marginY))
  const safeFontSize = Math.max(1, finiteNumber(input.fontSize, 20))
  const safeLineHeight = Math.max(0.1, finiteNumber(input.lineHeight, 1.8))

  const pageWidth = Math.max(1, input.pageMode === 'double' ? containerWidth / 2 : containerWidth)
  const maxMarginX = Math.max(0, (pageWidth - 1) / 2)
  const effectiveMarginX = Math.min(requestedMarginX, maxMarginX)
  const contentColumnWidth = Math.max(1, pageWidth - effectiveMarginX * 2)
  const lineHeightPx = Math.max(1, safeFontSize * safeLineHeight)
  const availableHeight = Math.max(0, containerHeight - requestedMarginY * 2)
  const pageGridLineCount = Math.max(1, Math.floor(Math.max(availableHeight, lineHeightPx) / lineHeightPx))
  const pageGridHeight = Math.max(1, availableHeight)
  const gridPaddingY = requestedMarginY

  return {
    pageWidth: roundPx(pageWidth),
    effectiveMarginX: roundPx(effectiveMarginX),
    contentColumnWidth: roundPx(contentColumnWidth),
    lineHeightPx: roundPx(lineHeightPx),
    availableHeight: roundPx(availableHeight),
    pageGridLineCount,
    pageGridHeight: roundPx(pageGridHeight),
    gridPaddingY: roundPx(gridPaddingY),
  }
}
