const normalizeExcerptText = (text: string) => text.replace(/\s+/g, ' ').trim()

export function buildRemoteProgressExcerpt(
  text: string,
  charOffset: number,
  maxChars = 64,
): string {
  if (!text || maxChars <= 0) return ''
  const safeOffset = Math.max(0, Math.min(Math.floor(charOffset || 0), text.length))
  const beforeChars = Math.max(1, Math.floor(maxChars / 3))
  const start = Math.max(0, safeOffset - beforeChars)
  const end = Math.min(text.length, start + maxChars)
  const excerpt = normalizeExcerptText(text.slice(start, end))
  if (!excerpt) return ''
  return `${start > 0 ? '…' : ''}${excerpt}${end < text.length ? '…' : ''}`
}

export function isSimilarRemoteProgress(
  remoteChapterIndex: number,
  remoteCharOffset: number,
  localChapterIndex: number,
  localCharOffset: number,
  maxOffsetDelta = 800,
): boolean {
  if (remoteChapterIndex !== localChapterIndex) return false
  return Math.abs(remoteCharOffset - localCharOffset) <= maxOffsetDelta
}
