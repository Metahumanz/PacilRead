<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const {
  appVersion,
  updateStatus,
  updateDetail,
  updateAvailable,
  updateReady,
  isDownloading,
  downloadUpdate,
  installNow,
  checkForUpdate,
  toggleSilentUpdate
} = defineProps<{
  appVersion: string
  updateStatus: string
  updateDetail: string
  updateAvailable: boolean
  updateReady: boolean
  isDownloading: boolean
  downloadUpdate: () => void
  installNow: () => void
  checkForUpdate: () => void
  toggleSilentUpdate: () => void
}>()

const settings = useSettings()
const { silentUpdate } = settings
</script>

<template>
  <div class="mb-8">
    <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">关于与更新</h3>
    <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-black/5 dark:divide-white/[0.04]">
      
      <!-- 关于基础 -->
      <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors font-medium">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">🔄</span>
          <div>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">PacilRead 更新维护</div>
            <div v-if="updateStatus" class="text-[12px] text-emerald-500 dark:text-emerald-400 mt-0.5">{{ updateStatus }} <span class="text-slate-400 dark:text-white/40">{{ updateDetail }}</span></div>
          </div>
        </div>
        <div class="flex items-center gap-3">
           <span class="text-[12px] font-mono text-slate-500 dark:text-white/50 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-md">v{{ appVersion }}</span>
          <template v-if="updateAvailable">
            <button @click="downloadUpdate" class="px-4 py-1.5 bg-[#005fb8] hover:bg-[#005fb8]/90 text-white rounded-md text-[13px] transition-colors font-medium">后台下载最新版</button>
          </template>
          <button v-else-if="updateReady" @click="installNow" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[13px] transition-colors font-medium shadow-sm">立即安装</button>
          <button v-else-if="isDownloading" disabled class="px-4 py-1.5 bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/40 rounded-md text-[13px] font-medium border border-transparent cursor-not-allowed">下载中...</button>
          <button v-else @click="checkForUpdate" class="px-4 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-800 dark:text-white/90 rounded-md text-[13px] transition-colors font-medium border border-black/5 dark:border-white/5">检查更新</button>
          
          <a href="https://github.com/Metahumanz/PacilRead" target="_blank" class="px-4 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-800 dark:text-white/90 rounded-md text-[13px] transition-colors font-medium border border-black/5 dark:border-white/5 flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            GitHub
          </a>
        </div>
      </div>

      <!-- 行为控制 -->
      <div class="flex items-center justify-between p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">🤫</span>
          <div>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">允许静默更新</div>
            <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">开启后点击「立即安装」将直接覆盖安装并自动重启，无需再次确认</div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input type="checkbox" v-model="silentUpdate" @change="toggleSilentUpdate" class="peer sr-only" />
          <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
        </label>
      </div>

      <!-- 日志 -->
      <div class="p-4 bg-black/5 dark:bg-black/10">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xl opacity-80">📜</span>
          <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">版本演进日志</div>
        </div>
        <div class="divide-y divide-black/5 dark:divide-white/[0.04] max-h-[400px] overflow-y-auto changelog-scroll pr-2">
          <div class="pb-4 pt-2">
            <div class="flex items-center gap-2 mb-2">
              <span class="px-2 py-0.5 text-[11px] font-bold bg-emerald-500/20 text-emerald-500 rounded-full">最新</span>
              <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.5</span>
              <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-30</span>
            </div>
            <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
              <li>核心 UI 组件化重构：完成 ReaderView 与 SettingsView 的深度拆分，显著提升代码可维护性</li>
              <li>状态管理架构升级：引入全局单例 useSettings，实现跨组件实时同步与高效状态共享</li>
              <li>健壮性优化：修复重构引入的类型错误、样式冲突及快捷键响应异常，提升系统稳定性</li>
              <li>阅读体验：优化阅读器翻页性能，修复 HUD 模块化后的渲染层级问题</li>
            </ul>
          </div>
          <div class="py-4 border-t border-white/[0.04]">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.4</span>
              <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-30</span>
            </div>
            <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
              <li>WebDAV 全量同步：支持书架、书籍、设置、主题及背景的一键备份与恢复</li>
              <li>同步颗粒化控制：新增“胶囊开关”，支持自定义同步内容，保护多端偏好一致性</li>
              <li>导入增强：开启 PDF 拖放导入支持，实现基于路径的自动去重逻辑</li>
              <li>底层架构升级：支持数据库二进制导出/导入，提升同步效率</li>
            </ul>
          </div>
          <div class="py-4 border-t border-white/[0.04]">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-[14px] font-bold text-slate-800 dark:text-white/90">v0.4.3</span>
              <span class="text-[11px] text-slate-400 dark:text-white/30 ml-auto">2026-03-30</span>
            </div>
            <ul class="text-[12px] text-slate-600 dark:text-white/60 space-y-1.5 pl-4 list-disc">
              <li>阅读界面 HUD 模块化增强：支持 6 个自定义展示槽位（顶部/底部、左/中/右）</li>
              <li>HUD 内容高度自定义：支持显示时间、电量、章节名、页数及全书进度等 10 种组合</li>
              <li>章节标题显示优化：正文前章节名支持靠左对齐、居中对齐或完全隐藏</li>
              <li>集成系统电池电量实时监听与分钟级时钟更新</li>
            </ul>
          </div>
          <!-- More log items can be added or truncated for brevity in this initial split -->
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.changelog-scroll::-webkit-scrollbar { width: 4px; }
.changelog-scroll::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 2px; }
:is(.dark) .changelog-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
</style>
