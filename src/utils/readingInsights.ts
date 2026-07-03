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
  scope: 'global' | 'book'
  year: number
  rangeTitle: string
  bookTitle: string
  bookAuthor: string
  statusText: string
  readingSpeedCharsPerMinute: number
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

export type ReadingReportPeriod = 'day' | 'week' | 'month' | 'year'
export type WeeklyReportRangeMode = 'calendarWeek' | 'last7Days'
export type MonthlyReportRangeMode = 'calendarMonth' | 'last30Days'
export type YearlyReportRangeMode = 'calendarYear' | 'last365Days'

export interface ReadingReportRange {
  period: ReadingReportPeriod
  weekMode: WeeklyReportRangeMode | null
  monthMode: MonthlyReportRangeMode | null
  yearMode: YearlyReportRangeMode | null
  startDate: string
  endDate: string
  title: string
  rangeTitle: string
  fileLabel: string
}

export interface ReadingPeriodReport {
  scope: 'global' | 'book'
  period: ReadingReportPeriod
  weekMode: WeeklyReportRangeMode | null
  monthMode: MonthlyReportRangeMode | null
  yearMode: YearlyReportRangeMode | null
  title: string
  rangeTitle: string
  startDate: string
  endDate: string
  fileLabel: string
  bookTitle: string
  bookAuthor: string
  statusText: string
  readingSpeedCharsPerMinute: number
  totalSeconds: number
  totalChars: number
  readingDays: number
  longestStreak: number
  activeBooks: number
  finishedBooks: number
  topBooks: Array<{ title: string; author: string; totalSeconds: number; charCount: number }>
  topAuthors: Array<{ name: string; totalSeconds: number }>
  topTags: Array<{ name: string; totalSeconds: number }>
  topSeries: Array<{ name: string; totalSeconds: number }>
  daily: ReadingCalendarDay[]
  rhythmDaily: ReadingCalendarDay[]
  monthly: Array<{ month: string; totalSeconds: number; charCount: number }>
}

export type AnnualReportMetricKey =
  | 'total_duration'
  | 'total_chars'
  | 'reading_days'
  | 'longest_streak'
  | 'finished_books'
  | 'top_book'
  | 'top_author'
  | 'top_tag'
  | 'top_series'
  | 'peak_month'
  | 'active_months'
  | 'daily_average'
  | 'book_status'
  | 'book_speed'

export interface AnnualReportMetricDisplay {
  key: AnnualReportMetricKey
  label: string
  value: string
  unit: string
  fullValue: string
  kind: 'number' | 'text'
}

export const ANNUAL_REPORT_METRIC_KEYS: AnnualReportMetricKey[] = [
  'total_duration',
  'total_chars',
  'reading_days',
  'longest_streak',
  'finished_books',
  'top_book',
  'top_author',
  'top_tag',
  'top_series',
  'peak_month',
  'active_months',
  'daily_average',
  'book_status',
  'book_speed',
]

const DEFAULT_GLOBAL_ANNUAL_REPORT_METRICS: AnnualReportMetricKey[] = [
  'reading_days',
  'longest_streak',
  'finished_books',
  'total_duration',
  'total_chars',
]

const DEFAULT_BOOK_ANNUAL_REPORT_METRICS: AnnualReportMetricKey[] = [
  'reading_days',
  'longest_streak',
  'book_status',
  'total_duration',
  'total_chars',
]

const GLOBAL_ANNUAL_REPORT_METRIC_ORDER: AnnualReportMetricKey[] = [
  'total_duration',
  'total_chars',
  'reading_days',
  'longest_streak',
  'finished_books',
  'top_book',
  'top_author',
  'top_tag',
  'top_series',
  'peak_month',
  'active_months',
  'daily_average',
]

const BOOK_ANNUAL_REPORT_METRIC_ORDER: AnnualReportMetricKey[] = [
  'total_duration',
  'total_chars',
  'reading_days',
  'longest_streak',
  'book_status',
  'book_speed',
  'peak_month',
  'active_months',
  'top_author',
  'top_tag',
  'top_series',
]

export function isAnnualReportMetricKey(value: string): value is AnnualReportMetricKey {
  return (ANNUAL_REPORT_METRIC_KEYS as string[]).includes(value)
}

function formatCompactNumber(value: number): string {
  const safeValue = Math.max(0, Math.round(value))
  if (safeValue >= 10000) {
    const wan = safeValue / 10000
    return `${wan >= 100 ? Math.round(wan) : wan.toFixed(1)}万`
  }
  return safeValue.toLocaleString('zh-CN')
}

function formatMetricHours(seconds: number): string {
  const hours = Math.max(0, seconds) / 3600
  if (hours >= 100) return Math.round(hours).toLocaleString('zh-CN')
  return hours.toFixed(1)
}

function formatInsightDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  if (safeSeconds >= 3600) return `${formatMetricHours(safeSeconds)} 小时`
  if (safeSeconds >= 60) return `${Math.max(1, Math.round(safeSeconds / 60))} 分钟`
  return `${safeSeconds} 秒`
}

function formatDailyAverage(seconds: number): { value: string; unit: string } {
  const safeSeconds = Math.max(0, Math.round(seconds))
  if (safeSeconds >= 3600) {
    return { value: formatMetricHours(safeSeconds), unit: '小时/天' }
  }
  if (safeSeconds >= 60) {
    return { value: String(Math.round(safeSeconds / 60)), unit: '分钟/天' }
  }
  return { value: String(safeSeconds), unit: '秒/天' }
}

function getPeakMonth(report: AnnualReadingReport): number {
  let peakMonth = 0
  let peakSeconds = 0
  report.monthly.forEach((month, index) => {
    if (month.totalSeconds > peakSeconds) {
      peakSeconds = month.totalSeconds
      peakMonth = index + 1
    }
  })
  return peakSeconds > 0 ? peakMonth : 0
}

function getActiveMonthCount(report: AnnualReadingReport): number {
  return report.monthly.filter(month => month.totalSeconds > 0).length
}

function shortenInsightText(value: string | undefined | null, maxLength: number): string {
  const chars = Array.from(String(value || '').trim())
  if (chars.length <= maxLength) return chars.join('')
  return `${chars.slice(0, maxLength).join('')}...`
}

function quoteInsightBook(title: string | undefined | null): string {
  return `《${shortenInsightText(title || '未命名书籍', 14)}》`
}

export function buildAnnualReportInsight(report: AnnualReadingReport): string {
  const hasReadingData = report.totalSeconds > 0 || report.totalChars > 0 || report.readingDays > 0
  if (!hasReadingData) {
    return report.scope === 'book'
      ? '这本书今年还没有形成可分析的阅读轨迹。'
      : '今年还没有形成可分析的阅读轨迹。'
  }

  const peakMonth = getPeakMonth(report)
  const activeMonths = getActiveMonthCount(report)
  const peakMonthText = peakMonth > 0 ? `${peakMonth}月` : '全年'
  const durationText = formatInsightDuration(report.totalSeconds)
  const charsText = `${formatCompactNumber(report.totalChars)} 字`

  if (report.scope === 'book') {
    const bookTitle = quoteInsightBook(report.bookTitle || report.topBooks[0]?.title)
    const speedText = report.readingSpeedCharsPerMinute > 0
      ? `，平均约 ${report.readingSpeedCharsPerMinute.toLocaleString('zh-CN')} 字/分`
      : ''
    const monthText = activeMonths > 1
      ? `阅读分布在 ${activeMonths} 个月，${peakMonthText}最集中`
      : `阅读集中在 ${peakMonthText}`

    if (report.statusText === '已读完') {
      return `你读完了${bookTitle}，${monthText}；累计 ${durationText}、${report.readingDays} 个阅读日${speedText}。`
    }
    if (report.longestStreak >= 2) {
      return `${bookTitle}今年累计 ${durationText}、${charsText}；最长连续 ${report.longestStreak} 天，${monthText}${speedText}。`
    }
    return `${bookTitle}今年累计 ${durationText}、${charsText}；记录了 ${report.readingDays} 个阅读日，${monthText}${speedText}。`
  }

  const rhythmText = activeMonths > 1
    ? `在 ${activeMonths} 个月留下阅读记录，${peakMonthText}最集中`
    : `阅读集中在 ${peakMonthText}`
  const topBook = report.topBooks[0]
  const topTagName = report.topTags[0]?.name
  const topAuthorName = report.topAuthors[0]?.name
  const focusText = topBook
    ? `${quoteInsightBook(topBook.title)}投入最多（${formatInsightDuration(topBook.totalSeconds)}）`
    : `累计 ${durationText}`
  const tasteText = topTagName
    ? `常读标签是“${shortenInsightText(topTagName, 10)}”`
    : topAuthorName
      ? `常读作者是 ${shortenInsightText(topAuthorName, 10)}`
      : `累计 ${charsText}`
  const finishedText = report.finishedBooks > 0
    ? `，读完 ${report.finishedBooks.toLocaleString('zh-CN')} 本`
    : ''

  return `这一年你${rhythmText}；${focusText}，${tasteText}${finishedText}。`
}

export function getAnnualReportMetricLabel(key: AnnualReportMetricKey): string {
  switch (key) {
    case 'total_duration': return '阅读总时长'
    case 'total_chars': return '阅读字数'
    case 'reading_days': return '阅读天数'
    case 'longest_streak': return '最长连续'
    case 'finished_books': return '完成书籍'
    case 'top_book': return 'Top 书籍'
    case 'top_author': return '常读作者'
    case 'top_tag': return '常读标签'
    case 'top_series': return '常读系列'
    case 'peak_month': return '最活跃月份'
    case 'active_months': return '活跃月份'
    case 'daily_average': return '日均阅读'
    case 'book_status': return '完成状态'
    case 'book_speed': return '阅读速度'
    default: return '年度摘要'
  }
}

function getAnnualReportMetricLabelForReport(report: AnnualReadingReport, key: AnnualReportMetricKey): string {
  if (report.scope !== 'book') return getAnnualReportMetricLabel(key)
  switch (key) {
    case 'total_duration': return '本书时长'
    case 'total_chars': return '本书字数'
    case 'top_author': return '作者'
    case 'top_tag': return '标签'
    case 'top_series': return '系列'
    default: return getAnnualReportMetricLabel(key)
  }
}

export function getAnnualReportMetricDisplay(
  report: AnnualReadingReport,
  key: AnnualReportMetricKey,
): AnnualReportMetricDisplay {
  let value = ''
  let unit = ''
  let kind: AnnualReportMetricDisplay['kind'] = 'number'

  switch (key) {
    case 'total_duration':
      value = formatMetricHours(report.totalSeconds)
      unit = '小时'
      break
    case 'total_chars':
      value = formatCompactNumber(report.totalChars)
      unit = '字'
      break
    case 'reading_days':
      value = report.readingDays.toLocaleString('zh-CN')
      unit = '天'
      break
    case 'longest_streak':
      value = report.longestStreak.toLocaleString('zh-CN')
      unit = '天'
      break
    case 'finished_books':
      value = report.finishedBooks.toLocaleString('zh-CN')
      unit = '本'
      break
    case 'top_book':
      value = report.topBooks[0]?.title || '暂无书籍'
      kind = 'text'
      break
    case 'top_author':
      value = report.scope === 'book'
        ? report.bookAuthor || report.topAuthors[0]?.name || '暂无作者'
        : report.topAuthors[0]?.name || '暂无作者'
      kind = 'text'
      break
    case 'top_tag':
      value = report.topTags[0]?.name || '暂无标签'
      kind = 'text'
      break
    case 'top_series':
      value = report.topSeries[0]?.name || '暂无系列'
      kind = 'text'
      break
    case 'peak_month': {
      const peakMonth = getPeakMonth(report)
      value = peakMonth > 0 ? String(peakMonth) : '暂无'
      unit = peakMonth > 0 ? '月' : ''
      kind = peakMonth > 0 ? 'number' : 'text'
      break
    }
    case 'active_months':
      value = getActiveMonthCount(report).toLocaleString('zh-CN')
      unit = '个月'
      break
    case 'daily_average': {
      const average = report.readingDays > 0 ? report.totalSeconds / report.readingDays : 0
      const formatted = formatDailyAverage(average)
      value = formatted.value
      unit = formatted.unit
      break
    }
    case 'book_status':
      value = report.statusText || '阅读中'
      kind = 'text'
      break
    case 'book_speed':
      value = report.readingSpeedCharsPerMinute > 0
        ? report.readingSpeedCharsPerMinute.toLocaleString('zh-CN')
        : '暂无'
      unit = report.readingSpeedCharsPerMinute > 0 ? '字/分' : ''
      kind = report.readingSpeedCharsPerMinute > 0 ? 'number' : 'text'
      break
  }

  return {
    key,
    label: getAnnualReportMetricLabelForReport(report, key),
    value,
    unit,
    fullValue: unit ? `${value} ${unit}` : value,
    kind,
  }
}

export function isAnnualReportMetricAvailable(
  report: AnnualReadingReport,
  key: AnnualReportMetricKey,
): boolean {
  const isBookScope = report.scope === 'book'
  if (isBookScope && ['finished_books', 'top_book', 'daily_average'].includes(key)) return false
  if (!isBookScope && ['book_status', 'book_speed'].includes(key)) return false

  switch (key) {
    case 'total_duration': return report.totalSeconds > 0
    case 'total_chars': return report.totalChars > 0
    case 'reading_days': return report.readingDays > 0
    case 'longest_streak': return report.longestStreak > 0
    case 'finished_books': return true
    case 'top_book': return Boolean(report.topBooks[0]?.title)
    case 'top_author': return Boolean((report.scope === 'book' ? report.bookAuthor : report.topAuthors[0]?.name)?.trim())
    case 'top_tag': return Boolean(report.topTags[0]?.name)
    case 'top_series': return Boolean(report.topSeries[0]?.name)
    case 'peak_month': return getPeakMonth(report) > 0
    case 'active_months': return getActiveMonthCount(report) > 0
    case 'daily_average': return report.readingDays > 0 && report.totalSeconds > 0
    case 'book_status': return Boolean(report.statusText.trim())
    case 'book_speed': return report.readingSpeedCharsPerMinute > 0
    default: return false
  }
}

function supportsAnnualReportMetric(report: AnnualReadingReport, key: AnnualReportMetricKey): boolean {
  const isBookScope = report.scope === 'book'
  if (isBookScope && ['finished_books', 'top_book', 'daily_average'].includes(key)) return false
  if (!isBookScope && ['book_status', 'book_speed'].includes(key)) return false
  return true
}

function getAnnualReportMetricOrder(report: AnnualReadingReport): AnnualReportMetricKey[] {
  return report.scope === 'book' ? BOOK_ANNUAL_REPORT_METRIC_ORDER : GLOBAL_ANNUAL_REPORT_METRIC_ORDER
}

function getDefaultAnnualReportMetrics(report: AnnualReadingReport): AnnualReportMetricKey[] {
  return report.scope === 'book' ? DEFAULT_BOOK_ANNUAL_REPORT_METRICS : DEFAULT_GLOBAL_ANNUAL_REPORT_METRICS
}

export function getAnnualReportAvailableMetrics(report: AnnualReadingReport): AnnualReportMetricKey[] {
  const available = getAnnualReportMetricOrder(report)
    .filter(key => isAnnualReportMetricAvailable(report, key))

  for (const metric of getDefaultAnnualReportMetrics(report)) {
    if (!supportsAnnualReportMetric(report, metric) || available.includes(metric)) continue
    available.push(metric)
    if (available.length >= 3) break
  }

  return available
}

export function getAnnualReportAvailableMetricDisplays(report: AnnualReadingReport): AnnualReportMetricDisplay[] {
  return getAnnualReportAvailableMetrics(report).map(key => getAnnualReportMetricDisplay(report, key))
}

export function sanitizeAnnualReportMetrics(
  report: AnnualReadingReport,
  metrics: readonly AnnualReportMetricKey[] = [],
): AnnualReportMetricKey[] {
  const availableMetrics = getAnnualReportAvailableMetrics(report)
  const availableSet = new Set(availableMetrics)
  const next: AnnualReportMetricKey[] = []

  for (const metric of metrics) {
    if (!availableSet.has(metric) || next.includes(metric)) continue
    next.push(metric)
    if (next.length >= 3) return next
  }

  for (const metric of getDefaultAnnualReportMetrics(report)) {
    if (!availableSet.has(metric) || next.includes(metric)) continue
    next.push(metric)
    if (next.length >= 3) return next
  }

  for (const metric of availableMetrics) {
    if (next.includes(metric)) continue
    next.push(metric)
    if (next.length >= 3) return next
  }

  return next
}

export function buildAnnualReportMetricDisplays(
  report: AnnualReadingReport,
  metrics: readonly AnnualReportMetricKey[] = [],
): AnnualReportMetricDisplay[] {
  return sanitizeAnnualReportMetrics(report, metrics)
    .map(key => getAnnualReportMetricDisplay(report, key))
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

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfCalendarWeek(date: Date): Date {
  const startDate = new Date(date)
  const day = startDate.getDay()
  const diff = day === 0 ? 6 : day - 1
  startDate.setDate(startDate.getDate() - diff)
  return startDate
}

export function buildReadingReportRange(
  period: ReadingReportPeriod,
  options: {
    weekMode?: WeeklyReportRangeMode
    monthMode?: MonthlyReportRangeMode
    yearMode?: YearlyReportRangeMode
    now?: Date
  } = {},
): ReadingReportRange {
  const now = options.now ?? new Date()
  const endDate = toDateString(now)

  if (period === 'day') {
    return {
      period,
      weekMode: null,
      monthMode: null,
      yearMode: null,
      startDate: endDate,
      endDate,
      title: `${endDate} 阅读日报`,
      rangeTitle: endDate,
      fileLabel: `${endDate}-日报`,
    }
  }

  if (period === 'week') {
    const weekMode = options.weekMode ?? 'calendarWeek'
    const startDate = weekMode === 'last7Days'
      ? toDateString(addDays(parseDate(endDate), -6))
      : toDateString(startOfCalendarWeek(now))
    const modeTitle = weekMode === 'last7Days' ? '过去七天阅读周报' : '本周阅读周报'
    const modeLabel = weekMode === 'last7Days' ? '过去七天周报' : '自然周周报'
    return {
      period,
      weekMode,
      monthMode: null,
      yearMode: null,
      startDate,
      endDate,
      title: modeTitle,
      rangeTitle: `${startDate} 至 ${endDate}`,
      fileLabel: `${startDate}_${endDate}-${modeLabel}`,
    }
  }

  if (period === 'month') {
    const monthMode = options.monthMode ?? 'calendarMonth'
    const startDate = monthMode === 'last30Days'
      ? toDateString(addDays(parseDate(endDate), -29))
      : toDateString(startOfMonth(now))
    const modeTitle = monthMode === 'last30Days' ? '过去30天阅读月报' : '自然月阅读月报'
    const modeLabel = monthMode === 'last30Days' ? '过去30天月报' : '自然月月报'
    return {
      period,
      weekMode: null,
      monthMode,
      yearMode: null,
      startDate,
      endDate,
      title: modeTitle,
      rangeTitle: `${startDate} 至 ${endDate}`,
      fileLabel: `${startDate}_${endDate}-${modeLabel}`,
    }
  }

  const year = now.getFullYear()
  const yearMode = options.yearMode ?? 'calendarYear'
  if (yearMode === 'last365Days') {
    const startDate = toDateString(addDays(parseDate(endDate), -364))
    return {
      period,
      weekMode: null,
      monthMode: null,
      yearMode,
      startDate,
      endDate,
      title: '过去365天阅读年报',
      rangeTitle: `${startDate} 至 ${endDate}`,
      fileLabel: `${startDate}_${endDate}-过去365天年报`,
    }
  }

  return {
    period,
    weekMode: null,
    monthMode: null,
    yearMode,
    startDate: startOfYear(year),
    endDate,
    title: `${year} 阅读年报`,
    rangeTitle: `${startOfYear(year)} 至 ${endDate}`,
    fileLabel: `${year}-年报`,
  }
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

function buildReadingCalendarRange(
  rows: ReadingStatsInsightRow[],
  startDate: string,
  endDate: string,
  bookIdentity?: string | null,
): ReadingCalendarDay[] {
  const byDate = new Map<string, ReadingCalendarDay>()
  for (const row of rows) {
    if (!inDateRange(row, startDate, endDate, bookIdentity)) continue
    const entry = byDate.get(row.date) || { date: row.date, durationSeconds: 0, charCount: 0 }
    entry.durationSeconds += Number(row.durationSeconds || 0)
    entry.charCount += Number(row.charCount || 0)
    byDate.set(row.date, entry)
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function buildMonthBuckets(startDate: string, endDate: string): Array<{ month: string; totalSeconds: number; charCount: number }> {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  const buckets: Array<{ month: string; totalSeconds: number; charCount: number }> = []
  while (cursor <= endMonth) {
    buckets.push({
      month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      totalSeconds: 0,
      charCount: 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return buckets
}

function buildDailyBuckets(calendar: ReadingCalendarDay[], startDate: string, endDate: string): ReadingCalendarDay[] {
  const byDate = new Map(calendar.map(day => [day.date, day]))
  const days: ReadingCalendarDay[] = []
  let cursor = parseDate(startDate)
  const end = parseDate(endDate)
  while (toDateString(cursor) <= toDateString(end)) {
    const key = toDateString(cursor)
    days.push(byDate.get(key) || { date: key, durationSeconds: 0, charCount: 0 })
    cursor = addDays(cursor, 1)
  }
  return days
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

function readingStatusText(status: string | undefined): string {
  if (status === 'finished') return '已读完'
  if (status === 'unread') return '未开始'
  return '阅读中'
}

export function buildAnnualReadingReport(
  rows: ReadingStatsInsightRow[],
  books: ReadingInsightBook[],
  year = new Date().getFullYear(),
  options: { bookIdentity?: string | null } = {},
): AnnualReadingReport {
  const bookIdentity = options.bookIdentity || null
  const scopedBook = bookIdentity
    ? books.find(book => book.readingStatsKey === bookIdentity) || null
    : null
  const isBookScope = Boolean(bookIdentity)
  const calendar = buildReadingCalendar(rows, { year, bookIdentity })
  const yearRows = rows.filter(row => inDateRange(row, startOfYear(year), endOfYear(year), bookIdentity))
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
    const book = scopedBook || booksByIdentity.get(row.bookIdentity)
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

  if (isBookScope && scopedBook && !bookGroups.has(scopedBook.readingStatsKey)) {
    bookGroups.set(scopedBook.readingStatsKey, {
      title: scopedBook.title || '未命名书籍',
      author: scopedBook.author || '未知作者',
      totalSeconds: 0,
      charCount: 0,
    })
  }

  const totalSeconds = calendar.reduce((sum, day) => sum + day.durationSeconds, 0)
  const totalChars = calendar.reduce((sum, day) => sum + day.charCount, 0)
  const topBooks = Array.from(bookGroups.values())
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.title.localeCompare(b.title, 'zh-CN'))
    .slice(0, isBookScope ? 1 : 8)
  const bookTitle = scopedBook?.title || topBooks[0]?.title || ''
  const bookAuthor = scopedBook?.author || topBooks[0]?.author || ''

  return {
    scope: isBookScope ? 'book' : 'global',
    year,
    rangeTitle: isBookScope ? bookTitle || '未命名书籍' : '全部书籍',
    bookTitle,
    bookAuthor,
    statusText: isBookScope ? readingStatusText(scopedBook?.readingStatus) : '',
    readingSpeedCharsPerMinute: totalSeconds > 0 && totalChars > 0
      ? Math.round(totalChars * 60 / totalSeconds)
      : 0,
    totalSeconds,
    totalChars,
    readingDays: calendar.filter(day => day.durationSeconds > 0).length,
    longestStreak: calculateLongestStreak(calendar),
    finishedBooks: isBookScope
      ? scopedBook?.readingStatus === 'finished' ? 1 : 0
      : books.filter(book => book.readingStatus === 'finished').length,
    topBooks,
    topAuthors: topFromMap(authorTotals),
    topTags: topFromMap(tagTotals),
    topSeries: topFromMap(seriesTotals),
    monthly,
  }
}

export function buildReadingPeriodReport(
  rows: ReadingStatsInsightRow[],
  books: ReadingInsightBook[],
  range: ReadingReportRange,
  options: { bookIdentity?: string | null } = {},
): ReadingPeriodReport {
  const bookIdentity = options.bookIdentity || null
  const scopedBook = bookIdentity
    ? books.find(book => book.readingStatsKey === bookIdentity) || null
    : null
  const isBookScope = Boolean(bookIdentity)
  const periodRows = rows.filter(row => inDateRange(row, range.startDate, range.endDate, bookIdentity))
  const booksByIdentity = new Map(books.map(book => [book.readingStatsKey, book]))
  const activeBookIdentities = new Set<string>()
  const bookGroups = new Map<string, { title: string; author: string; totalSeconds: number; charCount: number }>()
  const authorTotals = new Map<string, number>()
  const tagTotals = new Map<string, number>()
  const seriesTotals = new Map<string, number>()
  const calendar = buildReadingCalendarRange(rows, range.startDate, range.endDate, bookIdentity)
  const daily = buildDailyBuckets(calendar, range.startDate, range.endDate)
  const rhythmStartDate = range.period === 'day'
    ? toDateString(addDays(parseDate(range.endDate), -6))
    : range.startDate
  const rhythmCalendar = range.period === 'day'
    ? buildReadingCalendarRange(rows, rhythmStartDate, range.endDate, bookIdentity)
    : calendar
  const rhythmDaily = range.period === 'year'
    ? []
    : buildDailyBuckets(rhythmCalendar, rhythmStartDate, range.endDate)
  const year = Number(range.startDate.slice(0, 4))
  const monthly = range.period === 'year' && range.yearMode === 'calendarYear'
    ? Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, '0')}`,
      totalSeconds: 0,
      charCount: 0,
    }))
    : buildMonthBuckets(range.startDate, range.endDate)
  const monthIndexes = new Map(monthly.map((month, index) => [month.month, index]))

  for (const row of periodRows) {
    const book = scopedBook || booksByIdentity.get(row.bookIdentity)
    activeBookIdentities.add(row.bookIdentity)
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

    const monthIndex = monthIndexes.get(row.date.slice(0, 7))
    if (monthIndex !== undefined) {
      monthly[monthIndex].totalSeconds += Number(row.durationSeconds || 0)
      monthly[monthIndex].charCount += Number(row.charCount || 0)
    }
  }

  if (isBookScope && scopedBook && !bookGroups.has(scopedBook.readingStatsKey)) {
    bookGroups.set(scopedBook.readingStatsKey, {
      title: scopedBook.title || '未命名书籍',
      author: scopedBook.author || '未知作者',
      totalSeconds: 0,
      charCount: 0,
    })
  }

  const totalSeconds = calendar.reduce((sum, day) => sum + day.durationSeconds, 0)
  const totalChars = calendar.reduce((sum, day) => sum + day.charCount, 0)
  const topBooks = Array.from(bookGroups.values())
    .sort((a, b) => b.totalSeconds - a.totalSeconds || a.title.localeCompare(b.title, 'zh-CN'))
    .slice(0, isBookScope ? 1 : 8)
  const bookTitle = scopedBook?.title || topBooks[0]?.title || ''
  const bookAuthor = scopedBook?.author || topBooks[0]?.author || ''
  const finishedBooks = isBookScope
    ? scopedBook?.readingStatus === 'finished' ? 1 : 0
    : books.filter(book => activeBookIdentities.has(book.readingStatsKey) && book.readingStatus === 'finished').length

  return {
    scope: isBookScope ? 'book' : 'global',
    period: range.period,
    weekMode: range.weekMode,
    monthMode: range.monthMode,
    yearMode: range.yearMode,
    title: range.title,
    rangeTitle: isBookScope && bookTitle
      ? `${bookTitle} · ${range.rangeTitle}`
      : range.rangeTitle,
    startDate: range.startDate,
    endDate: range.endDate,
    fileLabel: range.fileLabel,
    bookTitle,
    bookAuthor,
    statusText: isBookScope ? readingStatusText(scopedBook?.readingStatus) : '',
    readingSpeedCharsPerMinute: totalSeconds > 0 && totalChars > 0
      ? Math.round(totalChars * 60 / totalSeconds)
      : 0,
    totalSeconds,
    totalChars,
    readingDays: calendar.filter(day => day.durationSeconds > 0).length,
    longestStreak: calculateLongestStreak(calendar),
    activeBooks: activeBookIdentities.size,
    finishedBooks,
    topBooks,
    topAuthors: topFromMap(authorTotals),
    topTags: topFromMap(tagTotals),
    topSeries: topFromMap(seriesTotals),
    daily,
    rhythmDaily,
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

export function buildReadingPeriodReportInsight(report: ReadingPeriodReport): string {
  const hasReadingData = report.totalSeconds > 0 || report.totalChars > 0 || report.readingDays > 0
  if (!hasReadingData) {
    if (report.scope === 'book') return '这个周期里，这本书还没有形成可分析的阅读轨迹。'
    return '这个周期里还没有形成可分析的阅读轨迹。'
  }

  const durationText = formatInsightDuration(report.totalSeconds)
  const charsText = `${formatCompactNumber(report.totalChars)} 字`
  const topBook = report.topBooks[0]
  const topBookText = topBook
    ? `${quoteInsightBook(topBook.title)}投入最多（${formatInsightDuration(topBook.totalSeconds)}）`
    : `累计 ${durationText}`
  const tasteText = report.topTags[0]?.name
    ? `常读标签是“${shortenInsightText(report.topTags[0].name, 10)}”`
    : report.topAuthors[0]?.name
      ? `常读作者是 ${shortenInsightText(report.topAuthors[0].name, 10)}`
      : `累计 ${charsText}`

  if (report.scope === 'book') {
    const bookTitle = quoteInsightBook(report.bookTitle || report.topBooks[0]?.title)
    const speedText = report.readingSpeedCharsPerMinute > 0
      ? `，平均约 ${report.readingSpeedCharsPerMinute.toLocaleString('zh-CN')} 字/分`
      : ''
    return `${bookTitle}在这个周期累计 ${durationText}、${charsText}；记录了 ${report.readingDays} 个阅读日${speedText}。`
  }

  if (report.period === 'day') {
    return `这一天你累计阅读 ${durationText}、${charsText}；${topBookText}，${tasteText}。`
  }
  if (report.period === 'week') {
    const weekText = report.weekMode === 'last7Days' ? '过去七天' : '这个自然周'
    return `${weekText}你读了 ${report.readingDays} 天，累计 ${durationText}、${charsText}；${topBookText}，${tasteText}。`
  }
  if (report.period === 'month') {
    const monthText = report.monthMode === 'last30Days' ? '过去30天' : '这个自然月'
    return `${monthText}你读了 ${report.readingDays} 天，累计 ${durationText}、${charsText}；${topBookText}，${tasteText}。`
  }
  if (report.period === 'year' && report.yearMode === 'last365Days') {
    return `过去365天你读了 ${report.readingDays} 天，累计 ${durationText}、${charsText}；${topBookText}，${tasteText}。`
  }
  return `这一年你读了 ${report.readingDays} 天，累计 ${durationText}、${charsText}；${topBookText}，${tasteText}。`
}

export function buildReadingPeriodReportHtml(report: ReadingPeriodReport): string {
  const topBooks = report.topBooks.map(book => (
    `<li><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(book.author)} · ${formatHours(book.totalSeconds)} 小时 · ${escapeHtml(formatCompactNumber(book.charCount))} 字</span></li>`
  )).join('')
  const daily = report.daily.map(day => (
    `<div><span>${escapeHtml(day.date)}</span><strong>${formatHours(day.durationSeconds)}h</strong><em>${escapeHtml(formatCompactNumber(day.charCount))} 字</em></div>`
  )).join('')
  const months = report.monthly.map(month => (
    `<div><span>${escapeHtml(month.month)}</span><strong>${formatHours(month.totalSeconds)}h</strong><em>${escapeHtml(formatCompactNumber(month.charCount))} 字</em></div>`
  )).join('')
  const timelineTitle = report.period === 'year' ? '月度趋势' : '每日明细'
  const timelineContent = report.period === 'year' ? months : daily
  const activeBooksLabel = report.scope === 'book' ? '当前书籍' : '活跃书籍'
  const activeBooksValue = report.scope === 'book' ? (report.bookTitle || '未命名书籍') : `${report.activeBooks} 本`
  const title = report.scope === 'book' && report.bookTitle
    ? `${report.title} · ${report.bookTitle}`
    : report.title

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>PacilRead ${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #162033; background: #f5f7f2; }
    main { max-width: 900px; margin: 0 auto; padding: 48px 28px; }
    h1 { font-size: 36px; margin: 0 0 8px; }
    h2 { margin-top: 0; }
    p { color: #506052; line-height: 1.7; }
    .range { color: #667085; font-size: 14px; margin-bottom: 22px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin: 28px 0; }
    .card { background: white; border: 1px solid #dfe7d8; border-radius: 8px; padding: 18px; box-shadow: 0 12px 32px rgba(30, 41, 59, 0.06); }
    .value { font-size: 26px; font-weight: 800; margin-top: 8px; color: #1f3a2d; }
    ol { padding-left: 22px; }
    li { margin: 12px 0; }
    li span { display: block; color: #667085; margin-top: 2px; }
    .timeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
    .timeline div { background: white; border: 1px solid #dfe7d8; border-radius: 8px; padding: 10px; }
    .timeline span, .timeline em { display:block; color:#667085; font-size:12px; font-style: normal; }
    .timeline strong { display:block; margin: 4px 0 2px; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <div class="range">${escapeHtml(report.rangeTitle)}</div>
    <p>${escapeHtml(buildReadingPeriodReportInsight(report))}</p>
    <section class="grid">
      <div class="card"><span>阅读时长</span><div class="value">${formatHours(report.totalSeconds)}h</div></div>
      <div class="card"><span>阅读字数</span><div class="value">${escapeHtml(formatCompactNumber(report.totalChars))}</div></div>
      <div class="card"><span>阅读天数</span><div class="value">${report.readingDays} 天</div></div>
      <div class="card"><span>${escapeHtml(activeBooksLabel)}</span><div class="value">${escapeHtml(activeBooksValue)}</div></div>
    </section>
    <section class="card">
      <h2>${report.scope === 'book' ? '本书摘要' : 'Top 书籍'}</h2>
      <ol>${topBooks || '<li>暂无阅读记录</li>'}</ol>
    </section>
    <section class="card">
      <h2>${timelineTitle}</h2>
      <div class="timeline">${timelineContent}</div>
    </section>
  </main>
</body>
</html>`
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
    <p>${escapeHtml(buildAnnualReportInsight(report))}</p>
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
