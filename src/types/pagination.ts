export interface PageSlice {
  pageIndex: number
  startChar: number
  endChar: number
  charCount: number
  isLast: boolean
}

export type FlipMode = 'slide' | 'cover' | 'simulation' | 'scroll' | 'none'

export type PagingDirection = -1 | 1

export interface PagingTarget {
  chapterIndex: number
  pageIndex: number
}

export interface PagingAnimationState {
  active: boolean
  phase: 'idle' | 'dragging' | 'settling'
  mode: FlipMode
  direction: PagingDirection
  progress: number
  touchYRatio: number
  currentSnapshotHtml: string
}

export interface PaginationSnapshot {
  containerWidth: number
  containerHeight: number
  pageWidth: number
  effectiveMarginX: number
  contentColumnWidth: number
  lineHeightPx: number
  pageGridHeight: number
  gridPaddingY: number
  fontSize: number
  lineHeight: number
  letterSpacing: number
  fontWeight: number
  fontFamily: string
  textAlign: string
  chapterTitleDisplay: string
  marginX: number
  marginY: number
  pageMode: string
  pIndent: number
  pSpacing: number
  chapterId: number
  hash: string
}
