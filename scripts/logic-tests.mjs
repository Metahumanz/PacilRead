import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadTsModule(relativePath) {
  const filename = resolve(rootDir, relativePath)
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
  const sandbox = {
    module,
    exports: module.exports,
    require,
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

const pagination = loadTsModule('src/utils/pagination.ts')
const slices = [
  { startChar: 0, endChar: 10, bodyEndInSlice: 10 },
  { startChar: 10, endChar: 20, bodyEndInSlice: 20 },
  { startChar: 20, endChar: 30, bodyEndInSlice: 30 },
]
assert.equal(pagination.findPageForOffsetInSlices(slices, 15), 1)
assert.equal(pagination.findPageForOffsetInSlices(slices, 99), 2)
assert.equal(pagination.findPageForOffsetInSlices([], 5), 0)

const parsers = loadTsModule('electron/parsers.ts')
const chapters = parsers.splitTextIntoChapters('开头说明\n\n第一章：开始\n这里是正文\n\n第二章 继续\n更多正文')
assert.equal(chapters.length, 3)
assert.equal(chapters[0].title, '前言')
assert.equal(chapters[1].title, '第一章：开始')
assert.equal(chapters[2].title, '第二章 继续')

console.log('logic tests passed')
