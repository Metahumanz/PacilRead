<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const {
  toggleKeyHints,
  toggleAutoOpenLastRead,
  addNextKey,
  removeNextKey,
  addPrevKey,
  removePrevKey
} = defineProps<{
  toggleKeyHints: () => void
  toggleAutoOpenLastRead: () => void
  addNextKey: (e: KeyboardEvent) => void
  removeNextKey: (k: string) => void
  addPrevKey: (e: KeyboardEvent) => void
  removePrevKey: (k: string) => void
}>()

const settings = useSettings()
const { showKeyHints, autoOpenLastRead, nextKeys, prevKeys } = settings
</script>

<template>
  <div class="mb-8">
    <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">阅读交互</h3>
    <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
      
      <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">💡</span>
          <div>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">显示操作浮层提示</div>
            <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">进入阅读页时屏幕底部会浮现操作引导帮助</div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input type="checkbox" v-model="showKeyHints" @change="toggleKeyHints" class="peer sr-only" />
          <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
        </label>
      </div>

      <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">🚀</span>
          <div>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">启动直达续读</div>
            <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">打开软件直接跳入上次阅读的书籍而不在书架层停留</div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input type="checkbox" v-model="autoOpenLastRead" @change="toggleAutoOpenLastRead" class="peer sr-only" />
          <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
        </label>
      </div>

      <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">⌨️</span>
          <div class="flex-1">
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">翻页按键绑定</div>
            <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5 mb-3">自定义全局控制按键组合（点击下方已绑按键可移除）</div>
            <div class="grid grid-cols-2 gap-6">
              <div>
                <label class="block text-[12px] text-slate-600 dark:text-white/60 mb-2 font-medium">下一页 / 下一章绑定</label>
                <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  <span v-for="k in nextKeys" :key="k" @click="removeNextKey(k)" class="px-2 py-0.5 bg-[#005fb8]/20 border border-[#005fb8]/30 text-[#60a5fa] rounded text-[11px] font-mono cursor-pointer hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-colors">
                    {{ k === ' ' ? 'Space' : k }} &times;
                  </span>
                </div>
                <input type="text" placeholder="按下按键录入..." @keydown.prevent="addNextKey" class="w-full bg-black/[0.03] dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
              </div>
              <div>
                <label class="block text-[12px] text-slate-600 dark:text-white/60 mb-2 font-medium">上一页 / 上一章绑定</label>
                <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  <span v-for="k in prevKeys" :key="k" @click="removePrevKey(k)" class="px-2 py-0.5 bg-[#005fb8]/20 border border-[#005fb8]/30 text-[#60a5fa] rounded text-[11px] font-mono cursor-pointer hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 transition-colors">
                    {{ k === ' ' ? 'Space' : k }} &times;
                  </span>
                </div>
                <input type="text" placeholder="按下按键录入..." @keydown.prevent="addPrevKey" class="w-full bg-black/[0.03] dark:bg-black/20 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
