import { isProgressOffsetKind, type ProgressOffsetKind } from './bookMetadata'

export interface RestoredReadingPosition {
  pageIndex: number
  charOffset: number | null
}

function normalizeOffset(value: unknown): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}

/**
 * New desktop records save a character offset, which remains stable across
 * pagination changes. Records without a kind were created by older desktop
 * versions and contain a page index, so retain their best-effort behaviour.
 */
export function restoreReadingPosition(
  progressOffset: unknown,
  progressOffsetKind: unknown,
): RestoredReadingPosition {
  const offset = normalizeOffset(progressOffset)
  const kind: ProgressOffsetKind | null = isProgressOffsetKind(progressOffsetKind)
    ? progressOffsetKind
    : null

  return kind === 'char'
    ? { pageIndex: 0, charOffset: offset }
    : { pageIndex: offset, charOffset: null }
}
