import { computed, onMounted, onUnmounted, ref } from 'vue'

const MIN_REFRESH_RATE = 24
const MAX_REFRESH_RATE = 360
const DEFAULT_REFRESH_RATE = 60
const SAMPLE_WINDOW_SIZE = 36
const MIN_SAMPLE_COUNT = 12
const PUBLISH_EVERY_FRAMES = 12

const normalizeRefreshRate = (value: unknown, fallback = DEFAULT_REFRESH_RATE) => {
  const hz = Number(value)
  if (!Number.isFinite(hz) || hz < MIN_REFRESH_RATE || hz > MAX_REFRESH_RATE) return fallback
  return Math.round(hz)
}

const estimateRefreshRate = (intervals: number[]) => {
  if (intervals.length < MIN_SAMPLE_COUNT) return 0
  const sorted = [...intervals].sort((a, b) => a - b)
  const trim = Math.floor(sorted.length * 0.15)
  const samples = sorted.slice(trim, sorted.length - trim || sorted.length)
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return normalizeRefreshRate(1000 / average, 0)
}

export function useDisplayRefreshRate() {
  const displayRefreshRate = ref(DEFAULT_REFRESH_RATE)
  const measuredRefreshRate = ref(0)
  const effectiveRefreshRate = computed(() => (
    measuredRefreshRate.value > 0
      ? measuredRefreshRate.value
      : displayRefreshRate.value
  ))

  let animationFrame: number | null = null
  let lastTimestamp = 0
  let publishFrameCount = 0
  let samplesRemaining = 0
  let removeDisplayRefreshRateListener: (() => void) | null = null
  const frameIntervals: number[] = []

  const resetMeasuredRate = () => {
    frameIntervals.length = 0
    lastTimestamp = 0
    publishFrameCount = 0
    samplesRemaining = 0
    measuredRefreshRate.value = 0
  }

  const publishMeasuredRate = () => {
    const next = estimateRefreshRate(frameIntervals)
    if (next > 0 && Math.abs(next - measuredRefreshRate.value) >= 1) {
      measuredRefreshRate.value = next
    }
  }

  const tick = (timestamp: number) => {
    if (lastTimestamp > 0) {
      const interval = timestamp - lastTimestamp
      if (interval >= 2 && interval <= 100) {
        frameIntervals.push(interval)
        if (frameIntervals.length > SAMPLE_WINDOW_SIZE) frameIntervals.shift()
        publishFrameCount += 1
        if (publishFrameCount >= PUBLISH_EVERY_FRAMES) {
          publishFrameCount = 0
          publishMeasuredRate()
        }
      } else {
        resetMeasuredRate()
      }
    }
    lastTimestamp = timestamp
    samplesRemaining -= 1
    if (samplesRemaining <= 0 && frameIntervals.length >= MIN_SAMPLE_COUNT) {
      publishMeasuredRate()
      animationFrame = null
      return
    }
    animationFrame = requestAnimationFrame(tick)
  }

  const startSampling = () => {
    if (animationFrame !== null || document.visibilityState === 'hidden') return
    samplesRemaining = SAMPLE_WINDOW_SIZE + 1
    lastTimestamp = 0
    animationFrame = requestAnimationFrame(tick)
  }

  const stopSampling = () => {
    if (animationFrame === null) return
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  const refreshDisplayRate = async () => {
    try {
      const hz = await window.electronAPI?.win?.getDisplayRefreshRate?.()
      displayRefreshRate.value = normalizeRefreshRate(hz)
    } catch {
      displayRefreshRate.value = DEFAULT_REFRESH_RATE
    }
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      stopSampling()
      return
    }
    resampleRefreshRate()
  }

  const resampleRefreshRate = () => {
    resetMeasuredRate()
    refreshDisplayRate()
    startSampling()
  }

  onMounted(() => {
    resampleRefreshRate()
    removeDisplayRefreshRateListener = window.electronAPI?.win?.onDisplayRefreshRateChanged?.((hz: number) => {
      displayRefreshRate.value = normalizeRefreshRate(hz)
      resetMeasuredRate()
      startSampling()
    }) ?? null
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', resampleRefreshRate)
    window.addEventListener('resize', resampleRefreshRate)
  })

  onUnmounted(() => {
    stopSampling()
    removeDisplayRefreshRateListener?.()
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('focus', resampleRefreshRate)
    window.removeEventListener('resize', resampleRefreshRate)
  })

  return {
    displayRefreshRate,
    measuredRefreshRate,
    effectiveRefreshRate,
  }
}
