export type ChapterTextBackupMode = 'full' | 'incremental'

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
