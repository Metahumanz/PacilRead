<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ANNUAL_REPORT_IMAGE_HEIGHT,
  ANNUAL_REPORT_IMAGE_WIDTH,
  createAnnualReadingReport,
  fetchReadingStatsBookDetail,
  fetchReadingStatsBookRank,
  fetchReadingCalendar,
  fetchReadingStatsOverview,
  formatDuration,
  mergeRemoteReadingStats,
  exportAnnualReadingReport,
  exportAnnualReadingReportImage,
  type AnnualReportImageTemplate,
  type AnnualReportImageTheme,
  type ReadingCalendarSummary,
  type ReadingStatsBookDetail,
  type ReadingStatsBookRankItem,
  type ReadingStatsPeriod,
} from '../composables/useReadingStats'
import { useAppTheme } from '../composables/useAppTheme'
import { useSettings } from '../composables/useSettings'
import {
  getAnnualReportAvailableMetricDisplays,
  isAnnualReportMetricKey,
  sanitizeAnnualReportMetrics,
  type AnnualReadingReport,
  type AnnualReportMetricKey,
} from '../utils/readingInsights'
import BookCover from './common/BookCover.vue'
import AnnualReportImageCard from './reports/AnnualReportImageCard.vue'

const annualReportMetricStorageKey = (scope: 'global' | 'book') => (
  `pacilread.annual_report.${scope}_metrics`
)

const props = defineProps<{
  bookId: number | null
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'open-book-stats', bookId: number): void
}>()

const loading = ref(true)
const syncing = ref(false)
const selectedPeriod = ref<ReadingStatsPeriod>('week')
const overview = ref({ today: 0, week: 0, year: 0 })
const bookDetail = ref<ReadingStatsBookDetail | null>(null)
const ranking = ref<ReadingStatsBookRankItem[]>([])
const calendar = ref<ReadingCalendarSummary>({ days: [], longestStreak: 0 })
const exporting = ref(false)
const imagePreviewLoading = ref(false)
const showImageExportDialog = ref(false)
const selectedImageTemplate = ref<AnnualReportImageTemplate>('magazine')
const selectedImageTheme = ref<AnnualReportImageTheme>('light')
const previewReport = ref<AnnualReadingReport | null>(null)
const previewFrame = ref<HTMLElement | null>(null)
const previewScale = ref(0.5)
const selectedAnnualReportMetrics = ref<AnnualReportMetricKey[]>([])
const syncStatusText = ref('')
const { resolvedBucket } = useAppTheme()
const { webdavUrl, webdavSyncReadingStats } = useSettings()

let syncRunId = 0
let syncStatusTimer: number | null = null
let previewResizeObserver: ResizeObserver | null = null

const headerTitle = computed(() => {
  if (props.bookId) return '单书阅读统计'
  return '阅读统计'
})

const headerDescription = computed(() => {
  if (props.bookId) return '查看这本书在当前设备与已同步设备上的累计阅读时长'
  return '汇总今日、本周、本年的阅读时长，并按书籍聚合排行'
})

const canSyncReadingStats = computed(() => (
  Boolean(webdavUrl.value.trim()) && webdavSyncReadingStats.value
))

const previewCardStyle = computed(() => ({
  width: `${ANNUAL_REPORT_IMAGE_WIDTH}px`,
  height: `${ANNUAL_REPORT_IMAGE_HEIGHT}px`,
  transform: `scale(${previewScale.value})`,
}))

const annualReportMetricOptions = computed(() => (
  previewReport.value ? getAnnualReportAvailableMetricDisplays(previewReport.value) : []
))

const selectedAnnualReportMetricSet = computed(() => new Set(selectedAnnualReportMetrics.value))

const setSyncStatus = (message: string, autoClear = false) => {
  syncStatusText.value = message
  if (syncStatusTimer !== null) {
    window.clearTimeout(syncStatusTimer)
    syncStatusTimer = null
  }
  if (autoClear && message) {
    syncStatusTimer = window.setTimeout(() => {
      syncStatusText.value = ''
      syncStatusTimer = null
    }, 3500)
  }
}

const loadData = async (options: { showLoading?: boolean } = {}) => {
  const showLoading = options.showLoading ?? true
  if (showLoading) loading.value = true
  try {
    overview.value = await fetchReadingStatsOverview(props.bookId)
    calendar.value = await fetchReadingCalendar(props.bookId)
    if (props.bookId) {
      bookDetail.value = await fetchReadingStatsBookDetail(props.bookId)
      ranking.value = []
    } else {
      bookDetail.value = null
      ranking.value = await fetchReadingStatsBookRank(selectedPeriod.value)
    }
  } finally {
    if (showLoading) loading.value = false
  }
}

const syncAndReload = async (source: 'auto' | 'manual' = 'manual') => {
  const runId = ++syncRunId
  if (!canSyncReadingStats.value) {
    if (source === 'manual') setSyncStatus('未启用云端统计同步，当前展示本地统计', true)
    return
  }

  syncing.value = true
  setSyncStatus('正在同步云端统计...')
  try {
    const mergedCount = await mergeRemoteReadingStats()
    if (runId !== syncRunId) return
    await loadData({ showLoading: false })
    setSyncStatus(
      mergedCount > 0 ? '已同步云端统计，数据已刷新' : '已检查云端统计，当前展示本地统计',
      true,
    )
  } catch (error) {
    if (runId !== syncRunId) return
    console.error('Reading stats sync failed:', error)
    setSyncStatus('云端同步失败，已展示本地统计', true)
  } finally {
    if (runId === syncRunId) syncing.value = false
  }
}

const toDateString = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const calendarCells = computed(() => {
  const byDate = new Map(calendar.value.days.map(day => [day.date, day]))
  const cells: Array<{ date: string; durationSeconds: number; charCount: number }> = []
  const today = new Date()
  for (let i = 89; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const key = toDateString(date)
    const day = byDate.get(key)
    cells.push(day || { date: key, durationSeconds: 0, charCount: 0 })
  }
  return cells
})

const calendarIntensity = (seconds: number) => {
  if (seconds <= 0) return 0
  if (seconds < 10 * 60) return 1
  if (seconds < 30 * 60) return 2
  if (seconds < 60 * 60) return 3
  return 4
}

const formatSpeed = (value: number) => `${Math.round(value)} 字/分钟`

const formatEstimate = (seconds: number | null) => {
  if (seconds === null) return '暂无足够数据'
  if (seconds <= 0) return '已读完'
  return formatDuration(seconds)
}

const exportReport = async (format: 'html' | 'json') => {
  exporting.value = true
  try {
    await exportAnnualReadingReport(format)
  } finally {
    exporting.value = false
  }
}

const readStoredAnnualReportMetrics = (scope: 'global' | 'book'): AnnualReportMetricKey[] => {
  try {
    const raw = window.localStorage.getItem(annualReportMetricStorageKey(scope))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is AnnualReportMetricKey => (
      typeof item === 'string' && isAnnualReportMetricKey(item)
    ))
  } catch (_) {
    return []
  }
}

const saveStoredAnnualReportMetrics = (scope: 'global' | 'book', metrics: AnnualReportMetricKey[]) => {
  try {
    window.localStorage.setItem(annualReportMetricStorageKey(scope), JSON.stringify(metrics))
  } catch (_) {}
}

const resetAnnualReportMetricSelection = (report: AnnualReadingReport) => {
  const initialMetrics = selectedAnnualReportMetrics.value.length
    ? selectedAnnualReportMetrics.value
    : readStoredAnnualReportMetrics(report.scope)
  selectedAnnualReportMetrics.value = sanitizeAnnualReportMetrics(report, initialMetrics)
  saveStoredAnnualReportMetrics(report.scope, selectedAnnualReportMetrics.value)
}

const selectAnnualReportMetric = (metric: AnnualReportMetricKey) => {
  if (!previewReport.value) return
  if (selectedAnnualReportMetrics.value.includes(metric)) return
  const nextMetrics = selectedAnnualReportMetrics.value.length >= 3
    ? selectedAnnualReportMetrics.value.slice(1)
    : [...selectedAnnualReportMetrics.value]
  nextMetrics.push(metric)
  selectedAnnualReportMetrics.value = sanitizeAnnualReportMetrics(previewReport.value, nextMetrics)
  saveStoredAnnualReportMetrics(previewReport.value.scope, selectedAnnualReportMetrics.value)
}

const updatePreviewScale = () => {
  const frameWidth = previewFrame.value?.clientWidth || 0
  if (frameWidth <= 0) return
  previewScale.value = Math.min(1, frameWidth / ANNUAL_REPORT_IMAGE_WIDTH)
}

const attachPreviewResizeObserver = async () => {
  await nextTick()
  previewResizeObserver?.disconnect()
  previewResizeObserver = null
  updatePreviewScale()
  if (!previewFrame.value) return
  previewResizeObserver = new ResizeObserver(updatePreviewScale)
  previewResizeObserver.observe(previewFrame.value)
}

const closeImageExportDialog = () => {
  if (exporting.value) return
  showImageExportDialog.value = false
  previewReport.value = null
}

const openImageExportDialog = async () => {
  selectedImageTemplate.value = 'magazine'
  selectedImageTheme.value = resolvedBucket.value === 'dark' ? 'dark' : 'light'
  selectedAnnualReportMetrics.value = []
  imagePreviewLoading.value = true
  try {
    const report = await createAnnualReadingReport(new Date().getFullYear(), { bookId: props.bookId })
    if (report.totalSeconds <= 0 && report.totalChars <= 0) {
      throw new Error(props.bookId ? '这本书今年还没有足够的阅读统计' : '今年还没有足够的阅读统计')
    }
    previewReport.value = report
    resetAnnualReportMetricSelection(report)
    showImageExportDialog.value = true
    await attachPreviewResizeObserver()
  } catch (error) {
    console.error('Prepare annual report preview failed:', error)
    window.alert(error instanceof Error ? error.message : '生成预览失败')
  } finally {
    imagePreviewLoading.value = false
  }
}

const exportReportImage = async () => {
  exporting.value = true
  try {
    await exportAnnualReadingReportImage({
      template: selectedImageTemplate.value,
      theme: selectedImageTheme.value,
      bookId: props.bookId,
      summaryMetrics: selectedAnnualReportMetrics.value,
    })
    showImageExportDialog.value = false
  } catch (error) {
    console.error('Export annual report image failed:', error)
    window.alert(error instanceof Error ? error.message : '导出图片失败')
  } finally {
    exporting.value = false
  }
}

watch(() => props.bookId, () => {
  loadData()
    .then(() => syncAndReload('auto'))
    .catch((error) => console.error('Load reading stats failed:', error))
})

watch(selectedPeriod, () => {
  if (props.bookId) return
  loadData().catch((error) => console.error('Reload reading stats ranking failed:', error))
})

onMounted(async () => {
  try {
    await loadData()
    void syncAndReload('auto')
  } catch (error) {
    console.error('Initial reading stats load failed:', error)
    loading.value = false
  }
})

onUnmounted(() => {
  syncRunId++
  if (syncStatusTimer !== null) window.clearTimeout(syncStatusTimer)
  syncStatusTimer = null
  previewResizeObserver?.disconnect()
  previewResizeObserver = null
})

watch(showImageExportDialog, (shown) => {
  if (shown) {
    attachPreviewResizeObserver().catch((error) => console.error('Attach report preview observer failed:', error))
  } else {
    previewResizeObserver?.disconnect()
    previewResizeObserver = null
  }
})
</script>

<template>
  <div class="pt-6 pb-20">
    <div class="flex items-start justify-between gap-4 mb-8">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <button
            @click="emit('back')"
            class="app-button px-3 py-1.5 text-[13px]"
          >
            返回
          </button>
          <h2 class="app-title text-[22px] font-semibold">{{ headerTitle }}</h2>
        </div>
        <p class="app-muted text-[13px]">{{ headerDescription }}</p>
        <p v-if="syncStatusText" class="app-muted text-[12px] mt-2">{{ syncStatusText }}</p>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <button
          v-if="!props.bookId"
          @click="exportReport('html')"
          :disabled="exporting"
          class="app-button px-4 py-2 text-[13px] disabled:opacity-50"
        >
          导出 HTML
        </button>
        <button
          v-if="!props.bookId"
          @click="exportReport('json')"
          :disabled="exporting"
          class="app-button px-4 py-2 text-[13px] disabled:opacity-50"
        >
          导出 JSON
        </button>
        <button
          @click="openImageExportDialog"
          :disabled="exporting || imagePreviewLoading"
          class="app-button px-4 py-2 text-[13px] disabled:opacity-50"
        >
          {{ imagePreviewLoading ? '准备预览...' : '导出图片' }}
        </button>
        <button
          @click="syncAndReload()"
          :disabled="syncing"
          class="app-button app-button-primary px-4 py-2 text-[13px] disabled:opacity-50"
        >
          {{ syncing ? '同步中...' : '同步云端统计' }}
        </button>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showImageExportDialog"
          class="fixed inset-0 app-modal-backdrop z-[1000] flex items-center justify-center p-6"
          @click.self="closeImageExportDialog"
        >
          <div class="app-card app-card-strong w-full max-w-[1240px] max-h-[calc(100vh-3rem)] overflow-y-auto p-6">
            <div class="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 class="app-title text-[18px] font-semibold">
                  {{ previewReport?.scope === 'book' ? '导出单书年度报告图片' : '导出年度报告图片' }}
                </h3>
                <p class="app-muted text-[12px] mt-1">横屏 1920 x 1080 PNG</p>
              </div>
              <button
                type="button"
                class="app-icon-button w-9 h-9 flex items-center justify-center text-[18px]"
                :disabled="exporting"
                @click="closeImageExportDialog"
              >
                x
              </button>
            </div>

            <div class="image-export-layout">
              <div ref="previewFrame" class="report-preview-frame">
                <div v-if="previewReport" class="report-preview-scale" :style="previewCardStyle">
                  <AnnualReportImageCard
                    :report="previewReport"
                    :template="selectedImageTemplate"
                    :theme="selectedImageTheme"
                    :summary-metrics="selectedAnnualReportMetrics"
                  />
                </div>
                <div v-else class="h-full flex items-center justify-center app-muted text-[13px]">
                  正在生成预览...
                </div>
              </div>

              <div class="image-export-controls">
                <section>
                  <div class="app-section-label text-[12px] mb-2">风格</div>
                  <div class="grid grid-cols-2 lg:grid-cols-1 gap-2">
                    <button
                      type="button"
                      class="app-button p-3 text-left"
                      :class="{ 'app-button-primary': selectedImageTemplate === 'magazine' }"
                      @click="selectedImageTemplate = 'magazine'"
                    >
                      <div class="text-[13px] font-semibold">静读留白</div>
                    </button>
                    <button
                      type="button"
                      class="app-button p-3 text-left"
                      :class="{ 'app-button-primary': selectedImageTemplate === 'wrapped' }"
                      @click="selectedImageTemplate = 'wrapped'"
                    >
                      <div class="text-[13px] font-semibold">高光节奏</div>
                    </button>
                  </div>
                </section>

                <section>
                  <div class="app-section-label text-[12px] mb-2">主题</div>
                  <div class="grid grid-cols-2 lg:grid-cols-1 gap-2">
                    <button
                      type="button"
                      class="app-button p-3 text-left"
                      :class="{ 'app-button-primary': selectedImageTheme === 'light' }"
                      @click="selectedImageTheme = 'light'"
                    >
                      <div class="text-[13px] font-semibold">浅色</div>
                    </button>
                    <button
                      type="button"
                      class="app-button p-3 text-left"
                      :class="{ 'app-button-primary': selectedImageTheme === 'dark' }"
                      @click="selectedImageTheme = 'dark'"
                    >
                      <div class="text-[13px] font-semibold">深色</div>
                    </button>
                  </div>
                </section>

                <section v-if="annualReportMetricOptions.length">
                  <div class="app-section-label text-[12px] mb-1">年度摘要</div>
                  <p class="app-muted text-[11px] mb-2">选择 3 项，继续选择会替换最早一项</p>
                  <div class="metric-option-list">
                    <button
                      v-for="metric in annualReportMetricOptions"
                      :key="metric.key"
                      type="button"
                      class="metric-option"
                      :class="{ 'is-active': selectedAnnualReportMetricSet.has(metric.key) }"
                      @click="selectAnnualReportMetric(metric.key)"
                    >
                      <span>{{ metric.label }}</span>
                      <strong>{{ metric.fullValue }}</strong>
                    </button>
                  </div>
                </section>
              </div>
            </div>

            <div class="flex gap-3 mt-7">
              <button
                type="button"
                class="app-button flex-1 py-2.5 text-[13px] disabled:opacity-50"
                :disabled="exporting"
                @click="closeImageExportDialog"
              >
                取消
              </button>
              <button
                type="button"
                class="app-button app-button-primary flex-1 py-2.5 text-[13px] disabled:opacity-50"
                :disabled="exporting"
                @click="exportReportImage"
              >
                {{ exporting ? '导出中...' : '保存 PNG' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div v-if="bookDetail" class="app-card mb-8 p-5">
      <div class="flex items-center gap-4">
        <BookCover
          class="w-20 h-28 rounded-[var(--app-radius-card)] shrink-0 border border-[var(--app-border)]"
          :cover-path="bookDetail.coverPath"
          :title="bookDetail.title"
        />
        <div class="min-w-0">
          <div class="text-[18px] font-semibold app-title truncate">{{ bookDetail.title }}</div>
          <div class="text-[13px] app-muted mt-1">{{ bookDetail.author || '未知作者' }}</div>
          <div class="flex flex-wrap gap-3 mt-4 text-[12px] app-muted">
            <span>章节进度：第 {{ bookDetail.progressIndex + 1 }} 章</span>
            <span>最近阅读：{{ bookDetail.lastRead ? new Date(bookDetail.lastRead).toLocaleString() : '暂无' }}</span>
            <span>阅读速度：{{ bookDetail.speed.hasEnoughData ? formatSpeed(bookDetail.speed.charsPerMinute) : '暂无足够数据' }}</span>
            <span>预计读完：{{ formatEstimate(bookDetail.estimate.remainingSeconds) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div class="stats-card">
        <div class="stats-label">今日</div>
        <div class="stats-value">{{ formatDuration(overview.today) }}</div>
      </div>
      <div class="stats-card">
        <div class="stats-label">本周</div>
        <div class="stats-value">{{ formatDuration(overview.week) }}</div>
      </div>
      <div class="stats-card">
        <div class="stats-label">本年</div>
        <div class="stats-value">{{ formatDuration(overview.year) }}</div>
      </div>
    </div>

    <div v-if="!props.bookId" class="mb-4 flex items-center gap-2">
      <button
        @click="selectedPeriod = 'today'"
        :class="{ 'is-active': selectedPeriod === 'today' }"
        class="app-chip px-3 py-1.5 text-[12px] font-medium transition-colors"
      >
        今日排行
      </button>
      <button
        @click="selectedPeriod = 'week'"
        :class="{ 'is-active': selectedPeriod === 'week' }"
        class="app-chip px-3 py-1.5 text-[12px] font-medium transition-colors"
      >
        本周排行
      </button>
      <button
        @click="selectedPeriod = 'year'"
        :class="{ 'is-active': selectedPeriod === 'year' }"
        class="app-chip px-3 py-1.5 text-[12px] font-medium transition-colors"
      >
        本年排行
      </button>
    </div>

    <div v-if="loading" class="py-16 text-center app-muted">
      正在整理统计数据...
    </div>

    <template v-else>
      <div class="app-card p-5 mb-8">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <div class="text-[15px] font-semibold app-title">连续阅读日历</div>
            <div class="text-[12px] app-muted mt-1">最长连续 {{ calendar.longestStreak }} 天</div>
          </div>
          <div class="text-[11px] app-muted">近 90 天</div>
        </div>
        <div class="calendar-grid">
          <div
            v-for="day in calendarCells"
            :key="day.date"
            class="calendar-cell"
            :class="`is-${calendarIntensity(day.durationSeconds)}`"
            :title="`${day.date} · ${formatDuration(day.durationSeconds)} · ${day.charCount} 字`"
          ></div>
        </div>
      </div>

      <div
        v-if="!props.bookId && ranking.length === 0"
        class="app-card p-10 text-center app-muted"
      >
        暂无阅读统计数据，开启记录后读一会儿书就会在这里出现。
      </div>

      <div
        v-else-if="!props.bookId"
        class="app-card app-divide-y overflow-hidden"
      >
        <button
          v-for="item in ranking"
          :key="item.bookIdentity"
          class="app-row w-full flex items-center gap-4 px-5 py-4 text-left"
          @click="item.localBookId && emit('open-book-stats', item.localBookId)"
        >
          <BookCover
            class="w-12 h-16 rounded-[var(--app-radius-input)] shrink-0 border border-[var(--app-border)]"
            :cover-path="item.coverPath"
            :title="item.bookTitle"
          />
          <div class="flex-1 min-w-0">
            <div class="text-[14px] font-semibold app-title truncate">{{ item.bookTitle || '未命名书籍' }}</div>
            <div class="text-[12px] app-muted truncate mt-1">{{ item.bookAuthor || '未知作者' }}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-[13px] font-semibold app-accent-text">{{ formatDuration(item.totalSeconds) }}</div>
            <div class="text-[11px] app-muted mt-1">{{ new Date(item.lastUpdatedAt).toLocaleString() }}</div>
          </div>
        </button>
      </div>

      <div
        v-else
        class="app-card p-8 text-center app-muted"
      >
        这本书的累计阅读时长已经汇总在上面的周期卡片里。
      </div>
    </template>
  </div>
</template>

<style scoped>
.stats-card {
  background: var(--app-card);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-card);
  padding: 1.25rem;
  box-shadow: var(--app-shadow);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
}

.stats-label {
  font-size: 12px;
  color: var(--app-text-muted);
  margin-bottom: 0.5rem;
}

.stats-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--app-text);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(30, minmax(0, 1fr));
  gap: 4px;
}

.calendar-cell {
  aspect-ratio: 1;
  border-radius: 4px;
  background: color-mix(in srgb, var(--app-text-muted) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-border) 70%, transparent);
}

.calendar-cell.is-1 { background: color-mix(in srgb, var(--app-accent) 24%, transparent); }
.calendar-cell.is-2 { background: color-mix(in srgb, var(--app-accent) 42%, transparent); }
.calendar-cell.is-3 { background: color-mix(in srgb, var(--app-accent) 62%, transparent); }
.calendar-cell.is-4 { background: color-mix(in srgb, var(--app-accent) 82%, transparent); }

.image-export-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  gap: 1.25rem;
  align-items: start;
  min-width: 0;
}

.report-preview-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-input);
  background: rgba(var(--app-glass-strong-rgb), 0.38);
}

.report-preview-scale {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
  pointer-events: none;
}

.image-export-controls {
  display: grid;
  gap: 1.25rem;
}

.metric-option-list {
  display: grid;
  gap: 0.5rem;
  max-height: 18.5rem;
  overflow-y: auto;
  padding-right: 0.125rem;
}

.metric-option {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 0.25rem;
  text-align: left;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-input);
  background: rgba(var(--app-glass-strong-rgb), var(--app-glass-opacity, 0.8));
  color: var(--app-text);
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.metric-option:hover {
  background: rgba(var(--app-glass-strong-rgb), 0.96);
}

.metric-option.is-active {
  background: var(--app-accent);
  border-color: var(--app-accent);
  color: var(--app-text-on-primary);
}

.metric-option span,
.metric-option strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-option span {
  font-size: 11px;
  color: var(--app-text-muted);
}

.metric-option.is-active span {
  color: color-mix(in srgb, var(--app-text-on-primary) 78%, transparent);
}

.metric-option strong {
  font-size: 13px;
  font-weight: 700;
}

@media (max-width: 1024px) {
  .image-export-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .calendar-grid {
    grid-template-columns: repeat(15, minmax(0, 1fr));
  }
}
</style>
