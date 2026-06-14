<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
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
import BookCover from './common/BookCover.vue'

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
const showImageExportDialog = ref(false)
const selectedImageTemplate = ref<AnnualReportImageTemplate>('magazine')
const selectedImageTheme = ref<AnnualReportImageTheme>('light')
const { resolvedBucket } = useAppTheme()

const headerTitle = computed(() => {
  if (bookDetail.value) return '单书阅读统计'
  return '阅读统计'
})

const headerDescription = computed(() => {
  if (bookDetail.value) return '查看这本书在当前设备与已同步设备上的累计阅读时长'
  return '汇总今日、本周、本年的阅读时长，并按书籍聚合排行'
})

const loadData = async () => {
  loading.value = true
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
    loading.value = false
  }
}

const syncAndReload = async () => {
  syncing.value = true
  try {
    await mergeRemoteReadingStats()
    await loadData()
  } finally {
    syncing.value = false
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

const openImageExportDialog = () => {
  selectedImageTemplate.value = 'magazine'
  selectedImageTheme.value = resolvedBucket.value === 'dark' ? 'dark' : 'light'
  showImageExportDialog.value = true
}

const exportReportImage = async () => {
  exporting.value = true
  try {
    await exportAnnualReadingReportImage({
      template: selectedImageTemplate.value,
      theme: selectedImageTheme.value,
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
  loadData().catch((error) => console.error('Load reading stats failed:', error))
})

watch(selectedPeriod, () => {
  if (props.bookId) return
  loadData().catch((error) => console.error('Reload reading stats ranking failed:', error))
})

onMounted(async () => {
  try {
    await syncAndReload()
  } catch (error) {
    console.error('Initial reading stats sync failed:', error)
    await loadData()
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
          v-if="!props.bookId"
          @click="openImageExportDialog"
          :disabled="exporting"
          class="app-button px-4 py-2 text-[13px] disabled:opacity-50"
        >
          导出图片
        </button>
        <button
          @click="syncAndReload"
          :disabled="syncing"
          class="app-button app-button-primary px-4 py-2 text-[13px] disabled:opacity-50"
        >
          {{ syncing ? '同步中...' : '同步云端统计' }}
        </button>
      </div>
    </div>

    <Transition name="fade">
      <div
        v-if="showImageExportDialog"
        class="fixed inset-0 app-modal-backdrop z-[220] flex items-center justify-center p-6"
        @click.self="showImageExportDialog = false"
      >
        <div class="app-card app-card-strong w-full max-w-lg p-6">
          <div class="flex items-start justify-between gap-4 mb-6">
            <div>
              <h3 class="app-title text-[18px] font-semibold">导出年度报告图片</h3>
            </div>
            <button
              type="button"
              class="app-icon-button w-9 h-9 flex items-center justify-center text-[18px]"
              :disabled="exporting"
              @click="showImageExportDialog = false"
            >
              x
            </button>
          </div>

          <div class="space-y-5">
            <section>
              <div class="app-section-label text-[12px] mb-2">模板</div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="app-button p-3 text-left"
                  :class="{ 'app-button-primary': selectedImageTemplate === 'magazine' }"
                  @click="selectedImageTemplate = 'magazine'"
                >
                  <div class="text-[13px] font-semibold">阅读杂志感</div>
                </button>
                <button
                  type="button"
                  class="app-button p-3 text-left"
                  :class="{ 'app-button-primary': selectedImageTemplate === 'wrapped' }"
                  @click="selectedImageTemplate = 'wrapped'"
                >
                  <div class="text-[13px] font-semibold">Wrapped 风格</div>
                </button>
              </div>
            </section>

            <section>
              <div class="app-section-label text-[12px] mb-2">主题</div>
              <div class="grid grid-cols-2 gap-2">
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
          </div>

          <div class="flex gap-3 mt-7">
            <button
              type="button"
              class="app-button flex-1 py-2.5 text-[13px] disabled:opacity-50"
              :disabled="exporting"
              @click="showImageExportDialog = false"
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

@media (max-width: 720px) {
  .calendar-grid {
    grid-template-columns: repeat(15, minmax(0, 1fr));
  }
}
</style>
