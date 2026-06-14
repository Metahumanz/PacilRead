export interface ReadingStatsInsightRow {
  date: string
  bookIdentity: string
  bookTitle: string
  bookAuthor: string
  durationSeconds: number
  charCount: number
  updatedAt: number
}

export interface ReadingInsightBook {
  id: number
  title: string
  author: string | null
  readingStatsKey: string
  progressIndex: number
  progressOffset: number
  chapterCount: number
  lastReadAt: number
  coverFile?: string | null
  tags?: string[]
  series?: string
  readingStatus?: string
}

export interface ReadingInsightChapter {
  bookId: number
  orderIndex: number
  bodyTextSize: number
}

export interface ReadingCalendarDay {
  date: string
  durationSeconds: number
  charCount: number
}

export interface ReadingSpeedStats {
  durationSeconds: number
  charCount: number
  charsPerMinute: number
  hasEnoughData: boolean
}

export interface EstimatedFinish {
  remainingChars: number
  remainingSeconds: number | null
  finishAt: string | null
  message: string
}

export interface AnnualReadingReport {
  year: number
  totalSeconds: number
  totalChars: number
  readingDays: number
  longestStreak: number
  finishedBooks: number
  topBooks: Array<{ title: string; author: string; totalSeconds: number; charCount: number }>
  topAuthors: Array<{ name: string; totalSeconds: number }>
  topTags: Array<{ name: string; totalSeconds: number }>
  topSeries: Array<{ name: string; totalSeconds: number }>
  monthly: Array<{ month: string; totalSeconds: number; charCount: number }>
}

function todayString(): string {
  return toDateString(new Date())
}

export function toDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, Math.max(0, month - 1), day)
}

function startOfYear(year: number): string {
  return `${year}-01-01`
}

function endOfYear(year: number): string {
  return `${year}-12-31`
}

function inDateRange(row: ReadingStatsInsightRow, start: string, end: string, bookIdentity?: string | null): boolean {
  if (row.date < start || row.date > end) return false
  if (bookIdentity && row.bookIdentity !== bookIdentity) return false
  return true
}

function rowsInRecentDays(rows: ReadingStatsInsightRow[], days: number, bookIdentity?: string | null): ReadingStatsInsightRow[] {
  const end = todayString()
  const start = toDateString(addDays(parseDate(end), -Math.max(0, days - 1)))
  return rows.filter(row => inDateRange(row, start, end, bookIdentity))
}

export function buildReadingCalendar(
  rows: ReadingStatsInsightRow[],
  options: { year?: number; bookIdentity?: string | null } = {},
): ReadingCalendarDay[] {
  const year = options.year ?? new Date().getFullYear()
  const byDate = new Map<string, ReadingCalendarDay>()
  for (const row of rows) {
    if (!inDateRange(row, startOfYear(year), endOfYear(year), options.bookIdentity)) continue
    const entry = byDate.get(row.date) || { date: row.date, durationSeconds: 0, charCount: 0 }
    entry.durationSeconds += Number(row.durationSeconds || 0)
    entry.charCount += Number(row.charCount || 0)
    byDate.set(row.date, entry)
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

export function calculateLongestStreak(days: ReadingCalendarDay[]): number {
  const activeDates = days
    .filter(day => day.durationSeconds > 0)
    .map(day => day.date)
    .sort()
  let best = 0
  let current = 0
  let previous: string | null = null

  for (const date of activeDates) {
    if (!previous) {
      current = 1
    } else {
      const expected = toDateString(addDays(parseDate(previous), 1))
      current = date === expected ? current + 1 : 1
    }
    best = Math.max(best, current)
    previous = date
  }
  return best
}

export function calculateReadingSpeed(
  rows: ReadingStatsInsightRow[],
  options: { days?: number; bookIdentity?: string | null } = {},
): ReadingSpeedStats {
  const relevantRows = rowsInRecentDays(rows, options.days ?? 7, options.bookIdentity)
  const durationSeconds = relevantRows.reduce((sum, row) => sum + Number(row.durationSeconds || 0), 0)
  const charCount = relevantRows.reduce((sum, row) => sum + Number(row.charCount || 0), 0)
  const charsPerMinute = durationSeconds > 0 ? charCount / (durationSeconds / 60) : 0
  return {
    durationSeconds,
    charCount,
    charsPerMinute,
    hasEnoughData: durationSeconds >= 60 && charCount > 0,
  }
}

export function estimateBookProgressChars(
  book: ReadingInsightBook,
  chapters: ReadingInsightChapter[],
): { totalChars: number; readChars: number; remainingChars: number } {
  const bookChapters = chapters
    .filter(chapter => Number(chapter.bookId) === Number(book.id))
    .sort((a, b) => Number(a.orderIndex || 0) - Number(b.orderIndex || 0))
  const totalChars = bookChapters.reduce((sum, chapter) => sum + Math.max(0, Number(chapter.bodyTextSize || 0)), 0)
  let readChars = 0
  for (const chapter of bookChapters) {
    if (chapter.orderIndex < book.progressIndex) {
      readChars += Math.max(0, Number(chapter.bodyTextSize || 0))
    } else if (chapter.orderIndex === book.progressIndex) {
      readChars += Math.max(0, Math.min(Number(book.progressOffset || 0), Number(chapter.bodyTextSize || 0)))
    }
  }
  const remainingChars = Math.max(0, totalChars - readChars)
  return { totalChars, readChars, remainingChars }
}

export function estimateFinishTime(args: {
  book: ReadingInsightBook
  chapters: ReadingInsightChapter[]
  rows: ReadingStatsInsightRow[]
  days?: number
}): EstimatedFinish {
  const progress = estimateBookProgressChars(args.book, args.chapters)
  const speed = calculateReadingSpeed(args.rows, {
    days: args.days ?? 7,
    bookIdentity: args.book.readingStatsKey,
  })

  if (progress.remainingChars <= 0 || args.book.readingStatus === 'finished') {
    return {
      remainingChars: 0,
      remainingSeconds: 0,
      finishAt: null,
      message: '已读完',
    }
  }

  if (!speed.hasEnoughData || speed.charsPerMinute <= 0) {
    return {
      remainingChars: progress.remainingChars,
      remainingSeconds: null,
      finishAt: null,
      message: '暂无足够数据',
    }
  }

  const remainingSeconds = Math.ceil((progress.remainingChars / speed.charsPerMinute) * 60)
  return {
    remainingChars: progress.remainingChars,
    remainingSeconds,
    finishAt: new Date(Date.now() + remainingSeconds * 1000).toISOString(),
    message: '',
  }
}

function bumpMap(map: Map<string, number>, key: string, amount: number): void {
  const normalizedKey = key.trim() || '未知'
  map.set(normalizedKey, (map.get(normalizedKey) || 0) + amount)
}

function topFromMap(map: Map<string, number>, limit = 5): Array<{ name: string; totalSeconds: number }> {
  return Array.from(map.entries())
    .map(([name, totalSeconds]) => ({ name, totalSeconds }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, limit)
}

export function buildAnnualReadingReport(
  rows: ReadingStatsInsightRow[],
  books: ReadingInsightBook[],
  year = new Date().getFullYear(),
): AnnualReadingReport {
  const calendar = buildReadingCalendar(rows, { year })
  const yearRows = rows.filter(row => inDateRange(row, startOfYear(year), endOfYear(year)))
  const booksByIdentity = new Map(books.map(book => [book.readingStatsKey, book]))
  const bookGroups = new Map<string, { title: string; author: string; totalSeconds: number; charCount: number }>()
  const authorTotals = new Map<string, number>()
  const tagTotals = new Map<string, number>()
  const seriesTotals = new Map<string, number>()
  const monthly = Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, '0')}`,
    totalSeconds: 0,
    charCount: 0,
  }))

  for (const row of yearRows) {
    const book = booksByIdentity.get(row.bookIdentity)
    const group = bookGroups.get(row.bookIdentity) || {
      title: row.bookTitle || book?.title || '未命名书籍',
      author: row.bookAuthor || book?.author || '未知作者',
      totalSeconds: 0,
      charCount: 0,
    }
    group.totalSeconds += Number(row.durationSeconds || 0)
    group.charCount += Number(row.charCount || 0)
    bookGroups.set(row.bookIdentity, group)

    bumpMap(authorTotals, group.author, Number(row.durationSeconds || 0))
    for (const tag of book?.tags || []) bumpMap(tagTotals, tag, Number(row.durationSeconds || 0))
    if (book?.series) bumpMap(seriesTotals, book.series, Number(row.durationSeconds || 0))

    const monthIndex = Math.max(0, Math.min(11, Number(row.date.slice(5, 7)) - 1))
    monthly[monthIndex].totalSeconds += Number(row.durationSeconds || 0)
    monthly[monthIndex].charCount += Number(row.charCount || 0)
  }

  return {
    year,
    totalSeconds: calendar.reduce((sum, day) => sum + day.durationSeconds, 0),
    totalChars: calendar.reduce((sum, day) => sum + day.charCount, 0),
    readingDays: calendar.filter(day => day.durationSeconds > 0).length,
    longestStreak: calculateLongestStreak(calendar),
    finishedBooks: books.filter(book => book.readingStatus === 'finished').length,
    topBooks: Array.from(bookGroups.values())
      .sort((a, b) => b.totalSeconds - a.totalSeconds || a.title.localeCompare(b.title, 'zh-CN'))
      .slice(0, 8),
    topAuthors: topFromMap(authorTotals),
    topTags: topFromMap(tagTotals),
    topSeries: topFromMap(seriesTotals),
    monthly,
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatHours(seconds: number): string {
  return (Math.max(0, seconds) / 3600).toFixed(1)
}

export function buildAnnualReportHtml(report: AnnualReadingReport): string {
  const topBooks = report.topBooks.map(book => (
    `<li><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author)} · ${formatHours(book.totalSeconds)} 小时</span></li>`
  )).join('')
  const months = report.monthly.map(month => (
    `<div><span>${escapeHtml(month.month)}</span><strong>${formatHours(month.totalSeconds)}h</strong></div>`
  )).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>PacilRead ${report.year} 年度报告</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #162033; background: #f4f7f2; }
    main { max-width: 880px; margin: 0 auto; padding: 48px 28px; }
    h1 { font-size: 36px; margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin: 28px 0; }
    .card { background: white; border: 1px solid #dfe7d8; border-radius: 8px; padding: 18px; }
    .value { font-size: 26px; font-weight: 800; margin-top: 8px; }
    ol { padding-left: 22px; }
    li { margin: 12px 0; }
    li span { display: block; color: #667085; margin-top: 2px; }
    .months { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
    .months div { background: white; border: 1px solid #dfe7d8; border-radius: 8px; padding: 10px; }
    .months span { display:block; color:#667085; font-size:12px; }
  </style>
</head>
<body>
  <main>
    <h1>PacilRead ${report.year} 年度报告</h1>
    <p>这一年，你把碎片时间攒成了清晰的阅读轨迹。</p>
    <section class="grid">
      <div class="card"><span>阅读时长</span><div class="value">${formatHours(report.totalSeconds)}h</div></div>
      <div class="card"><span>阅读天数</span><div class="value">${report.readingDays}</div></div>
      <div class="card"><span>最长连续</span><div class="value">${report.longestStreak} 天</div></div>
      <div class="card"><span>读完书籍</span><div class="value">${report.finishedBooks}</div></div>
    </section>
    <section class="card">
      <h2>年度 Top 书籍</h2>
      <ol>${topBooks || '<li>暂无阅读记录</li>'}</ol>
    </section>
    <section class="card">
      <h2>月度趋势</h2>
      <div class="months">${months}</div>
    </section>
  </main>
</body>
</html>`
}
