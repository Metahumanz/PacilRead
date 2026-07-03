<script setup lang="ts">
import { formatDuration, type ReadingStatsOverview } from '../../composables/useReadingStats'

defineProps<{
  trackingEnabled: boolean
  hidden: boolean
  hasHistory: boolean
  loading: boolean
  overview: ReadingStatsOverview
  onToggleTracking: () => void
  onOpenStats: () => void
}>()
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">阅读统计</h3>
    <div class="app-card app-card-hover app-divide-y">
      <div class="flex items-center justify-between p-4 app-row">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">⏱️</span>
          <div>
            <div class="text-[14px] font-medium app-title">记录阅读时长</div>
            <div class="text-[12px] app-muted mt-0.5">
              进入阅读页后按活跃窗口累计时长，可同步到 WebDAV 供多设备汇总
            </div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input
            type="checkbox"
            :checked="trackingEnabled"
            @change="onToggleTracking"
            class="peer sr-only"
          />
          <div class="app-switch"></div>
        </label>
      </div>

      <div class="p-4 app-row">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <div class="text-[13px] font-medium app-title">统计概览</div>
            <div class="text-[11px] app-muted mt-1">
              {{ hidden ? '统计概览已隐藏，历史数据仍然保留。' : '展示今日、本周、自然月、本年的累计阅读时长。' }}
            </div>
          </div>
          <button
            @click="onOpenStats"
            class="app-button px-4 py-2 text-[12px]"
          >
            查看详细统计
          </button>
        </div>

        <div v-if="loading" class="text-[12px] app-muted py-3">
          正在整理统计数据...
        </div>

        <div
          v-else-if="!hidden"
          class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
        >
          <div class="app-card app-card-strong p-4">
            <div class="text-[11px] app-muted uppercase tracking-wider">今日</div>
            <div class="text-[18px] font-semibold app-title mt-2">{{ formatDuration(overview.today) }}</div>
          </div>
          <div class="app-card app-card-strong p-4">
            <div class="text-[11px] app-muted uppercase tracking-wider">本周</div>
            <div class="text-[18px] font-semibold app-title mt-2">{{ formatDuration(overview.week) }}</div>
          </div>
          <div class="app-card app-card-strong p-4">
            <div class="text-[11px] app-muted uppercase tracking-wider">自然月</div>
            <div class="text-[18px] font-semibold app-title mt-2">{{ formatDuration(overview.month) }}</div>
          </div>
          <div class="app-card app-card-strong p-4">
            <div class="text-[11px] app-muted uppercase tracking-wider">本年</div>
            <div class="text-[18px] font-semibold app-title mt-2">{{ formatDuration(overview.year) }}</div>
          </div>
        </div>

        <div
          v-else-if="hasHistory"
          class="app-card p-4 text-[12px] text-[var(--app-warning)]"
        >
          阅读统计已隐藏，但历史数据仍保留在本地与云端，可随时进入详情页查看。
        </div>

        <div
          v-else
          class="app-card p-4 text-[12px] app-muted"
        >
          还没有统计数据。开启后阅读一会儿，这里就会开始累计。
        </div>
      </div>
    </div>
  </div>
</template>
