export interface PageSlice {
  pageIndex: number
  startChar: number
  endChar: number
  charCount: number
  isLast: boolean
}

export interface PaginationSnapshot {
  containerWidth: number
  containerHeight: number
  pageWidth: number
  fontSize: number
  lineHeight: number
  letterSpacing: number
  fontWeight: number
  fontFamily: string
  textAlign: string
  marginX: number
  marginY: number
  pageMode: string
  pIndent: number
  pSpacing: number
  chapterId: number
  hash: string
}
