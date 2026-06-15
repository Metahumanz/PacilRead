<script setup lang="ts">
import { computed } from 'vue'
import {
  buildAnnualReportInsight,
  buildAnnualReportMetricDisplays,
  type AnnualReadingReport,
  type AnnualReportMetricKey,
} from '../../utils/readingInsights'

type AnnualReportImageTemplate = 'magazine' | 'wrapped'
type AnnualReportImageTheme = 'light' | 'dark'

const props = defineProps<{
  report: AnnualReadingReport
  template: AnnualReportImageTemplate
  theme: AnnualReportImageTheme
  summaryMetrics?: AnnualReportMetricKey[]
}>()

const formatHours = (seconds: number) => {
  const hours = Math.max(0, seconds) / 3600
  if (hours >= 100) return Math.round(hours).toLocaleString('zh-CN')
  return hours.toFixed(1)
}

const formatChars = (chars: number) => {
  const safeChars = Math.max(0, Math.round(chars))
  if (safeChars >= 10000) {
    const value = safeChars / 10000
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)}万`
  }
  return safeChars.toLocaleString('zh-CN')
}

const formatBookTime = (seconds: number) => {
  const hours = Math.max(0, seconds) / 3600
  if (hours >= 10) return `${Math.round(hours)} 小时`
  if (hours >= 1) return `${hours.toFixed(1)} 小时`
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} 分钟`
}

const isBookReport = computed(() => props.report.scope === 'book')

const reportTitle = computed(() => (
  isBookReport.value ? `${props.report.year} 单书阅读报告` : `${props.report.year} 年度阅读报告`
))

const reportEyebrow = computed(() => (
  isBookReport.value ? 'PACILREAD · BOOK YEAR IN READING' : 'PACILREAD · YEAR IN READING'
))

const displayBookTitle = computed(() => (
  props.report.bookTitle || props.report.topBooks[0]?.title || '未命名书籍'
))

const summaryText = computed(() => buildAnnualReportInsight(props.report))

const summaryMetrics = computed(() => buildAnnualReportMetricDisplays(props.report, props.summaryMetrics))

const topBooks = computed(() => props.report.topBooks.slice(0, 4))
const topBook = computed(() => props.report.topBooks[0] || null)
const topAuthors = computed(() => props.report.topAuthors.slice(0, 3))
const topTags = computed(() => props.report.topTags.slice(0, 5))
const topSeries = computed(() => props.report.topSeries.slice(0, 3))

const wrappedChips = computed(() => {
  const tags = props.report.topTags.map(item => item.name)
  const authors = props.report.topAuthors.map(item => item.name)
  const series = props.report.topSeries.map(item => item.name)
  const bookAuthor = isBookReport.value ? [props.report.bookAuthor] : []
  return Array.from(new Set([...tags, ...series, ...bookAuthor, ...authors].filter(Boolean))).slice(0, 6)
})

const months = computed(() => {
  const maxSeconds = Math.max(...props.report.monthly.map(month => month.totalSeconds), 1)
  return props.report.monthly.map((month) => {
    const monthNumber = Number(month.month.slice(5, 7))
    return {
      label: `${monthNumber}月`,
      height: Math.max(12, Math.round((month.totalSeconds / maxSeconds) * 150)),
      active: month.totalSeconds > 0,
      value: formatBookTime(month.totalSeconds),
    }
  })
})
</script>

<template>
  <div
    data-report-image-root
    class="annual-report-image"
    :class="[`is-${props.template}`, `theme-${props.theme}`]"
  >
    <template v-if="props.template === 'magazine'">
      <div class="magazine-layout">
        <section class="magazine-hero">
          <header class="magazine-header">
            <div>
              <div class="eyebrow">{{ reportEyebrow }}</div>
              <h1>{{ reportTitle }}</h1>
              <div v-if="isBookReport" class="scope-title">{{ displayBookTitle }}</div>
            </div>
            <div class="year-mark">{{ props.report.year }}</div>
          </header>

          <p class="summary">{{ summaryText }}</p>

          <section class="metric-grid">
            <div
              v-for="metric in summaryMetrics"
              :key="metric.key"
              class="metric-card"
              :class="{ 'is-text': metric.kind === 'text' }"
            >
              <div class="metric-label">{{ metric.label }}</div>
              <div class="metric-value-row">
                <span class="metric-value">{{ metric.value }}</span>
                <span v-if="metric.unit" class="metric-unit">{{ metric.unit }}</span>
              </div>
            </div>
          </section>
        </section>

        <section class="magazine-side">
          <section class="magazine-main">
            <div class="panel top-books-panel">
              <div class="section-kicker">{{ isBookReport ? 'BOOK PROFILE' : 'TOP BOOKS' }}</div>
              <h2>{{ isBookReport ? '本书书档' : '年度书单' }}</h2>
              <ol v-if="topBooks.length" class="book-list">
                <li v-for="(book, index) in topBooks" :key="`${book.title}-${index}`">
                  <span class="book-rank">{{ String(index + 1).padStart(2, '0') }}</span>
                  <div class="book-copy">
                    <strong>{{ book.title || '未命名书籍' }}</strong>
                    <span>{{ book.author || '未知作者' }} · {{ formatBookTime(book.totalSeconds) }}</span>
                  </div>
                </li>
              </ol>
              <div v-else class="empty-line">暂无年度书籍记录</div>
            </div>

            <div class="panel taste-panel">
              <div class="section-kicker">READING MAP</div>
              <h2>阅读地图</h2>

              <div class="taste-group">
                <span>{{ isBookReport ? '作者' : '常读作者' }}</span>
                <div class="pill-row">
                  <template v-if="isBookReport && props.report.bookAuthor">
                    <b>{{ props.report.bookAuthor }}</b>
                  </template>
                  <template v-else>
                    <b v-for="author in topAuthors" :key="author.name">{{ author.name }}</b>
                  </template>
                  <em v-if="topAuthors.length === 0 && !props.report.bookAuthor">暂无作者</em>
                </div>
              </div>

              <div class="taste-group">
                <span>{{ isBookReport ? '标签' : '常读标签' }}</span>
                <div class="pill-row">
                  <b v-for="tag in topTags" :key="tag.name">{{ tag.name }}</b>
                  <em v-if="topTags.length === 0">暂无标签</em>
                </div>
              </div>

              <div class="taste-group">
                <span>{{ isBookReport ? '系列' : '常读系列' }}</span>
                <div class="pill-row">
                  <b v-for="series in topSeries" :key="series.name">{{ series.name }}</b>
                  <em v-if="topSeries.length === 0">暂无系列</em>
                </div>
              </div>
            </div>
          </section>

          <section class="panel month-panel">
            <div class="month-heading">
              <div>
                <div class="section-kicker">MONTHLY RHYTHM</div>
                <h2>12 个月阅读趋势</h2>
              </div>
              <span>{{ formatChars(props.report.totalChars) }} 字</span>
            </div>
            <div class="month-chart">
              <div v-for="month in months" :key="month.label" class="month-column">
                <div class="month-track">
                  <div
                    class="month-bar"
                    :class="{ 'is-empty': !month.active }"
                    :style="{ height: `${month.height}px` }"
                  ></div>
                </div>
                <span>{{ month.label }}</span>
              </div>
            </div>
          </section>
        </section>

        <footer class="report-footer">
          <span>PacilRead Desktop</span>
          <span>Generated from local reading stats</span>
        </footer>
      </div>
    </template>

    <template v-else>
      <div class="wrapped-layout">
        <section class="wrapped-hero">
          <header class="wrapped-header">
            <div>
              <div class="eyebrow">{{ isBookReport ? 'PACILREAD BOOK WRAPPED' : 'PACILREAD WRAPPED' }}</div>
              <h1>{{ props.report.year }}</h1>
            </div>
            <div class="wrapped-badge">{{ isBookReport ? 'BOOK' : 'READING' }}</div>
          </header>

          <section class="hero-number">
            <div class="hero-label">{{ isBookReport ? '这本书今年读了' : '你今年读了' }}</div>
            <div class="hero-value">
              <span>{{ formatHours(props.report.totalSeconds) }}</span>
              <b>小时</b>
            </div>
            <p>{{ summaryText }}</p>
          </section>

          <section class="wrapped-stat-grid">
            <div
              v-for="stat in summaryMetrics"
              :key="stat.key"
              class="wrapped-stat-card"
              :class="{ 'is-text': stat.kind === 'text' }"
            >
              <span>{{ stat.label }}</span>
              <strong>{{ stat.value }}</strong>
              <em v-if="stat.unit">{{ stat.unit }}</em>
            </div>
          </section>
        </section>

        <section class="wrapped-side">
          <section class="wrapped-book">
            <div class="section-kicker">{{ isBookReport ? 'THIS BOOK' : 'YOUR TOP BOOK' }}</div>
            <template v-if="topBook">
              <h2>{{ topBook.title || '未命名书籍' }}</h2>
              <p>{{ topBook.author || '未知作者' }} · {{ formatBookTime(topBook.totalSeconds) }}</p>
            </template>
            <template v-else>
              <h2>暂无年度书籍记录</h2>
              <p>读一会儿书，下一次这里就会亮起来。</p>
            </template>
          </section>

          <section class="wrapped-chips">
            <div class="section-kicker">SIGNALS</div>
            <div class="chip-cloud">
              <span v-for="chip in wrappedChips" :key="chip">{{ chip }}</span>
              <span v-if="wrappedChips.length === 0">暂无标签</span>
            </div>
          </section>

          <section class="wrapped-months">
            <div class="month-heading">
              <div>
                <div class="section-kicker">MONTH BY MONTH</div>
                <h2>阅读节奏</h2>
              </div>
              <span>{{ formatChars(props.report.totalChars) }} 字</span>
            </div>
            <div class="wrapped-bars">
              <div v-for="month in months" :key="month.label" class="wrapped-bar-cell">
                <div
                  class="wrapped-bar"
                  :class="{ 'is-empty': !month.active }"
                  :style="{ height: `${month.height}px` }"
                ></div>
                <span>{{ month.label }}</span>
              </div>
            </div>
          </section>

          <footer class="wrapped-footer">
            <span>PacilRead Desktop</span>
            <span>{{ props.report.year }} Year in Reading</span>
          </footer>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.annual-report-image,
.annual-report-image * {
  box-sizing: border-box;
}

.annual-report-image {
  width: 1920px;
  height: 1080px;
  overflow: hidden;
  position: relative;
  padding: 64px;
  font-family: "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0;
  line-height: 1.32;
}

.annual-report-image h1,
.annual-report-image h2,
.annual-report-image p {
  margin: 0;
}

.annual-report-image.is-magazine.theme-light {
  --report-bg: linear-gradient(180deg, #fbf7ee 0%, #f3ebdc 54%, #e9efe8 100%);
  --report-text: #16201b;
  --report-muted: #667064;
  --report-soft: rgba(255, 255, 255, 0.58);
  --report-panel: rgba(255, 255, 255, 0.74);
  --report-border: rgba(61, 85, 68, 0.18);
  --report-accent: #2f6b4e;
  --report-accent-2: #a55f34;
  --report-accent-3: #446f92;
  --report-chip: rgba(47, 107, 78, 0.14);
  background: var(--report-bg);
  color: var(--report-text);
}

.annual-report-image.is-magazine.theme-dark {
  --report-bg: linear-gradient(180deg, #171b19 0%, #221f1c 54%, #10221f 100%);
  --report-text: #f6efe2;
  --report-muted: #b9b1a2;
  --report-soft: rgba(255, 255, 255, 0.08);
  --report-panel: rgba(255, 255, 255, 0.11);
  --report-border: rgba(255, 255, 255, 0.16);
  --report-accent: #70c7a0;
  --report-accent-2: #d8a85e;
  --report-accent-3: #7da9cb;
  --report-chip: rgba(112, 199, 160, 0.18);
  background: var(--report-bg);
  color: var(--report-text);
}

.annual-report-image.is-wrapped.theme-light {
  --report-bg: linear-gradient(145deg, #eef7ff 0%, #f7ffe9 48%, #fff0df 100%);
  --report-text: #111827;
  --report-muted: #4f5868;
  --report-panel: rgba(255, 255, 255, 0.72);
  --report-border: rgba(17, 24, 39, 0.14);
  --report-accent: #4f46e5;
  --report-accent-2: #16a34a;
  --report-accent-3: #f97316;
  --report-chip: rgba(79, 70, 229, 0.16);
  background: var(--report-bg);
  color: var(--report-text);
}

.annual-report-image.is-wrapped.theme-dark {
  --report-bg: linear-gradient(145deg, #080712 0%, #171024 50%, #071a17 100%);
  --report-text: #fbfbff;
  --report-muted: #bfc3d9;
  --report-panel: rgba(255, 255, 255, 0.10);
  --report-border: rgba(255, 255, 255, 0.16);
  --report-accent: #8b5cf6;
  --report-accent-2: #6ee7b7;
  --report-accent-3: #fb923c;
  --report-chip: rgba(139, 92, 246, 0.20);
  background: var(--report-bg);
  color: var(--report-text);
}

.magazine-layout,
.wrapped-layout {
  position: relative;
  height: 100%;
  display: grid;
  min-width: 0;
}

.magazine-layout {
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
  gap: 40px;
  padding-bottom: 38px;
}

.wrapped-layout {
  grid-template-columns: minmax(0, 1.03fr) minmax(0, 0.97fr);
  gap: 44px;
}

.magazine-hero,
.magazine-side,
.wrapped-hero,
.wrapped-side {
  min-width: 0;
}

.magazine-side,
.wrapped-side {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-height: 0;
}

.magazine-header,
.wrapped-header,
.month-heading,
.report-footer,
.wrapped-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.eyebrow,
.section-kicker,
.year-mark,
.wrapped-badge,
.report-footer,
.wrapped-footer {
  letter-spacing: 0;
  text-transform: uppercase;
}

.eyebrow {
  font-size: 22px;
  font-weight: 760;
  color: var(--report-accent);
}

.magazine-header h1 {
  margin-top: 18px;
  max-width: 620px;
  font-size: 68px;
  line-height: 1.06;
  font-weight: 780;
}

.scope-title {
  margin-top: 18px;
  max-width: 620px;
  font-size: 38px;
  line-height: 1.16;
  font-weight: 760;
  color: var(--report-accent-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.year-mark {
  flex: 0 0 auto;
  width: 128px;
  height: 128px;
  border: 1px solid var(--report-border);
  background: var(--report-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 780;
  color: var(--report-accent-2);
}

.summary {
  margin-top: 48px;
  max-width: 680px;
  font-size: 34px;
  line-height: 1.42;
  color: var(--report-muted);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 52px;
}

.metric-card,
.panel,
.wrapped-stat-card,
.wrapped-book,
.wrapped-chips,
.wrapped-months {
  border: 1px solid var(--report-border);
  background: var(--report-panel);
  border-radius: 8px;
}

.metric-card {
  min-width: 0;
  min-height: 152px;
  padding: 24px;
}

.metric-label {
  font-size: 22px;
  color: var(--report-muted);
}

.metric-value-row {
  margin-top: 18px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.metric-value {
  min-width: 0;
  font-size: 58px;
  line-height: 1;
  font-weight: 820;
  color: var(--report-accent);
}

.metric-card.is-text .metric-value-row {
  align-items: flex-start;
}

.metric-card.is-text .metric-value {
  font-size: 38px;
  line-height: 1.14;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.metric-unit {
  flex: 0 0 auto;
  font-size: 20px;
  color: var(--report-muted);
}

.magazine-main {
  flex: 0 0 520px;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: 20px;
  min-height: 0;
}

.panel {
  padding: 28px;
}

.section-kicker {
  font-size: 17px;
  font-weight: 760;
  color: var(--report-accent-2);
}

.panel h2,
.wrapped-months h2 {
  margin-top: 8px;
  font-size: 32px;
  line-height: 1.12;
  font-weight: 760;
}

.book-list {
  list-style: none;
  padding: 0;
  margin: 26px 0 0;
  display: grid;
  gap: 18px;
}

.book-list li {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  min-height: 72px;
}

.book-rank {
  height: 50px;
  border-radius: 8px;
  background: var(--report-accent);
  color: #fffdf6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
}

.book-copy {
  min-width: 0;
}

.book-copy strong,
.wrapped-book h2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-copy strong {
  font-size: 24px;
  line-height: 1.2;
  font-weight: 760;
}

.book-copy span {
  display: block;
  margin-top: 7px;
  font-size: 18px;
  color: var(--report-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.taste-panel {
  display: flex;
  flex-direction: column;
}

.taste-group {
  margin-top: 26px;
}

.taste-group > span {
  display: block;
  font-size: 19px;
  font-weight: 700;
  color: var(--report-muted);
}

.pill-row,
.chip-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.pill-row b,
.pill-row em,
.chip-cloud span {
  max-width: 100%;
  min-height: 36px;
  padding: 7px 13px;
  border-radius: 8px;
  border: 1px solid var(--report-border);
  background: var(--report-soft);
  color: var(--report-text);
  font-size: 18px;
  font-style: normal;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-line {
  margin-top: 28px;
  font-size: 22px;
  color: var(--report-muted);
}

.month-panel {
  flex: 1;
  min-height: 0;
}

.month-heading h2 {
  margin-top: 8px;
  font-size: 32px;
}

.month-heading > span {
  font-size: 23px;
  font-weight: 760;
  color: var(--report-accent);
}

.month-chart,
.wrapped-bars {
  margin-top: 26px;
  height: 192px;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
}

.month-column,
.wrapped-bar-cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.month-track {
  width: 100%;
  height: 158px;
  display: flex;
  align-items: end;
  border-bottom: 1px solid var(--report-border);
}

.month-bar {
  width: 100%;
  min-height: 12px;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(180deg, var(--report-accent), var(--report-accent-3));
}

.month-bar.is-empty,
.wrapped-bar.is-empty {
  opacity: 0.28;
}

.month-column span,
.wrapped-bar-cell span {
  margin-top: 10px;
  font-size: 15px;
  color: var(--report-muted);
  white-space: nowrap;
}

.report-footer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  font-size: 17px;
  color: var(--report-muted);
}

.wrapped-header h1 {
  margin-top: 10px;
  font-size: 82px;
  line-height: 1;
  font-weight: 860;
}

.wrapped-badge {
  flex: 0 0 auto;
  padding: 16px 20px;
  border-radius: 8px;
  background: var(--report-accent);
  color: #fff;
  font-size: 23px;
  font-weight: 840;
}

.hero-number {
  margin-top: 58px;
}

.hero-label {
  font-size: 36px;
  color: var(--report-muted);
}

.hero-value {
  margin-top: 18px;
  display: flex;
  align-items: baseline;
  gap: 22px;
  min-width: 0;
}

.hero-value span {
  font-size: 172px;
  line-height: 0.92;
  font-weight: 900;
  color: var(--report-accent);
}

.hero-value b {
  flex: 0 0 auto;
  font-size: 44px;
  color: var(--report-accent-2);
}

.hero-number p {
  margin-top: 30px;
  max-width: 780px;
  font-size: 33px;
  line-height: 1.36;
  color: var(--report-muted);
}

.wrapped-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 48px;
}

.wrapped-stat-card {
  min-height: 168px;
  padding: 24px;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.wrapped-stat-card span {
  font-size: 22px;
  color: var(--report-muted);
}

.wrapped-stat-card strong {
  align-self: center;
  font-size: 66px;
  line-height: 1;
  color: var(--report-accent-2);
}

.wrapped-stat-card.is-text strong {
  font-size: 34px;
  line-height: 1.16;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.wrapped-stat-card em {
  font-style: normal;
  font-size: 21px;
  color: var(--report-muted);
}

.wrapped-book {
  padding: 32px;
  min-height: 222px;
}

.wrapped-book h2 {
  margin-top: 12px;
  max-width: 760px;
  font-size: 46px;
  line-height: 1.08;
  font-weight: 840;
}

.wrapped-book p {
  margin-top: 16px;
  font-size: 23px;
  color: var(--report-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wrapped-chips {
  padding: 28px 32px 32px;
}

.chip-cloud span {
  background: var(--report-chip);
  font-size: 23px;
}

.wrapped-months {
  flex: 1;
  min-height: 0;
  padding: 30px 32px;
}

.wrapped-bars {
  height: 204px;
  gap: 14px;
}

.wrapped-bar {
  width: 100%;
  min-height: 12px;
  border-radius: 8px;
  background: linear-gradient(180deg, var(--report-accent-3), var(--report-accent-2));
}

.wrapped-footer {
  font-size: 17px;
  color: var(--report-muted);
}
</style>
