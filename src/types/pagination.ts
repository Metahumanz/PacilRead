export type PageLineKind = 'title' | 'body'

export interface PageLine {
  key: string
  kind: PageLineKind
  text: string
  bodyStart: number
  bodyEnd: number
  height: number
  afterSpacing: number
  indentPx: number
  textAlign: string
  isParagraphStart: boolean
  isParagraphEnd: boolean
}

export interface PageSlice {
  pageIndex: number
  startChar: number
  endChar: number
  charCount: number
  isLast: boolean
  text: string
  lines: PageLine[]
  bodyStartInSlice: number
  bodyEndInSlice: number
  baseHeight: number
  extraLineGap: number
}

export interface PaginationResult {
  slices: PageSlice[]
  complete: boolean
}

export type FlipMode = 'slide' | 'cover' | 'simulation' | 'scroll' | 'none'
export type SimulationDoublePageTurnMode = 'outerPage' | 'spread'

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
  touchXRatio: number
  touchYRatio: number
  grabXRatio: number
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
  gridPaddingTop: number
  gridPaddingBottom: number
  fontSize: number
  lineHeight: number
  letterSpacing: number
  fontWeight: number
  fontFamily: string
  textAlign: string
  chapterTitleDisplay: string
  marginX: number
  marginTop: number
  marginBottom: number
  pageMode: string
  pIndent: number
  pSpacing: number
  chapterId: number
  hash: string
}
