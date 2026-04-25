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
const { showKeyHints, autoOpenLastRead, nextKeys, prevKeys, bookshelfShowAddEntry, saveSetting } = settings

const toggleBookshelfAddEntry = async () => {
  await saveSetting('bookshelf_show_add_entry', bookshelfShowAddEntry.value ? 'true' : 'false')
}
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">阅读交互</h3>
    <div class="app-card app-card-hover app-divide-y">
      
      <div class="flex items-center justify-between p-4 app-row">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">💡</span>
          <div>
            <div class="text-[14px] font-medium app-title">显示操作浮层提示</div>
            <div class="text-[12px] app-muted mt-0.5">进入阅读页时屏幕底部会浮现操作引导帮助</div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input type="checkbox" v-model="showKeyHints" @change="toggleKeyHints" class="peer sr-only" />
          <div class="app-switch"></div>
        </label>
      </div>

      <div class="flex items-center justify-between p-4 app-row">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">🚀</span>
          <div>
            <div class="text-[14px] font-medium app-title">启动直达续读</div>
            <div class="text-[12px] app-muted mt-0.5">打开软件直接跳入上次阅读的书籍而不在书架层停留</div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input type="checkbox" v-model="autoOpenLastRead" @change="toggleAutoOpenLastRead" class="peer sr-only" />
          <div class="app-switch"></div>
        </label>
      </div>

      <div class="flex items-center justify-between p-4 app-row">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">＋</span>
          <div>
            <div class="text-[14px] font-medium app-title">显示书架添加入口</div>
            <div class="text-[12px] app-muted mt-0.5">控制书架顶部按钮、网格卡片和列表页脚的添加书籍入口</div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input type="checkbox" v-model="bookshelfShowAddEntry" @change="toggleBookshelfAddEntry" class="peer sr-only" />
          <div class="app-switch"></div>
        </label>
      </div>

      <div class="p-4 app-row">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">⌨️</span>
          <div class="flex-1">
            <div class="text-[14px] font-medium app-title">翻页按键绑定</div>
            <div class="text-[12px] app-muted mt-0.5 mb-3">自定义全局控制按键组合（点击下方已绑按键可移除）</div>
            <div class="grid grid-cols-2 gap-6">
              <div>
                <label class="block text-[12px] app-muted mb-2 font-medium">下一页 / 下一章绑定</label>
                <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  <span v-for="k in nextKeys" :key="k" @click="removeNextKey(k)" class="app-badge px-2 py-0.5 text-[11px] font-mono cursor-pointer hover:text-[var(--app-danger)] transition-colors">
                    {{ k === ' ' ? 'Space' : k }} &times;
                  </span>
                </div>
                <input type="text" placeholder="按下按键录入..." @keydown.prevent="addNextKey" class="app-input w-full px-3 py-1.5 text-[12px]" />
              </div>
              <div>
                <label class="block text-[12px] app-muted mb-2 font-medium">上一页 / 上一章绑定</label>
                <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                  <span v-for="k in prevKeys" :key="k" @click="removePrevKey(k)" class="app-badge px-2 py-0.5 text-[11px] font-mono cursor-pointer hover:text-[var(--app-danger)] transition-colors">
                    {{ k === ' ' ? 'Space' : k }} &times;
                  </span>
                </div>
                <input type="text" placeholder="按下按键录入..." @keydown.prevent="addPrevKey" class="app-input w-full px-3 py-1.5 text-[12px]" />
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
