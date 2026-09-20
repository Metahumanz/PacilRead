export type ChapterTextBackupMode = 'full' | 'incremental'

export interface ChapterTextLike {
  bookId?: unknown
  bodyTextPath?: unknown
  bodyTextStorage?: unknown
}

export function isFileGzipChapter(chapter: ChapterTextLike): boolean {
  const bodyTextPath = String(chapter.bodyTextPath || '').trim()
  if (!bodyTextPath) return false

  const storage = String(
    chapter.bodyTextStorage || (bodyTextPath ? 'file_gzip' : 'inline'),
  )

  return storage === 'file_gzip'
}

export function collectFileGzipBookIds(
  chapters: ChapterTextLike[],
): number[] {
  const ids = new Set<number>()

  for (const chapter of chapters) {
    if (!isFileGzipChapter(chapter)) continue

    const bookId = Number(chapter.bookId)
    if (Number.isFinite(bookId)) ids.add(bookId)
  }

  return Array.from(ids).sort((a, b) => a - b)
}

export interface ChapterTextManifestAssetIntegrity {
  size: number
  sha256?: string
}

export interface ChapterTextManifestAsset {
  key: string
  bookId: number
  integrity: ChapterTextManifestAssetIntegrity
}

export function collectManifestChapterTextAssets(
  assets: Record<string, ChapterTextManifestAssetIntegrity> | undefined,
): ChapterTextManifestAsset[] {
  if (!assets) return []

  const result: ChapterTextManifestAsset[] = []

  for (const [key, integrity] of Object.entries(assets)) {
    const match = /^chapter_text\/book_(\d+)\.zip$/.exec(key)
    if (!match) continue

    const bookId = Number(match[1])
    if (!Number.isFinite(bookId)) continue

    result.push({ key, bookId, integrity })
  }

  return result.sort((a, b) => a.bookId - b.bookId)
}

export function shouldSkipExistingChapterTextZip(
  mode: ChapterTextBackupMode,
  remoteExists: boolean,
): boolean {
  return mode === 'incremental' && remoteExists
}

export function isChapterTextZipRestoreComplete(
  extractedFiles: number,
  hasAllExpectedFiles: boolean,
): boolean {
  return extractedFiles > 0 && hasAllExpectedFiles
}

export function isChapterTextZipEntryCountValid(expectedCount: number, actualCount: number): boolean {
  return expectedCount > 0 && actualCount === expectedCount
}

export function formatChapterTextPreflightError(
  bookId: number,
  expectedCount: number,
  missingPaths: string[],
  corruptedPaths: string[],
): string {
  const details = [
    missingPaths.length > 0 ? `缺失：${missingPaths.join(', ')}` : '',
    corruptedPaths.length > 0 ? `损坏：${corruptedPaths.join(', ')}` : '',
  ].filter(Boolean).join('\n')
  return `书籍 ${bookId} 正文预检失败：预期 ${expectedCount} 章，缺失 ${missingPaths.length} 章，损坏 ${corruptedPaths.length} 章${details ? `\n${details}` : ''}`
}

export function shouldSkipSourceFileForSnapshot(
  strictSnapshot: boolean,
  expectedAsset: boolean,
): boolean {
  return strictSnapshot && !expectedAsset
}

export function formatOptionalAssetWarning(label: string, reason: string): string {
  return reason.includes('不存在')
    ? `${label} 本地不存在，已跳过`
    : `${label} 校验失败：${reason}，已跳过`
}
