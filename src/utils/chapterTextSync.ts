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
