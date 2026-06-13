import type { PageSlice } from '../types/pagination'

export function findPageForOffsetInSlices(slices: PageSlice[] | null | undefined, offset: number): number {
  if (!slices || slices.length === 0) return 0
  const safeOffset = Math.max(0, offset)
  const found = slices.findIndex((slice) => (
    slice.bodyEndInSlice >= 0
    && safeOffset >= slice.startChar
    && safeOffset < Math.max(slice.endChar, slice.startChar + 1)
  ))
  if (found >= 0) return found
  return safeOffset >= slices[slices.length - 1].endChar ? slices.length - 1 : 0
}
