import type { Ref } from 'vue'
import type { ChapterContentPayload, ReaderChapter } from '../types/entities'
import { perfLog, perfNow } from '../utils/perf'

const CHAPTER_CONTENT_CACHE_MAX_ENTRIES = 12
const CHAPTER_CONTENT_CACHE_MAX_BYTES = 32 * 1024 * 1024

export function useChapterContentCache(opts: {
  bookId: number
  chapters: Ref<ReaderChapter[]>
  currentChapterIndex: Ref<number>
}) {
  const chapterContentCache = new Map<number, ChapterContentPayload & { estimatedBytes: number }>()
  const pendingChapterContentLoads = new Map<number, Promise<ReaderChapter | null>>()
  let chapterContentCacheBytes = 0

  const estimateChapterPayloadBytes = (content: ChapterContentPayload) => (
    content.body_text_size && content.body_text_size > 0
      ? content.body_text_size
      : (content.body_text?.length || 0) * 2 + (content.body?.length || 0) * 2
  )

  const clearChapterInlineContent = (chapterId: number) => {
    const idx = opts.chapters.value.findIndex((chapter) => chapter.id === chapterId)
    if (idx < 0) return
    const chapter = opts.chapters.value[idx]
    opts.chapters.value[idx] = {
      ...chapter,
      body: '',
      body_text: '',
      body_text_loaded: false,
    }
  }

  const pruneChapterContentCache = () => {
    const protectedIds = new Set<number>()
    for (const index of [opts.currentChapterIndex.value - 1, opts.currentChapterIndex.value, opts.currentChapterIndex.value + 1]) {
      const chapter = opts.chapters.value[index]
      if (chapter) protectedIds.add(chapter.id)
    }

    while (
      chapterContentCache.size > CHAPTER_CONTENT_CACHE_MAX_ENTRIES
      || chapterContentCacheBytes > CHAPTER_CONTENT_CACHE_MAX_BYTES
    ) {
      const victim = Array.from(chapterContentCache.keys()).find((id) => !protectedIds.has(id))
      if (victim === undefined) break
      const removed = chapterContentCache.get(victim)
      if (removed) chapterContentCacheBytes -= removed.estimatedBytes
      chapterContentCache.delete(victim)
      clearChapterInlineContent(victim)
    }
  }

  const mergeChapterContent = (content: ChapterContentPayload): ReaderChapter | null => {
    const idx = opts.chapters.value.findIndex((chapter) => chapter.id === content.id)
    if (idx < 0) return null
    const estimatedBytes = estimateChapterPayloadBytes(content)
    const previous = chapterContentCache.get(content.id)
    if (previous) chapterContentCacheBytes -= previous.estimatedBytes
    chapterContentCache.set(content.id, { ...content, estimatedBytes })
    chapterContentCacheBytes += estimatedBytes

    const chapter = {
      ...opts.chapters.value[idx],
      ...content,
      body_text_loaded: true,
    }
    opts.chapters.value[idx] = chapter
    pruneChapterContentCache()
    return chapter
  }

  const ensureChapterContent = async (chapterIndex: number): Promise<ReaderChapter | null> => {
    const chapter = opts.chapters.value[chapterIndex]
    if (!chapter) return null
    if (chapter.body_text_loaded && chapter.body_text !== undefined && chapter.body !== undefined) return chapter

    const cached = chapterContentCache.get(chapter.id)
    if (cached) return mergeChapterContent(cached)

    const pending = pendingChapterContentLoads.get(chapter.id)
    if (pending) return pending

    const startedAt = perfNow()
    const loadPromise = window.electronAPI.library
      .getChapterContentBatch(opts.bookId, [chapter.id])
      .then((items) => {
        const item = (items as ChapterContentPayload[])[0]
        return item ? mergeChapterContent(item) : null
      })
      .catch((error) => {
        console.error('Load chapter content failed:', error)
        return null
      })
      .finally(() => {
        pendingChapterContentLoads.delete(chapter.id)
        perfLog('reader:loadChapterContent', startedAt, `chapter=${chapter.id}`)
      })
    pendingChapterContentLoads.set(chapter.id, loadPromise)
    return loadPromise
  }

  const ensureChapterContents = async (chapterIndexes: number[]): Promise<void> => {
    const unique = Array.from(new Set(chapterIndexes))
      .map((index) => opts.chapters.value[index])
      .filter(Boolean)
    const missing = unique.filter((chapter) => (
      !chapter.body_text_loaded
      && !chapterContentCache.has(chapter.id)
      && !pendingChapterContentLoads.has(chapter.id)
    ))
    if (missing.length === 0) return

    const startedAt = perfNow()
    const ids = missing.map((chapter) => chapter.id)
    const batchPromise = window.electronAPI.library
      .getChapterContentBatch(opts.bookId, ids)
      .then((items) => {
        for (const item of items as ChapterContentPayload[]) {
          mergeChapterContent(item)
        }
      })
      .catch((error) => {
        console.error('Load chapter content batch failed:', error)
      })
      .finally(() => {
        for (const id of ids) pendingChapterContentLoads.delete(id)
        perfLog('reader:loadChapterContentBatch', startedAt, `count=${ids.length}`)
      })

    for (const chapter of missing) {
      pendingChapterContentLoads.set(
        chapter.id,
        batchPromise.then(() => opts.chapters.value.find((item) => item.id === chapter.id) || null),
      )
    }
    await batchPromise
  }

  return {
    ensureChapterContent,
    ensureChapterContents,
    mergeChapterContent,
    pruneChapterContentCache,
  }
}
