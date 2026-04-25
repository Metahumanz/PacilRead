<script setup lang="ts">
import { useSettings } from '../../composables/useSettings'

const {
  saveWebdav,
  testWebdav,
  fullBackup,
  fullRestore,
  incrementalBackup,
  incrementalRestore,
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
  webdavDesktopSettingsDir
} = settings
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
                        <span>📥 恢复基础数据</span>
                      </button>
                    </div>
                    <p class="mt-2 text-[10px] app-muted">同步书架轻量库、桌面设置 JSON 与阅读统计快照，跳过章节正文，速度更快。</p>
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
                    <p class="mt-2 text-[10px] app-muted">保存完整数据库镜像，同时配套上传桌面设置 JSON 与阅读统计目录。</p>
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
