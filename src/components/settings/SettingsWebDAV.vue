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
  webdavSyncThemes, webdavSyncBackgrounds, webdavLastSync, webdavLastLiteSync,
  webdavDesktopSettingsDir
} = settings
</script>

<template>
  <div class="mb-8">
    <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">云同步驱动</h3>
    <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 divide-y divide-white/[0.04]">
      
      <div class="p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">☁️</span>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="text-[14px] font-medium text-slate-800 dark:text-white/90">WebDAV 进度同步桥接</div>
                <div class="text-[12px] text-slate-500 dark:text-white/50 mt-0.5">完美兼容 Legado 数据簇的终端互转</div>
              </div>
              <label class="flex items-center cursor-pointer relative">
                <input type="checkbox" v-model="webdavSync" @change="saveWebdav" class="peer sr-only" />
                <div class="w-10 h-5 bg-black/10 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[20px] after:absolute after:top-1 after:left-1 after:bg-slate-600 dark:after:bg-white/80 peer-checked:after:bg-white after:rounded-full after:h-3 after:w-3 peer-checked:after:scale-125 after:transition-all peer-checked:bg-[#005fb8] border border-black/30 dark:border-white/30 peer-checked:border-[#005fb8]"></div>
              </label>
            </div>

            <div class="space-y-3 bg-black/10 p-4 rounded-lg border border-black/5 dark:border-white/5">
              <div class="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-3">
                <div>
                  <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">主线服务器 URL (需尾随 /)</label>
                  <input type="text" v-model="webdavUrl" @change="saveWebdav" placeholder="https://dav.jianguoyun.com/dav/" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                </div>
                <div>
                  <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">子目录 (例如 Books)</label>
                  <input type="text" v-model="webdavDir" @change="saveWebdav" placeholder="Books" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                </div>
                <div>
                  <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">桌面设置目录</label>
                  <input type="text" v-model="webdavDesktopSettingsDir" @change="saveWebdav" placeholder="desktop-settings" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">认证账户 (User)</label>
                  <input type="text" v-model="webdavUser" @change="saveWebdav" placeholder="example@email.com" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                </div>
                <div>
                  <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-1">连接密钥 (App Password)</label>
                  <input type="password" v-model="webdavPass" @change="saveWebdav" placeholder="••••••••" class="w-full bg-black/[0.03] dark:bg-black/30 border border-black/5 dark:border-white/10 rounded-md px-3 py-1.5 text-[12px] focus:border-[#005fb8] outline-none transition-colors" />
                </div>
              </div>
              <div v-if="webdavSync" class="mt-4 pt-4 border-t border-black/10 dark:border-white/[0.05]">
                <label class="block text-[11px] text-slate-500 dark:text-white/50 mb-2 font-medium text-left">同步内容选择 (点击切换)</label>
                <div class="flex flex-wrap gap-2 mb-5">
                  <button @click="webdavSyncBookshelf = !webdavSyncBookshelf; saveWebdav()" :class="webdavSyncBookshelf ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">书架内容</button>
                  <button @click="webdavSyncFiles = !webdavSyncFiles; saveWebdav()" :class="webdavSyncFiles ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">书籍文件</button>
                  <button @click="webdavSyncUISettings = !webdavSyncUISettings; saveWebdav()" :class="webdavSyncUISettings ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">界面设置</button>
                  <button @click="webdavSyncThemes = !webdavSyncThemes; saveWebdav()" :class="webdavSyncThemes ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">阅读主题</button>
                  <button @click="webdavSyncBackgrounds = !webdavSyncBackgrounds; saveWebdav()" :class="webdavSyncBackgrounds ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-white/5 text-slate-400 dark:text-white/30 border-transparent'" class="px-3 py-1 rounded-full text-[11px] font-medium transition-all border shadow-sm">背景图片</button>
                </div>
                
                <div class="flex flex-col gap-4">
                  <!-- Incremental Sync (Lite) -->
                  <div class="bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-black/5 dark:border-white/5">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider">⚡ 增量同步 (推荐)</span>
                      <span v-if="webdavLastLiteSync" class="text-[10px] text-emerald-500/70 font-mono">{{ webdavLastLiteSync }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button @click="incrementalBackup" :disabled="webdavSyncing || !webdavUrl" class="flex-1 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-md text-[12px] font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5">
                        <span>📤 同步基础数据</span>
                      </button>
                      <button @click="incrementalRestore" :disabled="webdavSyncing || !webdavUrl" class="flex-1 px-3 py-2 bg-slate-600/20 hover:bg-slate-600/30 text-slate-400 border border-slate-500/30 rounded-md text-[12px] font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5">
                        <span>📥 恢复基础数据</span>
                      </button>
                    </div>
                    <p class="mt-2 text-[10px] text-slate-500 dark:text-white/20">同步书架轻量库、桌面设置 JSON 与阅读统计快照，跳过章节正文，速度更快。</p>
                  </div>

                  <!-- Full Sync (Snapshot) -->
                  <div class="bg-black/5 dark:bg-white/5 p-3 rounded-lg border border-black/5 dark:border-white/5">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-[11px] font-bold text-slate-500 dark:text-white/40 uppercase tracking-wider">📦 全量备份 (镜像)</span>
                      <span v-if="webdavLastSync" class="text-[10px] text-amber-500/70 font-mono">{{ webdavLastSync }}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button @click="fullBackup" :disabled="webdavSyncing || !webdavUrl" class="flex-1 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-md text-[12px] font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5">
                        <span>📤 备份全量镜像</span>
                      </button>
                      <button @click="fullRestore" :disabled="webdavSyncing || !webdavUrl" class="flex-1 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 rounded-md text-[12px] font-medium transition-all active:scale-95 flex items-center justify-center gap-1.5">
                        <span>📥 恢复全量镜像</span>
                      </button>
                    </div>
                    <p class="mt-2 text-[10px] text-slate-500 dark:text-white/20">保存完整数据库镜像，同时配套上传桌面设置 JSON 与阅读统计目录。</p>
                  </div>
                </div>

                <div v-if="webdavSyncing" class="text-center mt-3 text-[11px] text-blue-400 animate-pulse flex items-center justify-center gap-2">
                  <span class="w-2 h-2 bg-blue-400 rounded-full"></span>
                  {{ webdavSyncStatus || '正在处理同步请求...' }}
                </div>
              </div>

              <!-- WebDAV Test Connection -->
              <div class="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/[0.05] mt-3">
                <span class="text-[12px] min-h-[18px]" :class="webdavTestResult.includes('✅') ? 'text-emerald-400' : 'text-red-400'">{{ webdavTestResult }}</span>
                <button @click="testWebdav" :disabled="webdavTesting" class="px-4 py-1.5 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-slate-800 dark:text-white/90 rounded-md text-[13px] transition-colors font-medium border border-black/5 dark:border-white/5">探测网络</button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
