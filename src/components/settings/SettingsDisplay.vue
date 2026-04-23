<script setup lang="ts">


const { setAspectRatio } = defineProps<{
  setAspectRatio: (ratio: number) => void
}>()
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">窗口与显示</h3>
    <div class="app-card app-card-hover app-divide-y">
      
      <div class="p-4 app-row">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">🪟</span>
          <div class="flex-1">
            <div class="text-[14px] font-medium app-title">默认窗口比例</div>
            <div class="text-[12px] app-muted mt-0.5 mb-3">快速调整主阅读窗口的大小特征预设</div>
            <div class="flex flex-wrap gap-2">
              <button @click="setAspectRatio(16/9)" class="app-button px-4 py-1.5 text-[13px] font-mono">16 : 9</button>
              <button @click="setAspectRatio(9/16)" class="app-button px-4 py-1.5 text-[13px] font-mono">9 : 16</button>
              <button @click="setAspectRatio(4/3)" class="app-button px-4 py-1.5 text-[13px] font-mono">4 : 3</button>
              <button @click="setAspectRatio(3/4)" class="app-button px-4 py-1.5 text-[13px] font-mono">3 : 4</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
