<script setup lang="ts">
import { computed } from 'vue'
import type { AnnualReadingReport } from '../../utils/readingInsights'

type AnnualReportImageTemplate = 'magazine' | 'wrapped'
type AnnualReportImageTheme = 'light' | 'dark'

const props = defineProps<{
  report: AnnualReadingReport
  template: AnnualReportImageTemplate
  theme: AnnualReportImageTheme
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

const summaryText = computed(() => {
  if (props.report.readingDays >= 240) return '这一年，你把阅读变成了一种稳定的日常节奏。'
  if (props.report.longestStreak >= 30) return '这一年，你用一段长长的连续阅读，把注意力留给了书。'
  if (props.report.finishedBooks >= 10) return '这一年，你读完了许多故事，也留下了清晰的轨迹。'
  return '这一年，你把碎片时间攒成了自己的阅读坐标。'
})

const metrics = computed(() => [
  { label: '阅读时长', value: formatHours(props.report.totalSeconds), unit: '小时' },
  { label: '阅读字数', value: formatChars(props.report.totalChars), unit: '字' },
  { label: '阅读天数', value: props.report.readingDays.toLocaleString('zh-CN'), unit: '天' },
  { label: '最长连续', value: props.report.longestStreak.toLocaleString('zh-CN'), unit: '天' },
])

const wrappedStats = computed(() => [
  { label: '最长连续', value: props.report.longestStreak.toLocaleString('zh-CN'), unit: '天' },
  { label: '完成书籍', value: props.report.finishedBooks.toLocaleString('zh-CN'), unit: '本' },
  { label: '阅读天数', value: props.report.readingDays.toLocaleString('zh-CN'), unit: '天' },
])

const topBooks = computed(() => props.report.topBooks.slice(0, 5))
const topBook = computed(() => props.report.topBooks[0] || null)
const topAuthors = computed(() => props.report.topAuthors.slice(0, 4))
const topTags = computed(() => props.report.topTags.slice(0, 6))
const topSeries = computed(() => props.report.topSeries.slice(0, 4))

const wrappedChips = computed(() => {
  const tags = props.report.topTags.map(item => item.name)
  const authors = props.report.topAuthors.map(item => item.name)
  return [...tags, ...authors].filter(Boolean).slice(0, 8)
})

const months = computed(() => {
  const maxSeconds = Math.max(...props.report.monthly.map(month => month.totalSeconds), 1)
  return props.report.monthly.map((month) => {
    const monthNumber = Number(month.month.slice(5, 7))
    return {
      label: `${monthNumber}月`,
      height: Math.max(12, Math.round((month.totalSeconds / maxSeconds) * 168)),
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
      <header class="magazine-header">
        <div>
          <div class="eyebrow">PACILREAD · YEAR IN READING</div>
          <h1>{{ props.report.year }} 年度阅读报告</h1>
        </div>
        <div class="year-mark">{{ props.report.year }}</div>
      </header>

      <p class="summary">{{ summaryText }}</p>

      <section class="metric-grid">
        <div v-for="metric in metrics" :key="metric.label" class="metric-card">
          <div class="metric-label">{{ metric.label }}</div>
          <div class="metric-value-row">
            <span class="metric-value">{{ metric.value }}</span>
            <span class="metric-unit">{{ metric.unit }}</span>
          </div>
        </div>
      </section>

      <section class="magazine-main">
        <div class="panel top-books-panel">
          <div class="section-kicker">TOP BOOKS</div>
          <h2>年度书单</h2>
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
            <span>常读作者</span>
            <div class="pill-row">
              <b v-for="author in topAuthors" :key="author.name">{{ author.name }}</b>
              <em v-if="topAuthors.length === 0">暂无作者</em>
            </div>
          </div>

          <div class="taste-group">
            <span>常读标签</span>
            <div class="pill-row">
              <b v-for="tag in topTags" :key="tag.name">{{ tag.name }}</b>
              <em v-if="topTags.length === 0">暂无标签</em>
            </div>
          </div>

          <div class="taste-group">
            <span>常读系列</span>
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

      <footer class="report-footer">
        <span>PacilRead Desktop</span>
        <span>Generated from local reading stats</span>
      </footer>
    </template>

    <template v-else>
      <header class="wrapped-header">
        <div>
          <div class="eyebrow">PACILREAD WRAPPED</div>
          <h1>{{ props.report.year }}</h1>
        </div>
        <div class="wrapped-badge">READING</div>
      </header>

      <section class="hero-number">
        <div class="hero-label">你今年读了</div>
        <div class="hero-value">
          <span>{{ formatHours(props.report.totalSeconds) }}</span>
          <b>小时</b>
        </div>
        <p>{{ summaryText }}</p>
      </section>

      <section class="wrapped-stat-grid">
        <div v-for="stat in wrappedStats" :key="stat.label" class="wrapped-stat-card">
          <span>{{ stat.label }}</span>
          <strong>{{ stat.value }}</strong>
          <em>{{ stat.unit }}</em>
        </div>
      </section>

      <section class="wrapped-book">
        <div class="section-kicker">YOUR TOP BOOK</div>
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
    </template>
  </div>
</template>

<style scoped>
.annual-report-image,
.annual-report-image * {
  box-sizing: border-box;
}

.annual-report-image {
  width: 1080px;
  height: 1920px;
  overflow: hidden;
  position: relative;
  padding: 78px 76px;
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

.magazine-header,
.wrapped-header,
.month-heading,
.report-footer,
.wrapped-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
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
  font-size: 25px;
  font-weight: 760;
  color: var(--report-accent);
}

.magazine-header h1 {
  margin-top: 16px;
  font-size: 70px;
  line-height: 1.08;
  font-weight: 760;
  max-width: 690px;
}

.year-mark {
  width: 150px;
  height: 150px;
  border: 1px solid var(--report-border);
  background: var(--report-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 34px;
  font-weight: 780;
  color: var(--report-accent-2);
}

.summary {
  margin-top: 58px;
  font-size: 36px;
  line-height: 1.42;
  max-width: 850px;
  color: var(--report-muted);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-top: 56px;
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
  min-height: 188px;
  padding: 26px 20px;
}

.metric-label {
  font-size: 22px;
  color: var(--report-muted);
}

.metric-value-row {
  margin-top: 22px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.metric-value {
  min-width: 0;
  font-size: 48px;
  line-height: 1;
  font-weight: 820;
  color: var(--report-accent);
}

.metric-unit {
  flex: 0 0 auto;
  font-size: 20px;
  color: var(--report-muted);
}

.magazine-main {
  margin-top: 46px;
  display: grid;
  grid-template-columns: 1.18fr 0.82fr;
  gap: 22px;
}

.panel {
  padding: 34px;
}

.section-kicker {
  font-size: 18px;
  font-weight: 760;
  color: var(--report-accent-2);
}

.panel h2,
.wrapped-months h2 {
  margin-top: 8px;
  font-size: 34px;
  line-height: 1.12;
  font-weight: 760;
}

.book-list {
  list-style: none;
  padding: 0;
  margin: 30px 0 0;
  display: grid;
  gap: 21px;
}

.book-list li {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  min-height: 82px;
}

.book-rank {
  height: 56px;
  border-radius: 8px;
  background: var(--report-accent);
  color: #fffdf6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
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
  font-size: 28px;
  line-height: 1.22;
  font-weight: 760;
}

.book-copy span {
  display: block;
  margin-top: 8px;
  font-size: 20px;
  color: var(--report-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.taste-panel {
  display: flex;
  flex-direction: column;
  min-height: 520px;
}

.taste-group {
  margin-top: 34px;
}

.taste-group > span {
  display: block;
  font-size: 21px;
  font-weight: 700;
  color: var(--report-muted);
}

.pill-row,
.chip-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.pill-row b,
.pill-row em,
.chip-cloud span {
  max-width: 100%;
  min-height: 40px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--report-border);
  background: var(--report-soft);
  color: var(--report-text);
  font-size: 20px;
  font-style: normal;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-line {
  margin-top: 34px;
  font-size: 24px;
  color: var(--report-muted);
}

.month-panel {
  margin-top: 22px;
}

.month-heading h2 {
  margin-top: 8px;
  font-size: 34px;
}

.month-heading > span {
  font-size: 24px;
  font-weight: 760;
  color: var(--report-accent);
}

.month-chart,
.wrapped-bars {
  margin-top: 34px;
  height: 230px;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
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
  height: 176px;
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
  margin-top: 12px;
  font-size: 16px;
  color: var(--report-muted);
  white-space: nowrap;
}

.report-footer,
.wrapped-footer {
  position: absolute;
  left: 76px;
  right: 76px;
  bottom: 58px;
  font-size: 18px;
  color: var(--report-muted);
}

.wrapped-header h1 {
  margin-top: 10px;
  font-size: 84px;
  line-height: 1;
  font-weight: 860;
}

.wrapped-badge {
  padding: 18px 22px;
  border-radius: 8px;
  background: var(--report-accent);
  color: #fff;
  font-size: 24px;
  font-weight: 840;
}

.hero-number {
  margin-top: 86px;
}

.hero-label {
  font-size: 38px;
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
  font-size: 188px;
  line-height: 0.92;
  font-weight: 900;
  color: var(--report-accent);
}

.hero-value b {
  flex: 0 0 auto;
  font-size: 46px;
  color: var(--report-accent-2);
}

.hero-number p {
  margin-top: 34px;
  max-width: 780px;
  font-size: 34px;
  line-height: 1.38;
  color: var(--report-muted);
}

.wrapped-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 54px;
}

.wrapped-stat-card {
  min-height: 208px;
  padding: 26px 24px;
  display: grid;
  grid-template-rows: auto 1fr auto;
}

.wrapped-stat-card span {
  font-size: 23px;
  color: var(--report-muted);
}

.wrapped-stat-card strong {
  align-self: center;
  font-size: 72px;
  line-height: 1;
  color: var(--report-accent-2);
}

.wrapped-stat-card em {
  font-style: normal;
  font-size: 22px;
  color: var(--report-muted);
}

.wrapped-book {
  margin-top: 28px;
  padding: 34px;
  min-height: 230px;
}

.wrapped-book h2 {
  margin-top: 12px;
  max-width: 760px;
  font-size: 48px;
  line-height: 1.08;
  font-weight: 840;
}

.wrapped-book p {
  margin-top: 16px;
  font-size: 24px;
  color: var(--report-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wrapped-chips {
  margin-top: 24px;
  padding: 30px 34px 34px;
}

.chip-cloud span {
  background: var(--report-chip);
  font-size: 24px;
}

.wrapped-months {
  margin-top: 24px;
  padding: 30px 34px 34px;
}

.wrapped-bars {
  height: 230px;
  gap: 14px;
}

.wrapped-bar {
  width: 100%;
  min-height: 12px;
  border-radius: 8px;
  background: linear-gradient(180deg, var(--report-accent-3), var(--report-accent-2));
}
</style>
