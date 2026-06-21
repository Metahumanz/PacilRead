export type ReaderPageMode = 'single' | 'double'

export function isDoublePageAvailable(width: number, height: number): boolean {
  return Number.isFinite(width) && Number.isFinite(height) && width > height
}

export function resolveReaderPageMode(
  preferredMode: ReaderPageMode,
  width: number,
  height: number,
): ReaderPageMode {
  return preferredMode === 'double' && isDoublePageAvailable(width, height) ? 'double' : 'single'
}
