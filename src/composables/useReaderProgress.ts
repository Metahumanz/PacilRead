import type { ComputedRef, Ref } from 'vue'
import type { ReaderBook, ReaderChapter } from '../types/entities'
import { perfLog, perfNow } from '../utils/perf'

interface WebdavProgressPayload {
  bookId: number
  title: string
  author: string
  currentChapterIndex: number
  currentChapterTitle: string
  currentChapterBodyLength: number
  currentChapterOffset?: number
  currentPage: number
  totalPages: number
  pendingWebdavPos: number
}

export function useReaderProgress(opts: {
  bookId: number
  book: Ref<ReaderBook | null>
  currentChapterIndex: Ref<number>
  currentChapterData: ComputedRef<ReaderChapter | null>
  getCurrentPage: () => number
  getTotalPages: () => number
  getPendingWebdavPos: () => number
  getChapterOffset: () => number
  uploadProgressToWebdav: (context: WebdavProgressPayload) => void | Promise<void>
}) {
  let progressSaveTimer: number | null = null
  let progressReady = false

  const setProgressReady = (ready: boolean) => {
    progressReady = ready
  }

  const persistProgressNow = async () => {
    if (progressSaveTimer) {
      window.clearTimeout(progressSaveTimer)
      progressSaveTimer = null
    }
    if (!opts.book.value) return
    if (!progressReady) return
    const startedAt = perfNow()
    try {
      await window.electronAPI.library.updateBook(opts.bookId, {
        progressIndex: opts.currentChapterIndex.value,
        progressOffset: opts.getCurrentPage(),
        lastReadAt: Date.now(),
        currentChapterTitle: opts.currentChapterData.value?.title || '',
      })

      await opts.uploadProgressToWebdav({
        bookId: opts.bookId,
        title: opts.book.value.title,
        author: opts.book.value.author || '',
        currentChapterIndex: opts.currentChapterIndex.value,
        currentChapterTitle: opts.currentChapterData.value?.title || '',
        currentChapterBodyLength: opts.currentChapterData.value?.body_text?.length || 0,
        currentChapterOffset: opts.getChapterOffset(),
        currentPage: opts.getCurrentPage(),
        totalPages: opts.getTotalPages(),
        pendingWebdavPos: opts.getPendingWebdavPos(),
      })
    } catch (e) { console.error(e) }
    finally { perfLog('reader:saveProgress', startedAt, `book=${opts.bookId}`) }
  }

  const saveProgress = () => {
    if (progressSaveTimer) window.clearTimeout(progressSaveTimer)
    progressSaveTimer = window.setTimeout(() => {
      persistProgressNow().catch((error) => console.error('Persist progress failed:', error))
    }, 400)
  }

  const flushProgress = async () => {
    await persistProgressNow()
  }

  return {
    setProgressReady,
    saveProgress,
    flushProgress,
    persistProgressNow,
  }
}
