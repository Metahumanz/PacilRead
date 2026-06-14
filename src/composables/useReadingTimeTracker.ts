import { ref, type Ref } from 'vue'
import {
  appendReadingStatsDuration,
  ensureReadingStatsDeviceId,
  readingStatsIdleMs,
  uploadReadingStatsSnapshot,
} from './useReadingStats'
import { useSettings } from './useSettings'
import { splitRangeByDate } from '../utils/readingStats'

interface TrackableBook {
  title: string
  author: string | null
  reading_stats_key: string
}

export function useReadingTimeTracker(opts: {
  enabled: Ref<boolean>
  book: Ref<TrackableBook | null>
  getVisibleCharCount?: () => number
  getReadingPositionKey?: () => string
}) {
  const settings = useSettings()
  const isTracking = ref(false)

  let activeWindowStartAt: number | null = null
  let lastActivityAt: number | null = null
  let checkpointTimer: number | null = null
  let uploadTimer: number | null = null
  let pendingCharCount = 0
  let lastPositionKey: string | null = null

  const recordVisibleChars = () => {
    const positionKey = opts.getReadingPositionKey?.() || ''
    if (positionKey && positionKey === lastPositionKey) return
    const charCount = Math.max(0, Math.floor(opts.getVisibleCharCount?.() || 0))
    if (charCount > 0) pendingCharCount += charCount
    lastPositionKey = positionKey || lastPositionKey
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
    const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0)
    let remainingChars = pendingCharCount
    for (const row of rows) {
      const rowChars = totalSeconds > 0
        ? Math.min(remainingChars, Math.round(pendingCharCount * (row.seconds / totalSeconds)))
        : 0
      remainingChars -= rowChars
      await appendReadingStatsDuration({
        date: row.date,
        sourceDeviceId: deviceId,
        bookIdentity: book.reading_stats_key,
        bookTitle: book.title || '未命名',
        bookAuthor: book.author || '',
        durationSeconds: row.seconds,
        charCount: row === rows[rows.length - 1] ? rowChars + remainingChars : rowChars,
        updatedAt: Date.now(),
      })
    }
    pendingCharCount = 0

    if (persistUntil >= lastActivityAt + readingStatsIdleMs) {
      activeWindowStartAt = null
      lastActivityAt = null
      isTracking.value = false
      lastPositionKey = null
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
      recordVisibleChars()
      return
    }

    if (now > lastActivityAt + readingStatsIdleMs) {
      await persistWindow(now)
      activeWindowStartAt = now
    }

    lastActivityAt = now
    isTracking.value = true
    recordVisibleChars()
  }

  const start = async () => {
    if (!opts.enabled.value || !opts.book.value?.reading_stats_key) return
    if (checkpointTimer) window.clearInterval(checkpointTimer)

    const now = Date.now()
    activeWindowStartAt = now
    lastActivityAt = now
    isTracking.value = true
    recordVisibleChars()
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
