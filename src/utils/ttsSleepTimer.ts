export const TTS_SLIDER_MAX_MINUTES = 180
export const TTS_SLIDER_STEP_MINUTES = 5

export function ttsSliderProgressToMs(progress: number): number {
  const safe = Math.max(0, Math.min(Math.round(progress), TTS_SLIDER_MAX_MINUTES / TTS_SLIDER_STEP_MINUTES))
  return safe * TTS_SLIDER_STEP_MINUTES * 60_000
}

export function ttsMsToSliderProgress(ms: number): number {
  if (ms <= 0) return 0
  return Math.max(1, Math.min(36, Math.round(ms / (TTS_SLIDER_STEP_MINUTES * 60_000))))
}

export function ttsPreciseToMs(hours: number, minutes: number, seconds: number): number {
  const h = Math.max(0, Math.min(23, Math.floor(hours || 0)))
  const m = Math.max(0, Math.min(59, Math.floor(minutes || 0)))
  const s = Math.max(0, Math.min(59, Math.floor(seconds || 0)))
  return (h * 3600 + m * 60 + s) * 1000
}

export function ttsMsToPrecise(ms: number): [number, number, number] {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  return [
    Math.min(23, Math.floor(totalSeconds / 3600)),
    Math.floor(totalSeconds / 60) % 60,
    totalSeconds % 60,
  ]
}

export function ttsDeadlineFrom(now: number, durationMs: number): number {
  return durationMs > 0 ? Math.max(0, now) + durationMs : 0
}

export function ttsRemaining(now: number, deadline: number): number {
  return deadline > 0 ? Math.max(0, deadline - Math.max(0, now)) : 0
}
