import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const tsModuleCache = new Map()

function loadTsModule(relativePath, baseDir = rootDir) {
  const filename = resolve(rootDir, relativePath)
  if (tsModuleCache.has(filename)) return tsModuleCache.get(filename).exports
  const source = readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  })
  const module = { exports: {} }
  tsModuleCache.set(filename, module)
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) return require(specifier)
    const target = resolve(dirname(filename), specifier)
    const tsTarget = target.endsWith('.ts') ? target : `${target}.ts`
    if (existsSync(tsTarget)) return loadTsModule(tsTarget, baseDir)
    return require(target)
  }
  const sandbox = {
    module,
    exports: module.exports,
    require: localRequire,
    __filename: filename,
    __dirname: dirname(filename),
    console,
    Buffer,
    URL,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    process,
    btoa: globalThis.btoa,
  }
  vm.runInNewContext(outputText, sandbox, { filename })
  return module.exports
}

const plain = (value) => JSON.parse(JSON.stringify(value))

const webdav = loadTsModule('src/utils/webdav.ts')
assert.equal(webdav.buildWebdavBaseUrl('https://dav.example.com/root', 'Books'), 'https://dav.example.com/root/Books/')
assert.equal(webdav.buildPacilReadBaseUrl('https://dav.example.com/root/', ''), 'https://dav.example.com/root/PacilRead/')
assert.equal(webdav.sanitizeWebdavDirectorySegment('../desktop/settings'), 'desktopsettings')
assert.equal(webdav.buildProgressFileName({ title: 'A:B/C', author: '' }), 'A_B_C_未知.json')
assert.deepEqual(plain(webdav.extractHrefValues('<d:href>/a.txt</d:href><href>/b.txt</href>')), ['/a.txt', '/b.txt'])

const remoteProgress = loadTsModule('src/utils/remoteProgress.ts')
assert.equal(remoteProgress.isSimilarRemoteProgress(2, 1200, 2, 450), true)
assert.equal(remoteProgress.isSimilarRemoteProgress(2, 1300, 2, 450), false)
assert.equal(remoteProgress.isSimilarRemoteProgress(2, 1200, 3, 1200), false)
assert.equal(remoteProgress.buildRemoteProgressExcerpt('0123456789ABCDEFGHIJ', 10, 9), '…789ABCDEF…')
assert.equal(remoteProgress.buildRemoteProgressExcerpt('第一行\n  第二行', 0, 64), '第一行 第二行')

const settingsSchema = loadTsModule('src/utils/settingsSchema.ts')
const boolDef = settingsSchema.boolSetting('enabled', false, 'ui')
assert.equal(settingsSchema.readSetting({ enabled: 'true' }, boolDef), true)
assert.equal(settingsSchema.serializeSetting(boolDef, false), 'false')
assert.equal(settingsSchema.clampBookshelfProgressPrefetchLimit('101'), 100)
assert.deepEqual(
  plain(settingsSchema.filterSettingsByScope({ a: '1', b: '2' }, [
    settingsSchema.stringSetting('a', '', 'ui'),
    settingsSchema.stringSetting('b', '', 'theme'),
  ], ['theme'])),
  { b: '2' },
)

const keyboardShortcuts = loadTsModule('src/utils/keyboardShortcuts.ts')
assert.equal(keyboardShortcuts.normalizeShortcutKey('A'), 'a')
assert.equal(keyboardShortcuts.normalizeShortcutKey('Spacebar'), ' ')
assert.equal(keyboardShortcuts.normalizeShortcutKey('Control'), null)
assert.deepEqual(plain(keyboardShortcuts.normalizeShortcutList(['A', 'a', ' ', 'Space', 'Shift'])), ['a', ' '])
assert.deepEqual(
  plain(keyboardShortcuts.normalizeShortcutBindings(['D', ' ', 'Spacebar'], ['d', 'A', 'a'])),
  { nextKeys: ['d', ' '], previousKeys: ['a'] },
)
assert.equal(keyboardShortcuts.addShortcutBinding([' '], [], 'Space').status, 'duplicate')
assert.equal(keyboardShortcuts.addShortcutBinding([], ['A'], 'a').status, 'conflict')
assert.equal(keyboardShortcuts.formatShortcutKey('PageDown'), 'PgDn')
assert.equal(keyboardShortcuts.formatShortcutKey('w'), 'W')

const readerPageMode = loadTsModule('src/utils/readerPageMode.ts')
assert.equal(readerPageMode.resolveReaderPageMode('double', 1280, 720), 'double')
assert.equal(readerPageMode.resolveReaderPageMode('double', 720, 1280), 'single')
assert.equal(readerPageMode.resolveReaderPageMode('double', 800, 800), 'single')
assert.equal(readerPageMode.resolveReaderPageMode('single', 1280, 720), 'single')

const readingStats = loadTsModule('src/utils/readingStats.ts')
const splitRows = readingStats.splitRangeByDate(
  new Date(2026, 0, 1, 23, 59, 30).getTime(),
  new Date(2026, 0, 2, 0, 0, 45).getTime(),
)
assert.deepEqual(plain(splitRows), [
  { date: '2026-01-01', seconds: 30 },
  { date: '2026-01-02', seconds: 45 },
])

const bookMetadata = loadTsModule('src/utils/bookMetadata.ts')
assert.deepEqual(
  plain(bookMetadata.normalizeBookMetadata({ title: 'A', tags: '科幻, 科幻，长篇' })),
  { title: 'A', tags: ['科幻', '长篇'], series: '', readingStatus: 'unread' },
)
assert.equal(bookMetadata.normalizeBookMetadata({ progressIndex: 1 }).readingStatus, 'reading')
assert.equal(bookMetadata.shouldAutoMarkFinished({
  status: 'reading',
  chapterCount: 2,
  progressIndex: 1,
  progressOffset: 4,
  totalPages: 5,
}), true)

const syncDiff = loadTsModule('src/utils/syncDiff.ts')
const diffPreview = syncDiff.buildSyncDiffPreview({
  books: [
    { id: 1, title: 'Local', author: 'A', readingStatsKey: 'book-a', updatedAt: 2 },
    { id: 2, title: 'Only Local', readingStatsKey: 'book-local', updatedAt: 1 },
  ],
  chapters: [], rules: [], themes: [], bookmarks: [], readingStats: [],
}, {
  books: [
    { id: 9, title: 'Remote', author: 'A', readingStatsKey: 'book-a', updatedAt: 3 },
    { id: 3, title: 'Only Remote', readingStatsKey: 'book-remote', updatedAt: 1 },
  ],
  chapters: [], rules: [], themes: [], bookmarks: [], readingStats: [],
})
assert.equal(diffPreview.summary.conflict, 1)
assert.equal(diffPreview.summary.local, 1)
assert.equal(diffPreview.summary.remote, 1)
const resolvedDiff = syncDiff.applySyncDiffResolution({
  books: [{ id: 1, title: 'Local', readingStatsKey: 'book-a', updatedAt: 2 }],
  chapters: [], rules: [], themes: [], bookmarks: [], readingStats: [],
}, {
  books: [{ id: 9, title: 'Remote', readingStatsKey: 'book-a', updatedAt: 3 }],
  chapters: [], rules: [], themes: [], bookmarks: [], readingStats: [],
}, { 'books:book-a': 'remote' })
assert.equal(resolvedDiff.books[0].title, 'Remote')

const readingInsights = loadTsModule('src/utils/readingInsights.ts')
const insightRows = [
  { date: '2026-01-01', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 600, charCount: 3000, updatedAt: 1 },
  { date: '2026-01-02', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 600, charCount: 3600, updatedAt: 2 },
  { date: '2026-01-04', bookIdentity: 'b', bookTitle: 'B', bookAuthor: 'BB', durationSeconds: 300, charCount: 900, updatedAt: 3 },
]
assert.equal(readingInsights.calculateLongestStreak(readingInsights.buildReadingCalendar(insightRows, { year: 2026 })), 2)
assert.equal(Math.round(readingInsights.calculateReadingSpeed(insightRows, { bookIdentity: 'a', days: 365 }).charsPerMinute), 330)
const eta = readingInsights.estimateFinishTime({
  book: { id: 1, title: 'A', author: 'AA', readingStatsKey: 'a', progressIndex: 1, progressOffset: 0, chapterCount: 3, lastReadAt: 1 },
  chapters: [
    { bookId: 1, orderIndex: 0, bodyTextSize: 1000 },
    { bookId: 1, orderIndex: 1, bodyTextSize: 1000 },
    { bookId: 1, orderIndex: 2, bodyTextSize: 1000 },
  ],
  rows: insightRows,
  days: 365,
})
assert.equal(eta.remainingChars, 2000)
assert.equal(eta.remainingSeconds, 364)

const annualRows = [
  { date: '2026-01-10', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 3600, charCount: 10000, updatedAt: 1 },
  { date: '2026-02-12', bookIdentity: 'b', bookTitle: 'B', bookAuthor: 'BB', durationSeconds: 1800, charCount: 5000, updatedAt: 2 },
  { date: '2025-12-31', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 7200, charCount: 20000, updatedAt: 3 },
]
const annualBooks = [
  { id: 1, title: 'A', author: 'AA', readingStatsKey: 'a', progressIndex: 0, progressOffset: 0, chapterCount: 1, lastReadAt: 1, tags: ['科幻', '长篇'], series: '银河', readingStatus: 'finished' },
  { id: 2, title: 'B', author: 'BB', readingStatsKey: 'b', progressIndex: 0, progressOffset: 0, chapterCount: 1, lastReadAt: 2, tags: ['科幻'], series: '城市', readingStatus: 'reading' },
]
const annualReport = readingInsights.buildAnnualReadingReport(annualRows, annualBooks, 2026)
assert.equal(annualReport.totalSeconds, 5400)
assert.equal(annualReport.totalChars, 15000)
assert.equal(annualReport.readingDays, 2)
assert.equal(annualReport.finishedBooks, 1)
assert.equal(annualReport.monthly[0].totalSeconds, 3600)
assert.equal(annualReport.monthly[1].totalSeconds, 1800)
assert.equal(annualReport.monthly[11].totalSeconds, 0)
assert.deepEqual(plain(annualReport.topTags[0]), { name: '科幻', totalSeconds: 5400 })
assert.deepEqual(plain(annualReport.topSeries[0]), { name: '银河', totalSeconds: 3600 })
assert.equal(
  readingInsights.buildAnnualReportInsight(annualReport),
  '这一年你在 2 个月留下阅读记录，1月最集中；《A》投入最多（1.0 小时），常读标签是“科幻”，读完 1 本。',
)
const bookAnnualReport = readingInsights.buildAnnualReadingReport(annualRows, annualBooks, 2026, { bookIdentity: 'a' })
assert.equal(bookAnnualReport.scope, 'book')
assert.equal(bookAnnualReport.rangeTitle, 'A')
assert.equal(bookAnnualReport.totalSeconds, 3600)
assert.equal(bookAnnualReport.totalChars, 10000)
assert.equal(bookAnnualReport.readingDays, 1)
assert.equal(bookAnnualReport.finishedBooks, 1)
assert.equal(bookAnnualReport.statusText, '已读完')
assert.equal(bookAnnualReport.readingSpeedCharsPerMinute, 167)
assert.deepEqual(
  plain(readingInsights.sanitizeAnnualReportMetrics(bookAnnualReport, [])),
  ['reading_days', 'longest_streak', 'book_status'],
)
assert.equal(
  readingInsights.getAnnualReportMetricDisplay(bookAnnualReport, 'total_duration').label,
  '本书时长',
)
assert.equal(
  readingInsights.buildAnnualReportInsight(bookAnnualReport),
  '你读完了《A》，阅读集中在 1月；累计 1.0 小时、1 个阅读日，平均约 167 字/分。',
)
const emptyAnnualReport = readingInsights.buildAnnualReadingReport([], [], 2026)
assert.equal(emptyAnnualReport.totalSeconds, 0)
assert.equal(emptyAnnualReport.totalChars, 0)
assert.equal(emptyAnnualReport.topBooks.length, 0)
assert.equal(emptyAnnualReport.monthly.length, 12)
assert.equal(emptyAnnualReport.monthly.every(month => month.totalSeconds === 0), true)

const periodRows = [
  { date: '2026-01-01', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 600, charCount: 1200, updatedAt: 1 },
  { date: '2026-01-05', bookIdentity: 'b', bookTitle: 'B', bookAuthor: 'BB', durationSeconds: 1200, charCount: 2400, updatedAt: 2 },
  { date: '2026-01-06', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 1800, charCount: 3600, updatedAt: 3 },
  { date: '2026-01-07', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 600, charCount: 1200, updatedAt: 4 },
  { date: '2025-12-31', bookIdentity: 'a', bookTitle: 'A', bookAuthor: 'AA', durationSeconds: 999, charCount: 999, updatedAt: 5 },
]
const fixedNow = new Date(2026, 0, 7)
const calendarWeekRange = readingInsights.buildReadingReportRange('week', {
  weekMode: 'calendarWeek',
  now: fixedNow,
})
assert.deepEqual(plain(calendarWeekRange), {
  period: 'week',
  weekMode: 'calendarWeek',
  startDate: '2026-01-05',
  endDate: '2026-01-07',
  title: '本周阅读周报',
  rangeTitle: '2026-01-05 至 2026-01-07',
  fileLabel: '2026-01-05_2026-01-07-自然周周报',
})
const calendarWeekReport = readingInsights.buildReadingPeriodReport(periodRows, annualBooks, calendarWeekRange)
assert.equal(calendarWeekReport.totalSeconds, 3600)
assert.equal(calendarWeekReport.totalChars, 7200)
assert.equal(calendarWeekReport.readingDays, 3)
assert.equal(calendarWeekReport.activeBooks, 2)
assert.equal(calendarWeekReport.daily.length, 3)
assert.equal(calendarWeekReport.rhythmDaily.length, 3)
assert.equal(calendarWeekReport.topBooks[0].title, 'A')
const last7Range = readingInsights.buildReadingReportRange('week', {
  weekMode: 'last7Days',
  now: fixedNow,
})
const last7Report = readingInsights.buildReadingPeriodReport(periodRows, annualBooks, last7Range)
assert.equal(last7Range.startDate, '2026-01-01')
assert.equal(last7Report.totalSeconds, 4200)
assert.equal(last7Report.daily.length, 7)
const dailyRange = readingInsights.buildReadingReportRange('day', { now: fixedNow })
const dailyReport = readingInsights.buildReadingPeriodReport(periodRows, annualBooks, dailyRange, { bookIdentity: 'a' })
assert.equal(dailyReport.scope, 'book')
assert.equal(dailyReport.totalSeconds, 600)
assert.equal(dailyReport.rangeTitle, 'A · 2026-01-07')
assert.equal(dailyReport.daily.length, 1)
assert.equal(dailyReport.rhythmDaily.length, 7)
assert.equal(dailyReport.rhythmDaily[0].date, '2026-01-01')
assert.equal(dailyReport.rhythmDaily[6].date, '2026-01-07')
assert.equal(dailyReport.rhythmDaily.reduce((sum, day) => sum + day.durationSeconds, 0), 3000)
assert.equal(
  readingInsights.buildReadingPeriodReportHtml(calendarWeekReport).includes('本周阅读周报'),
  true,
)

const pagination = loadTsModule('src/utils/pagination.ts')
const slices = [
  { startChar: 0, endChar: 10, bodyEndInSlice: 10 },
  { startChar: 10, endChar: 20, bodyEndInSlice: 20 },
  { startChar: 20, endChar: 30, bodyEndInSlice: 30 },
]
assert.equal(pagination.findPageForOffsetInSlices(slices, 15), 1)
assert.equal(pagination.findPageForOffsetInSlices(slices, 99), 2)
assert.equal(pagination.findPageForOffsetInSlices([], 5), 0)

const bookshelfManagement = loadTsModule('src/utils/bookshelfManagement.ts')
const managedBook = { title: '银河漫游指南', author: 'Douglas Adams', tags: ['科幻', '喜剧'], series: '银河', readingStatus: 'reading' }
assert.equal(bookshelfManagement.matchesBookshelfFilters(managedBook, {
  query: 'douglas', tag: '科幻', series: '银河', status: 'reading',
}), true)
assert.equal(bookshelfManagement.matchesBookshelfFilters(managedBook, {
  query: 'douglas', tag: '科幻', series: '银河', status: 'finished',
}), false)
assert.deepEqual(plain(bookshelfManagement.addBookTags(['科幻'], [' 科幻 ', '', '长篇', '长篇'])), ['科幻', '长篇'])
assert.deepEqual(plain(bookshelfManagement.removeBookTags(['科幻', '长篇'], [' 科幻 '])), ['长篇'])
const duplicateMatches = bookshelfManagement.detectDuplicates([
  { key: 'existing-a', title: '同名书', author: '作者', contentSha256: 'hash-a' },
  { key: 'existing-b', title: '另一册', author: '另一人', contentSha256: 'hash-b' },
], [
  { key: 'exact-first', title: '同名书', author: '作者', contentSha256: 'hash-b' },
  { key: 'metadata', title: '  同名书 ', author: '作者', contentSha256: 'hash-c' },
  { key: 'same-batch', title: '新书', author: '新作者', contentSha256: 'hash-new' },
  { key: 'same-batch-copy', title: '新书', author: '新作者', contentSha256: 'hash-other' },
])
assert.equal(duplicateMatches.get('exact-first'), 'exact_content')
assert.equal(duplicateMatches.get('metadata'), 'same_title_author')
assert.equal(duplicateMatches.get('same-batch-copy'), 'same_title_author')
const exportNames = new Set(['原书名.txt'])
assert.equal(bookshelfManagement.uniqueExportFileName('原书名.txt', '.txt', exportNames), '原书名 (2).txt')
assert.equal(bookshelfManagement.uniqueExportFileName('原书名.txt', '.txt', exportNames), '原书名 (3).txt')

const searchText = loadTsModule('src/utils/searchText.ts')
assert.deepEqual(plain(searchText.findAllSearchMatches('AaAa', 'aa')), [0, 1, 2])
assert.deepEqual(plain(searchText.findAllSearchMatches('中文中文', '中文')), [0, 2])

const quoteShare = loadTsModule('src/utils/quoteShare.ts')
assert.equal(quoteShare.quoteTextFromPageLines([
  { kind: 'title', text: '第一章 标题' },
  { kind: 'body', text: '正文第一句。' },
  { kind: 'body', text: '正文第二句。' },
]), '正文第一句。正文第二句。')
const quoteSource = `${'前'.repeat(50)}选中文字${'后'.repeat(50)}`
assert.deepEqual(plain(quoteShare.quoteContextExcerpt(quoteSource, 50, 54)), {
  before: '前'.repeat(40), after: '后'.repeat(40),
})
assert.deepEqual(plain(quoteShare.quoteContextExcerpt('开头选中结尾', 0, 4)), { before: '', after: '结尾' })

const sleepTimer = loadTsModule('src/utils/ttsSleepTimer.ts')
assert.equal(sleepTimer.ttsSliderProgressToMs(36), 180 * 60_000)
assert.equal(sleepTimer.ttsPreciseToMs(23, 59, 59), 86_399_000)
assert.deepEqual(plain(sleepTimer.ttsMsToPrecise(3_661_000)), [1, 1, 1])
assert.equal(sleepTimer.ttsRemaining(12_000, sleepTimer.ttsDeadlineFrom(10_000, 5_000)), 3_000)
assert.equal(sleepTimer.ttsRemaining(20_000, 15_000), 0)

const searchIndex = loadTsModule('electron/searchIndex.ts')
const searchIndexDir = mkdtempSync(resolve(tmpdir(), 'pacilread-search-test-'))
try {
  const index = new searchIndex.PersistentBookSearchIndex(searchIndexDir)
  const indexedChapters = [
    { id: 1, title: '第一章', orderIndex: 0, fingerprint: 'v1', text: 'AaAa 与 中文中文' },
  ]
  assert.equal(index.isReady(7, indexedChapters, []), false)
  const searchResults = index.search(7, indexedChapters, [], 'aa')
  assert.deepEqual(plain(searchResults.map(item => item.charOffset)), [0, 1, 2])
  assert.equal(index.isReady(7, indexedChapters, []), true)
  assert.equal(index.isReady(7, [{ ...indexedChapters[0], fingerprint: 'v2' }], []), false)
  assert.equal(index.isReady(7, indexedChapters, [{ id: 1, updatedAt: 2, active: true, regex: false, pattern: 'Aa', replacement: 'B' }]), false)
  assert.deepEqual(plain(index.search(8, indexedChapters, [], '中文').map(item => item.charOffset)), [7, 9])
} finally {
  rmSync(searchIndexDir, { recursive: true, force: true })
}

const parsers = loadTsModule('electron/parsers.ts')
const chapters = parsers.splitTextIntoChapters('开头说明\n\n第一章：开始\n这里是正文\n\n第二章 继续\n更多正文')
assert.equal(chapters.length, 3)
assert.equal(chapters[0].title, '前言')
assert.equal(chapters[1].title, '第一章：开始')
assert.equal(chapters[2].title, '第二章 继续')

console.log('logic tests passed')
