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
    <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">阅读统计</h3>
    <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
      <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">⏱️</span>
          <div>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">记录阅读时长</div>
            <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">
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
          <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
        </label>
      </div>

      <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-center justify-between gap-3 mb-4">
          <div>
            <div class="text-[13px] font-medium text-slate-800 dark:text-white/90">统计概览</div>
            <div class="text-[11px] text-slate-500 dark:text-white/40 mt-1">
              {{ hidden ? '统计概览已隐藏，历史数据仍然保留。' : '展示今日、本周、本年的累计阅读时长。' }}
            </div>
          </div>
          <button
            @click="onOpenStats"
            class="px-4 py-2 rounded-lg bg-[#005fb8]/10 hover:bg-[#005fb8]/15 text-[#005fb8] dark:text-[#60cdff] text-[12px] font-medium transition-colors"
          >
            查看详细统计
          </button>
        </div>

        <div v-if="loading" class="text-[12px] text-slate-500 dark:text-white/40 py-3">
          正在整理统计数据...
        </div>

        <div
          v-else-if="!hidden"
          class="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div class="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 p-4">
            <div class="text-[11px] text-slate-500 dark:text-white/40 uppercase tracking-wider">今日</div>
            <div class="text-[18px] font-semibold text-slate-800 dark:text-white/90 mt-2">{{ formatDuration(overview.today) }}</div>
          </div>
          <div class="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 p-4">
            <div class="text-[11px] text-slate-500 dark:text-white/40 uppercase tracking-wider">本周</div>
            <div class="text-[18px] font-semibold text-slate-800 dark:text-white/90 mt-2">{{ formatDuration(overview.week) }}</div>
          </div>
          <div class="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 p-4">
            <div class="text-[11px] text-slate-500 dark:text-white/40 uppercase tracking-wider">本年</div>
            <div class="text-[18px] font-semibold text-slate-800 dark:text-white/90 mt-2">{{ formatDuration(overview.year) }}</div>
          </div>
        </div>

        <div
          v-else-if="hasHistory"
          class="rounded-xl bg-amber-500/10 border border-amber-500/20 text-[12px] text-amber-700 dark:text-amber-300 px-4 py-3"
        >
          阅读统计已隐藏，但历史数据仍保留在本地与云端，可随时进入详情页查看。
        </div>

        <div
          v-else
          class="rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/5 text-[12px] text-slate-500 dark:text-white/40 px-4 py-3"
        >
          还没有统计数据。开启后阅读一会儿，这里就会开始累计。
        </div>
      </div>
    </div>
  </div>
</template>
