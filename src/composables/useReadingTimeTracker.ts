import { ref, type Ref } from 'vue'
import {
  appendReadingStatsDuration,
  ensureReadingStatsDeviceId,
  readingStatsIdleMs,
  uploadReadingStatsSnapshot,
} from './useReadingStats'
import { useSettings } from './useSettings'

interface TrackableBook {
  title: string
  author: string | null
  reading_stats_key: string
}

export function useReadingTimeTracker(opts: {
  enabled: Ref<boolean>
  book: Ref<TrackableBook | null>
}) {
  const settings = useSettings()
  const isTracking = ref(false)

  let activeWindowStartAt: number | null = null
  let lastActivityAt: number | null = null
  let checkpointTimer: number | null = null
  let uploadTimer: number | null = null

  const splitRangeByDate = (startMs: number, endMs: number) => {
    const segments: Array<{ date: string; seconds: number }> = []
    let cursor = startMs

    while (cursor < endMs) {
      const currentDate = new Date(cursor)
      const endOfDay = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() + 1,
        0,
        0,
        0,
        0
      ).getTime()
      const segmentEnd = Math.min(endMs, endOfDay)
      const durationSeconds = Math.floor((segmentEnd - cursor) / 1000)
      if (durationSeconds > 0) {
        const month = String(currentDate.getMonth() + 1).padStart(2, '0')
        const day = String(currentDate.getDate()).padStart(2, '0')
        segments.push({
          date: `${currentDate.getFullYear()}-${month}-${day}`,
          seconds: durationSeconds,
        })
      }
      cursor = segmentEnd
    }

    return segments
  }

  const scheduleUpload = () => {
    if (!settings.webdavSync.value || !settings.webdavUrl.value) return
    if (uploadTimer) window.clearTimeout(uploadTimer)
    uploadTimer = window.setTimeout(() => {
      uploadReadingStatsSnapshot().catch((error) => {
        console.error('Upload reading stats snapshot failed:', error)
      })
    }, 1500)
  }

  const persistWindow = async (persistUntil: number) => {
    if (!activeWindowStartAt || !lastActivityAt) return false
    const book = opts.book.value
    if (!book?.reading_stats_key) return false

    const effectiveEnd = Math.min(persistUntil, lastActivityAt + readingStatsIdleMs)
    if (effectiveEnd <= activeWindowStartAt) return false

    const deviceId = await ensureReadingStatsDeviceId()
    const rows = splitRangeByDate(activeWindowStartAt, effectiveEnd)
    for (const row of rows) {
      await appendReadingStatsDuration({
        date: row.date,
        sourceDeviceId: deviceId,
        bookIdentity: book.reading_stats_key,
        bookTitle: book.title || '未命名',
        bookAuthor: book.author || '',
        durationSeconds: row.seconds,
        charCount: 0,
        updatedAt: Date.now(),
      })
    }

    if (persistUntil >= lastActivityAt + readingStatsIdleMs) {
      activeWindowStartAt = null
      lastActivityAt = null
      isTracking.value = false
    } else {
      activeWindowStartAt = effectiveEnd
    }

    scheduleUpload()
    return rows.length > 0
  }

  const flush = async (persistUntil = Date.now()) => {
    if (!opts.enabled.value) return false
    return persistWindow(persistUntil)
  }

  const signalActivity = async () => {
    if (!opts.enabled.value) return
    const book = opts.book.value
    if (!book?.reading_stats_key) return

    const now = Date.now()
    if (activeWindowStartAt === null || lastActivityAt === null) {
      activeWindowStartAt = now
      lastActivityAt = now
      isTracking.value = true
      return
    }

    if (now > lastActivityAt + readingStatsIdleMs) {
      await persistWindow(now)
      activeWindowStartAt = now
    }

    lastActivityAt = now
    isTracking.value = true
  }

  const start = async () => {
    if (!opts.enabled.value || !opts.book.value?.reading_stats_key) return
    if (checkpointTimer) window.clearInterval(checkpointTimer)

    const now = Date.now()
    activeWindowStartAt = now
    lastActivityAt = now
    isTracking.value = true
    checkpointTimer = window.setInterval(() => {
      flush().catch((error) => {
        console.error('Reading stats checkpoint flush failed:', error)
      })
    }, readingStatsIdleMs)
  }

  const stop = async () => {
    if (checkpointTimer) window.clearInterval(checkpointTimer)
    checkpointTimer = null
    if (uploadTimer) window.clearTimeout(uploadTimer)
    uploadTimer = null
    await flush()
    activeWindowStartAt = null
    lastActivityAt = null
    isTracking.value = false
  }

  return {
    isTracking,
    start,
    stop,
    flush,
    signalActivity,
  }
}
