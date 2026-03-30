<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const { setAspectRatio } = defineProps<{
  setAspectRatio: (ratio: number) => void
}>()

const settings = useSettings()
</script>

<template>
  <div class="mb-8">
    <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">窗口与显示</h3>
    <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
      
      <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">🪟</span>
          <div class="flex-1">
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">默认窗口比例</div>
            <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5 mb-3">快速调整主阅读窗口的大小特征预设</div>
            <div class="flex flex-wrap gap-2">
              <button @click="setAspectRatio(16/9)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">16 : 9</button>
              <button @click="setAspectRatio(9/16)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">9 : 16</button>
              <button @click="setAspectRatio(4/3)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">4 : 3</button>
              <button @click="setAspectRatio(3/4)" class="px-4 py-1.5 bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:bg-black/40 border border-black/5 dark:border-white/5 hover:border-white/20 rounded-md text-[13px] font-mono transition-colors">3 : 4</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
