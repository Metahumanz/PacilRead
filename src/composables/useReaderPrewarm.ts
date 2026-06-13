import type { Ref } from 'vue'
import type { ReaderChapter } from '../types/entities'
import { perfLog, perfNow } from '../utils/perf'

interface PrewarmOptions {
  mode?: 'partial' | 'full'
  targetPageIndex?: number
  targetOffset?: number
  extraPagesAfterTarget?: number
}

interface ReaderPaginatorLike {
  capturePaginationSnapshot: (chapterId: number) => any
  prewarmChapterText: (
    chapterId: number,
    bodyHtml: string,
    bodyText: string,
    title: string,
    snapshot: any,
    options?: PrewarmOptions,
  ) => Promise<{ complete: boolean; slices: unknown[] } | null>
}

export function useReaderPrewarm(opts: {
  chapters: Ref<ReaderChapter[]>
  currentChapterIndex: Ref<number>
  ensureChapterContent: (chapterIndex: number) => Promise<ReaderChapter | null>
  ensureChapterContents: (chapterIndexes: number[]) => Promise<void>
  paginator: ReaderPaginatorLike
  applyReplacements: (html: string) => string
}) {
  const prewarmChapterAt = async (index: number, options: PrewarmOptions = {}) => {
    const loaded = await opts.ensureChapterContent(index)
    if (!loaded) return null
    const chapter = opts.chapters.value[index]
    if (!chapter) return Promise.resolve(null)
    const snapshot = opts.paginator.capturePaginationSnapshot(chapter.id)
    const body = opts.applyReplacements(chapter.body || '')
    const startedAt = perfNow()
    const result = await opts.paginator.prewarmChapterText(
      chapter.id,
      body,
      chapter.body_text || '',
      chapter.title,
      snapshot,
      options,
    )
    perfLog('reader:paginateChapter', startedAt, `chapter=${chapter.id} complete=${result?.complete ? '1' : '0'} pages=${result?.slices.length || 0}`)
    return result
  }

  const prewarmNearbyChapters = () => {
    opts.ensureChapterContents([opts.currentChapterIndex.value - 1, opts.currentChapterIndex.value + 1]).then(() => {
      prewarmChapterAt(opts.currentChapterIndex.value - 1)
      prewarmChapterAt(opts.currentChapterIndex.value + 1)
    })
  }

  return {
    prewarmChapterAt,
    prewarmNearbyChapters,
  }
}
