<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  fetchReadingStatsBookDetail,
  fetchReadingStatsBookRank,
  fetchReadingStatsOverview,
  formatDuration,
  mergeRemoteReadingStats,
  type ReadingStatsBookDetail,
  type ReadingStatsBookRankItem,
  type ReadingStatsPeriod,
} from '../composables/useReadingStats'

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
            class="px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-[13px] font-medium"
          >
            返回
          </button>
          <h2 class="text-[22px] font-semibold text-slate-800 dark:text-white/90 tracking-wide">{{ headerTitle }}</h2>
        </div>
        <p class="text-slate-500 dark:text-white/50 text-[13px]">{{ headerDescription }}</p>
      </div>

      <button
        @click="syncAndReload"
        :disabled="syncing"
        class="px-4 py-2 rounded-lg bg-[#005fb8] text-white text-[13px] font-medium hover:bg-[#005fb8]/90 disabled:opacity-50 transition-colors"
      >
        {{ syncing ? '同步中...' : '同步云端统计' }}
      </button>
    </div>

    <div v-if="bookDetail" class="mb-8 bg-white dark:bg-[#2d2d2d] rounded-2xl border border-black/5 dark:border-white/[0.06] shadow-sm p-5">
      <div class="flex items-center gap-4">
        <div class="w-20 h-28 rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 shrink-0 border border-black/5 dark:border-white/10">
          <img
            v-if="bookDetail.coverPath"
            :src="bookDetail.coverPath"
            class="w-full h-full object-cover"
            alt="封面"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-3xl opacity-50">📖</div>
        </div>
        <div class="min-w-0">
          <div class="text-[18px] font-semibold text-slate-800 dark:text-white/90 truncate">{{ bookDetail.title }}</div>
          <div class="text-[13px] text-slate-500 dark:text-white/50 mt-1">{{ bookDetail.author || '未知作者' }}</div>
          <div class="flex flex-wrap gap-3 mt-4 text-[12px] text-slate-500 dark:text-white/45">
            <span>章节进度：第 {{ bookDetail.progressIndex + 1 }} 章</span>
            <span>最近阅读：{{ bookDetail.lastRead ? new Date(bookDetail.lastRead).toLocaleString() : '暂无' }}</span>
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
        :class="selectedPeriod === 'today' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-white/60 border-transparent'"
        class="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors"
      >
        今日排行
      </button>
      <button
        @click="selectedPeriod = 'week'"
        :class="selectedPeriod === 'week' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-white/60 border-transparent'"
        class="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors"
      >
        本周排行
      </button>
      <button
        @click="selectedPeriod = 'year'"
        :class="selectedPeriod === 'year' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-white/60 border-transparent'"
        class="px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors"
      >
        本年排行
      </button>
    </div>

    <div v-if="loading" class="py-16 text-center text-slate-500 dark:text-white/45">
      正在整理统计数据...
    </div>

    <div
      v-else-if="!props.bookId && ranking.length === 0"
      class="bg-white dark:bg-[#2d2d2d] rounded-2xl border border-black/5 dark:border-white/[0.06] shadow-sm p-10 text-center text-slate-500 dark:text-white/45"
    >
      暂无阅读统计数据，开启记录后读一会儿书就会在这里出现。
    </div>

    <div
      v-else-if="!props.bookId"
      class="bg-white dark:bg-[#2d2d2d] rounded-2xl border border-black/5 dark:border-white/[0.06] shadow-sm divide-y divide-black/5 dark:divide-white/[0.04]"
    >
      <button
        v-for="item in ranking"
        :key="item.bookIdentity"
        class="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
        @click="item.localBookId && emit('open-book-stats', item.localBookId)"
      >
        <div class="w-12 h-16 rounded-lg overflow-hidden bg-black/5 dark:bg-white/5 shrink-0 border border-black/5 dark:border-white/10">
          <img v-if="item.coverPath" :src="item.coverPath" class="w-full h-full object-cover" alt="封面" />
          <div v-else class="w-full h-full flex items-center justify-center opacity-50">📖</div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-semibold text-slate-800 dark:text-white/90 truncate">{{ item.bookTitle || '未命名书籍' }}</div>
          <div class="text-[12px] text-slate-500 dark:text-white/50 truncate mt-1">{{ item.bookAuthor || '未知作者' }}</div>
        </div>
        <div class="text-right shrink-0">
          <div class="text-[13px] font-semibold text-[#005fb8]">{{ formatDuration(item.totalSeconds) }}</div>
          <div class="text-[11px] text-slate-400 dark:text-white/35 mt-1">{{ new Date(item.lastUpdatedAt).toLocaleString() }}</div>
        </div>
      </button>
    </div>

    <div
      v-else
      class="bg-white dark:bg-[#2d2d2d] rounded-2xl border border-black/5 dark:border-white/[0.06] shadow-sm p-8 text-center text-slate-500 dark:text-white/45"
    >
      这本书的累计阅读时长已经汇总在上面的周期卡片里。
    </div>
  </div>
</template>

<style scoped>
.stats-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.05);
  border-radius: 1rem;
  padding: 1.25rem;
  box-shadow: 0 6px 24px rgba(15, 23, 42, 0.06);
}

:global(.dark) .stats-card {
  background: #2d2d2d;
  border-color: rgba(255, 255, 255, 0.06);
}

.stats-label {
  font-size: 12px;
  color: rgba(100, 116, 139, 0.9);
  margin-bottom: 0.5rem;
}

:global(.dark) .stats-label {
  color: rgba(255, 255, 255, 0.45);
}

.stats-value {
  font-size: 24px;
  font-weight: 700;
  color: #0f172a;
}

:global(.dark) .stats-value {
  color: rgba(255, 255, 255, 0.92);
}
</style>
