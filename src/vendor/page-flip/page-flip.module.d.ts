export type FlipCorner = 'top' | 'bottom'

export interface PageFlipEvent<T = unknown> {
  data: T
  object: PageFlip
}

export interface PageFlipSettings {
  width: number
  height: number
  size?: 'fixed' | 'stretch'
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  maxShadowOpacity?: number
  showCover?: boolean
  mobileScrollSupport?: boolean
  showPageCorners?: boolean
  disableFlipByClick?: boolean
  flippingTime?: number
  swipeDistance?: number
  useMouseEvents?: boolean
  clickEventForward?: boolean
  startPage?: number
}

export class PageFlip {
  constructor(block: HTMLElement, settings: PageFlipSettings)
  destroy(): void
  loadFromHTML(items: NodeListOf<Element> | Element[]): void
  updateFromHtml(items: NodeListOf<Element> | Element[]): void
  flipNext(corner?: FlipCorner): void
  flipPrev(corner?: FlipCorner): void
  flip(page: number, corner?: FlipCorner): void
  turnToPage(page: number): void
  getPageCount(): number
  getCurrentPageIndex(): number
  getRender(): any
  getFlipController(): any
  getState(): string
  on<T = unknown>(event: string, callback: (event: PageFlipEvent<T>) => void): PageFlip
  off(event: string): void
  startUserTouch(point: { x: number; y: number }): void
}
