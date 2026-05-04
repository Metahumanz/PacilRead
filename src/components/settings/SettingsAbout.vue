<script setup lang="ts">
import { changelogItems } from '../../data/changelog'
import { useSettings } from '../../composables/useSettings'

const {
  appVersion,
  dataSize,
  chapterTextSize,
  jsonDataSize,
  totalDataSize,
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
  dataSize: string
  chapterTextSize: string
  jsonDataSize: string
  totalDataSize: string
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
    <h3 class="app-section-label text-[14px] mb-3 px-1">关于与更新</h3>
    <div class="app-card app-card-hover app-divide-y">
      
      <!-- 关于基础 -->
      <div class="flex items-center justify-between p-4 app-row font-medium">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">🔄</span>
          <div>
            <div class="text-[14px] font-medium app-title">PacilRead 更新维护</div>
            <div v-if="updateStatus" class="text-[12px] app-positive-text mt-0.5">{{ updateStatus }} <span class="app-muted">{{ updateDetail }}</span></div>
          </div>
        </div>
        <div class="flex items-center gap-3">
           <span class="app-badge text-[12px] font-mono px-2 py-1">v{{ appVersion }}</span>
          <span v-if="dataSize" class="text-[12px] app-muted font-mono">{{ dataSize }}</span>
          <template v-if="updateAvailable">
            <button @click="downloadUpdate" class="app-button app-button-primary px-4 py-1.5 text-[13px]">后台下载最新版</button>
          </template>
          <button v-else-if="updateReady" @click="installNow" class="app-button app-button-positive px-4 py-1.5 text-[13px]">立即安装</button>
          <button v-else-if="isDownloading" disabled class="app-button px-4 py-1.5 text-[13px] cursor-not-allowed opacity-50">下载中...</button>
          <button v-else @click="checkForUpdate" class="app-button px-4 py-1.5 text-[13px]">检查更新</button>
          
          <a href="https://github.com/Metahumanz/PacilRead" target="_blank" class="app-button px-4 py-1.5 text-[13px] flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
            GitHub
          </a>
        </div>
      </div>

      <!-- 本地数据 -->
      <div class="flex items-center justify-between p-4 app-row">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">🧩</span>
          <div>
            <div class="text-[14px] font-medium app-title">本地 JSON 数据</div>
            <div class="text-[12px] app-muted mt-0.5">
              JSON {{ jsonDataSize || '—' }} · 正文 {{ chapterTextSize || '—' }} · 合计 {{ totalDataSize || '—' }} · JSON-only
            </div>
          </div>
        </div>
      </div>

      <!-- 行为控制 -->
      <div class="flex items-center justify-between p-4 app-row">
        <div class="flex items-center gap-4">
          <span class="text-xl opacity-80">🤫</span>
          <div>
            <div class="text-[14px] font-medium app-title">允许静默更新</div>
            <div class="text-[12px] app-muted mt-0.5">开启后点击「立即安装」将直接覆盖安装并自动重启，无需再次确认</div>
          </div>
        </div>
        <label class="flex items-center cursor-pointer relative">
          <input type="checkbox" v-model="silentUpdate" @change="toggleSilentUpdate" class="peer sr-only" />
          <div class="app-switch"></div>
        </label>
      </div>

      <!-- 日志 -->
      <div class="p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xl opacity-80">📜</span>
          <div class="text-[14px] font-medium app-title">版本演进日志</div>
        </div>
        <div class="app-divide-y max-h-[400px] overflow-y-auto changelog-scroll pr-2">
          <div
            v-for="(entry, index) in changelogItems"
            :key="entry.version"
            :class="index === 0 ? 'pb-4 pt-2' : 'py-4'"
          >
            <div class="flex items-center gap-2 mb-2">
              <span v-if="index === 0" class="app-badge px-2 py-0.5 text-[11px] font-bold app-positive-text">最新</span>
              <span class="text-[14px] font-bold app-title">v{{ entry.version }}</span>
              <span v-if="entry.date" class="text-[11px] app-muted ml-auto">{{ entry.date }}</span>
            </div>
            <ul class="text-[12px] app-muted space-y-1.5 pl-4 list-disc">
              <li v-for="change in entry.changes" :key="change">{{ change }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.changelog-scroll::-webkit-scrollbar { width: 4px; }
.changelog-scroll::-webkit-scrollbar-thumb { background: var(--app-border-strong); border-radius: 2px; }
</style>
