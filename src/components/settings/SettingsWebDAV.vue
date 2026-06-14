<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

interface SyncDiffItem {
  id: string
  entity: string
  status: 'local' | 'remote' | 'conflict' | 'unchanged'
  title: string
  description: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  fields: Array<{ field: string; local: string; remote: string }>
}

interface SyncDiffPreview {
  generatedAt: number
  summary: Record<'local' | 'remote' | 'conflict' | 'unchanged', number>
  items: SyncDiffItem[]
}

const {
  saveWebdav,
  testWebdav,
  fullBackup,
  fullRestore,
  incrementalBackup,
  incrementalRestore,
  syncDiffPreview,
  syncDiffResolution,
  syncDiffLoading,
  syncDiffApplying,
  openSyncDiffPreview,
  applySyncDiffPreview,
  closeSyncDiffPreview,
  setSyncDiffResolution,
  webdavTesting,
  webdavSyncing,
  webdavSyncStatus,
  webdavTestResult
} = defineProps<{
  saveWebdav: () => void
  testWebdav: () => void
  fullBackup: () => void
  fullRestore: () => void
  incrementalBackup: () => void
  incrementalRestore: () => void
  syncDiffPreview: SyncDiffPreview | null
  syncDiffResolution: Record<string, 'local' | 'remote' | 'merge'>
  syncDiffLoading: boolean
  syncDiffApplying: boolean
  openSyncDiffPreview: () => void
  applySyncDiffPreview: () => void
  closeSyncDiffPreview: () => void
  setSyncDiffResolution: (id: string, choice: 'local' | 'remote' | 'merge') => void
  webdavTesting: boolean
  webdavSyncing: boolean
  webdavSyncStatus: string
  webdavTestResult: string
}>()

const settings = useSettings()
const {
  webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
  webdavSyncBookshelf, webdavSyncFiles, webdavSyncUISettings,
  webdavSyncThemes, webdavSyncBackgrounds, webdavSyncReadingStats,
  webdavLastSync, webdavLastLiteSync,
  webdavDesktopSettingsDir, bookshelfProgressPrefetchLimit
} = settings

const resolutionChoices: Array<'local' | 'remote' | 'merge'> = ['local', 'remote', 'merge']

const entityLabel = (entity: string) => ({
  books: '书籍',
  chapters: '章节',
  rules: '规则',
  themes: '主题',
  bookmarks: '书签',
  readingStats: '统计',
}[entity] || entity)

const statusLabel = (status: string) => ({
  local: '本地独有',
  remote: '远端新增',
  conflict: '冲突',
  unchanged: '一致',
}[status] || status)

const choiceLabel = (choice: string) => ({
  local: '保留本地',
  remote: '采用远端',
  merge: '自动合并',
}[choice] || choice)

const formatTime = (value: number) => {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN')
}
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">云同步驱动</h3>
    <div class="app-card app-card-hover app-divide-y">
      
      <div class="p-4 app-row">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">☁️</span>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="text-[14px] font-medium app-title">WebDAV 进度同步桥接</div>
                <div class="text-[12px] app-muted mt-0.5">完美兼容 Legado 数据簇的终端互转</div>
              </div>
              <label class="flex items-center cursor-pointer relative">
                <input type="checkbox" v-model="webdavSync" @change="saveWebdav" class="peer sr-only" />
                <div class="app-switch"></div>
              </label>
            </div>

            <div class="app-card app-card-strong space-y-3 p-4">
              <div class="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
                <div>
                  <label class="block text-[11px] app-muted mb-1">主线服务器 URL (需尾随 /)</label>
                  <input type="text" v-model="webdavUrl" @change="saveWebdav" placeholder="https://dav.jianguoyun.com/dav/" class="app-input w-full px-3 py-1.5 text-[12px]" />
                </div>
                <div>
                  <label class="block text-[11px] app-muted mb-1">子目录 (例如 Books)</label>
                  <input type="text" v-model="webdavDir" @change="saveWebdav" placeholder="Books" class="app-input w-full px-3 py-1.5 text-[12px]" />
                </div>
                <div>
                  <label class="block text-[11px] app-muted mb-1">桌面设置目录</label>
                  <input type="text" v-model="webdavDesktopSettingsDir" @change="saveWebdav" placeholder="desktop-settings" class="app-input w-full px-3 py-1.5 text-[12px]" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2">
                  <label class="block text-[11px] app-muted mb-1">打开书架时预取云端进度数量</label>
                  <div class="flex items-center gap-2">
                    <input
                      v-model.number="bookshelfProgressPrefetchLimit"
                      @change="saveWebdav"
                      @blur="saveWebdav"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      class="app-input w-24 px-3 py-1.5 text-[12px]"
                    />
                    <span class="text-[11px] app-muted">本，默认 6；设为 0 可关闭书架预取</span>
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] app-muted mb-1">认证账户 (User)</label>
                  <input type="text" v-model="webdavUser" @change="saveWebdav" placeholder="example@email.com" class="app-input w-full px-3 py-1.5 text-[12px]" />
                </div>
                <div>
                  <label class="block text-[11px] app-muted mb-1">连接密钥 (App Password)</label>
                  <input type="password" v-model="webdavPass" @change="saveWebdav" placeholder="••••••••" class="app-input w-full px-3 py-1.5 text-[12px]" />
                </div>
              </div>
              <div v-if="webdavSync" class="app-divider mt-4 pt-4 border-t">
                <label class="block text-[11px] app-muted mb-2 font-medium text-left">同步内容选择 (点击切换)</label>
                <div class="flex flex-wrap gap-2 mb-5">
                  <button @click="webdavSyncBookshelf = !webdavSyncBookshelf; saveWebdav()" :class="{ 'is-active': webdavSyncBookshelf }" class="app-chip px-3 py-1 text-[11px] font-medium transition-all">书架内容</button>
                  <button @click="webdavSyncFiles = !webdavSyncFiles; saveWebdav()" :class="{ 'is-active': webdavSyncFiles }" class="app-chip px-3 py-1 text-[11px] font-medium transition-all">书籍文件</button>
                  <button @click="webdavSyncUISettings = !webdavSyncUISettings; saveWebdav()" :class="{ 'is-active': webdavSyncUISettings }" class="app-chip px-3 py-1 text-[11px] font-medium transition-all">界面设置</button>
                  <button @click="webdavSyncThemes = !webdavSyncThemes; saveWebdav()" :class="{ 'is-active': webdavSyncThemes }" class="app-chip px-3 py-1 text-[11px] font-medium transition-all">阅读主题</button>
                  <button @click="webdavSyncBackgrounds = !webdavSyncBackgrounds; saveWebdav()" :class="{ 'is-active': webdavSyncBackgrounds }" class="app-chip px-3 py-1 text-[11px] font-medium transition-all">背景图片</button>
                  <button @click="webdavSyncReadingStats = !webdavSyncReadingStats; saveWebdav()" :class="{ 'is-active': webdavSyncReadingStats }" class="app-chip px-3 py-1 text-[11px] font-medium transition-all">阅读统计</button>
                </div>
                
                <div class="flex flex-col gap-4">
                  <!-- Incremental Sync (Lite) -->
                  <div class="app-card p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold app-muted uppercase tracking-wider">⚡ 增量同步 (推荐)</span>
                      <span v-if="webdavLastLiteSync" class="text-[10px] text-emerald-500/70 font-mono">{{ webdavLastLiteSync }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button @click="incrementalBackup" :disabled="webdavSyncing || !webdavUrl" class="app-button app-button-primary flex-1 px-3 py-2 text-[12px] active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50">
                        <span>📤 同步基础数据</span>
                      </button>
                      <button @click="incrementalRestore" :disabled="webdavSyncing || !webdavUrl" class="app-button flex-1 px-3 py-2 text-[12px] active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50">
                        <span>{{ syncDiffLoading ? '生成预览...' : '📥 恢复基础数据' }}</span>
                      </button>
                      <button @click="openSyncDiffPreview" :disabled="webdavSyncing || syncDiffLoading || !webdavUrl" class="app-button px-3 py-2 text-[12px] active:scale-95 disabled:opacity-50">
                        差异预览
                      </button>
                    </div>
                    <p class="mt-2 text-[10px] app-muted">同步书架轻量库、桌面设置 JSON 与阅读统计快照，跳过章节正文，速度更快。</p>
                  </div>

                  <div v-if="syncDiffPreview" class="app-card p-3 border border-[var(--app-accent)]/40">
                    <div class="flex items-center justify-between gap-3 mb-3">
                      <div>
                        <div class="text-[12px] font-semibold app-title">WebDAV 差异预览</div>
                        <div class="text-[10px] app-muted mt-0.5">{{ formatTime(syncDiffPreview.generatedAt) }}</div>
                      </div>
                      <button @click="closeSyncDiffPreview" :disabled="syncDiffApplying" class="app-icon-button w-8 h-8" title="关闭">✕</button>
                    </div>
                    <div class="grid grid-cols-4 gap-2 text-center mb-3">
                      <div class="app-chip px-2 py-1 text-[10px]">冲突 {{ syncDiffPreview.summary.conflict }}</div>
                      <div class="app-chip px-2 py-1 text-[10px]">远端 {{ syncDiffPreview.summary.remote }}</div>
                      <div class="app-chip px-2 py-1 text-[10px]">本地 {{ syncDiffPreview.summary.local }}</div>
                      <div class="app-chip px-2 py-1 text-[10px]">一致 {{ syncDiffPreview.summary.unchanged }}</div>
                    </div>
                    <div class="max-h-80 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                      <div
                        v-for="item in syncDiffPreview.items.filter(item => item.status !== 'unchanged')"
                        :key="item.id"
                        class="rounded-[var(--app-radius-input)] border border-[var(--app-border)] p-3"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="text-[12px] font-semibold app-title truncate">{{ item.title }}</span>
                              <span class="app-badge text-[10px] px-2 py-0.5">{{ entityLabel(item.entity) }}</span>
                              <span class="app-badge text-[10px] px-2 py-0.5" :class="{ 'is-active': item.status === 'conflict' }">{{ statusLabel(item.status) }}</span>
                            </div>
                            <div class="text-[10px] app-muted mt-1 truncate">{{ item.description }}</div>
                            <div class="text-[10px] app-muted mt-1">本地 {{ formatTime(item.localUpdatedAt) }} · 远端 {{ formatTime(item.remoteUpdatedAt) }}</div>
                          </div>
                          <div class="flex shrink-0 gap-1">
                            <button
                              v-for="choice in resolutionChoices"
                              :key="choice"
                              @click="setSyncDiffResolution(item.id, choice)"
                              :class="{ 'is-active': syncDiffResolution[item.id] === choice }"
                              class="app-chip px-2 py-1 text-[10px]"
                            >
                              {{ choiceLabel(choice) }}
                            </button>
                          </div>
                        </div>
                        <div v-if="item.fields.length > 0" class="mt-2 space-y-1">
                          <div
                            v-for="field in item.fields.slice(0, 4)"
                            :key="field.field"
                            class="grid grid-cols-[5rem_1fr_1fr] gap-2 text-[10px] app-muted"
                          >
                            <span>{{ field.field }}</span>
                            <span class="truncate">本地：{{ field.local }}</span>
                            <span class="truncate">远端：{{ field.remote }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-2 mt-3">
                      <button
                        @click="applySyncDiffPreview"
                        :disabled="syncDiffApplying"
                        class="app-button app-button-primary flex-1 px-3 py-2 text-[12px] disabled:opacity-50"
                      >
                        {{ syncDiffApplying ? '应用中...' : '按选择应用差异' }}
                      </button>
                      <button @click="closeSyncDiffPreview" :disabled="syncDiffApplying" class="app-button px-3 py-2 text-[12px] disabled:opacity-50">取消</button>
                    </div>
                  </div>

                  <!-- Full Sync (Snapshot) -->
                  <div class="app-card p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold app-muted uppercase tracking-wider">📦 全量备份 (镜像)</span>
                      <span v-if="webdavLastSync" class="text-[10px] text-amber-500/70 font-mono">{{ webdavLastSync }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button @click="fullBackup" :disabled="webdavSyncing || !webdavUrl" class="app-button app-button-positive flex-1 px-3 py-2 text-[12px] active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50">
                        <span>📤 备份全量镜像</span>
                      </button>
                      <button @click="fullRestore" :disabled="webdavSyncing || !webdavUrl" class="app-button flex-1 px-3 py-2 text-[12px] active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50">
                        <span>📥 恢复全量镜像</span>
                      </button>
                    </div>
                    <p class="mt-2 text-[10px] app-muted">保存共享 JSON 数据、chapter_text 正文、封面、桌面设置 JSON 与阅读统计目录。</p>
                  </div>
                </div>

                <div v-if="webdavSyncing" class="text-center mt-3 text-[11px] text-blue-400 animate-pulse flex items-center justify-center gap-2">
                  <span class="w-2 h-2 bg-blue-400 rounded-full"></span>
                  {{ webdavSyncStatus || '正在处理同步请求...' }}
                </div>
              </div>

              <!-- WebDAV Test Connection -->
              <div class="app-divider flex items-center justify-between pt-2 border-t mt-3">
                <span class="text-[12px] min-h-[18px]" :class="webdavTestResult.includes('✅') ? 'text-emerald-400' : 'text-red-400'">{{ webdavTestResult }}</span>
                <button @click="testWebdav" :disabled="webdavTesting" class="app-button px-4 py-1.5 text-[13px] disabled:opacity-50">探测网络</button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
