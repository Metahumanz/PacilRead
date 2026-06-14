export interface ReadingStatsDateSegment {
  date: string
  seconds: number
}

function toLocalDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function splitRangeByDate(startMs: number, endMs: number): ReadingStatsDateSegment[] {
  const segments: ReadingStatsDateSegment[] = []
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
      0,
    ).getTime()
    const segmentEnd = Math.min(endMs, endOfDay)
    const durationSeconds = Math.floor((segmentEnd - cursor) / 1000)
    if (durationSeconds > 0) {
      segments.push({
        date: toLocalDateString(currentDate),
        seconds: durationSeconds,
      })
    }
    cursor = segmentEnd
  }

  return segments
}
