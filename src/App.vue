<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import BookshelfView from './components/BookshelfView.vue'
import ReaderView from './components/ReaderView.vue'
import SettingsView from './components/SettingsView.vue'
import TypographyView from './components/TypographyView.vue'

type View = 'bookshelf' | 'reader' | 'settings' | 'typography'

const currentView = ref<View>('bookshelf')
const selectedBookId = ref<number | null>(null)
const isImmersive = ref(false)
const showQuitConfirm = ref(false)
const isSidebarCollapsed = ref(false)
const isWindowMaximized = ref(false)
const toggleSidebar = async () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
  try { await window.electronAPI.db.query("INSERT OR REPLACE INTO settings (key, value) VALUES ('sidebarCollapsed', ?)", [isSidebarCollapsed.value ? 'true' : 'false']) } catch {}
}

const openBook = (bookId: number) => {
  selectedBookId.value = bookId
  currentView.value = 'reader'
}

const goBack = () => {
  currentView.value = 'bookshelf'
  selectedBookId.value = null
  isImmersive.value = false
  window.electronAPI.win.setFullScreen(false)
  window.electronAPI.win.setControlsVisible(true)
}



const toggleImmersive = async (val: boolean) => {
  isImmersive.value = val
  await window.electronAPI.win.setFullScreen(val)
}

const minimizeWindow = () => window.electronAPI.win.minimize()
const toggleMaximize = () => window.electronAPI.win.toggleMaximize()
const closeWindow = () => {
  window.electronAPI.app.quit()
}

const handleGlobalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showQuitConfirm.value) {
      window.electronAPI.app.quit()
      return
    }
    if (currentView.value === 'settings') {
      goBack()
      return
    }
    if (currentView.value === 'bookshelf') {
      showQuitConfirm.value = true
      return
    }
  } else if (e.key === 'Enter' && showQuitConfirm.value) {
    window.electronAPI.app.quit()
  }
}

const cancelQuit = () => { showQuitConfirm.value = false }
const confirmQuit = () => { window.electronAPI.app.quit() }

let touchStartX = 0
let touchEndX = 0
const handleTouchStart = (e: TouchEvent) => { touchStartX = e.changedTouches[0].screenX }
const handleTouchEnd = (e: TouchEvent) => {
  touchEndX = e.changedTouches[0].screenX
  if (touchEndX - touchStartX > 80 && currentView.value !== 'bookshelf' && currentView.value !== 'reader') {
    goBack()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('touchstart', handleTouchStart, { passive: true })
  window.addEventListener('touchend', handleTouchEnd, { passive: true })
  try {
    const sc = await window.electronAPI.db.query("SELECT value FROM settings WHERE key = 'sidebarCollapsed'")
    if (sc[0] && sc[0].value === 'true') isSidebarCollapsed.value = true
  } catch {}
  try {
    const s = await window.electronAPI.db.query("SELECT value FROM settings WHERE key = 'autoOpenLastRead'")
    if (s[0] && s[0].value === 'true') {
      const b = await window.electronAPI.db.query("SELECT id FROM books ORDER BY last_read DESC LIMIT 1")
      if (b[0] && b[0].id) {
        selectedBookId.value = b[0].id
        currentView.value = 'reader'
      }
    }
  } catch (e) {}

  // Sync window maximized state
  try {
    isWindowMaximized.value = await window.electronAPI.win.getIsMaximized()
    window.electronAPI.win.onMaximized((val: boolean) => {
      isWindowMaximized.value = val
    })
  } catch {}
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('touchstart', handleTouchStart)
  window.removeEventListener('touchend', handleTouchEnd)
})
</script>

<template>
  <div class="min-h-screen bg-transparent text-slate-800 dark:text-white selection:bg-blue-500/30 overflow-hidden font-['Segoe_UI',_sans-serif]">
    <!-- Quit Confirmation Modal -->
    <Transition name="fade">
      <div v-if="showQuitConfirm" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center" @click.self="cancelQuit">
        <div class="bg-white dark:bg-[#2d2d2d] p-6 rounded-xl max-w-sm w-full shadow-2xl border border-black/5 dark:border-white/5 text-center">
          <h3 class="text-xl font-bold mb-2 text-slate-800 dark:text-white">退出阅读器</h3>
          <p class="text-sm text-slate-500 dark:text-slate-300 mb-6">确定要退出 PacilRead 吗？</p>
          <div class="flex gap-3">
            <button @click="cancelQuit" class="flex-1 py-2 rounded-lg bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition-colors font-semibold border border-black/5 dark:border-white/5 text-slate-700 dark:text-white">取消</button>
            <button @click="confirmQuit" class="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 transition-colors font-semibold text-white">退出 (ESC/Enter)</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade" mode="out-in">
      <!-- Full Screen Reader -->
      <ReaderView
        v-if="currentView === 'reader' && selectedBookId"
        :book-id="selectedBookId"
        @toggle-immersive="toggleImmersive"
        @go-back="goBack"
      />
      
      <!-- PowerToys Style App Layout -->
      <div v-else class="flex h-screen w-full relative">
        <!-- Custom Window Controls moved to Content Pane -->

        <!-- Sidebar -->
        <aside :class="['bg-slate-50 dark:bg-[#1e1e1e] flex flex-col pt-6 shrink-0 z-10 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] border-r border-black/5 dark:border-white/5', isSidebarCollapsed ? 'w-[68px]' : 'w-[260px]']">
          <div class="px-4 mb-6 flex items-center window-drag relative min-h-[32px]">
            <button @click="toggleSidebar" class="absolute left-4 w-9 h-9 rounded-md hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-lg active:scale-95 transition-colors no-drag cursor-pointer z-50 text-slate-600 hover:text-slate-800 dark:text-white/80 dark:hover:text-white" title="折叠导航栏">
              ☰
            </button>
            <div class="flex items-center gap-3 ml-12 transition-opacity duration-300 pointer-events-none" :class="isSidebarCollapsed ? 'opacity-0' : 'opacity-100'">
              <div class="w-8 h-8 rounded-md bg-[#005fb8] flex items-center justify-center font-bold text-lg shadow-sm font-italic text-white">P</div>
              <h1 class="text-[15px] font-semibold tracking-wide text-slate-800 dark:text-white/90">PacilRead</h1>
            </div>
          </div>
          
          <nav class="flex-1 px-3 space-y-1">
            <button @click="currentView = 'bookshelf'" 
                    :class="currentView === 'bookshelf' ? 'bg-black/5 dark:bg-white/[0.08] relative' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:-translate-y-0.5 hover:shadow-lg'"
                    class="w-full text-left p-2.5 rounded-md transition-all duration-300 flex items-center group">
              <div v-if="currentView === 'bookshelf'" class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#005fb8] rounded-r-full"></div>
              <div class="w-8 flex justify-center shrink-0">
                <span class="text-[18px] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform">📚</span>
              </div>
              <span class="text-[13px] font-medium opacity-90 whitespace-nowrap overflow-hidden transition-all duration-300 ml-2" :class="isSidebarCollapsed ? 'w-0 opacity-0' : 'w-full'">书架大厅</span>
            </button>

            <button @click="currentView = 'typography'" 
                    :class="currentView === 'typography' ? 'bg-black/5 dark:bg-white/[0.08] relative' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:-translate-y-0.5 hover:shadow-lg'"
                    class="w-full text-left p-2.5 rounded-md transition-all duration-300 flex items-center group mt-1">
              <div v-if="currentView === 'typography'" class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#005fb8] rounded-r-full"></div>
              <div class="w-8 flex justify-center shrink-0">
                <span class="text-[18px] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform">✨</span>
              </div>
              <span class="text-[13px] font-medium opacity-90 whitespace-nowrap overflow-hidden transition-all duration-300 ml-2" :class="isSidebarCollapsed ? 'w-0 opacity-0' : 'w-full'">排版与预览</span>
            </button>
          </nav>

          <div class="px-3 pb-6">
            <button @click="currentView = 'settings'" 
                    :class="currentView === 'settings' ? 'bg-black/5 dark:bg-white/[0.08] relative' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04] hover:-translate-y-0.5 hover:shadow-lg'"
                    class="w-full text-left p-2.5 rounded-md transition-all duration-300 flex items-center group">
              <div v-if="currentView === 'settings'" class="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#005fb8] rounded-r-full"></div>
              <div class="w-8 flex justify-center shrink-0">
                <span class="text-[18px] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform">⚙️</span>
              </div>
              <span class="text-[13px] font-medium opacity-90 whitespace-nowrap overflow-hidden transition-all duration-300 ml-2" :class="isSidebarCollapsed ? 'w-0 opacity-0' : 'w-full'">偏好设置</span>
            </button>
          </div>
        </aside>
        
        <!-- Content Pane -->
        <main class="flex-1 bg-transparent rounded-tl-lg relative z-0 flex flex-col mt-1 transition-all duration-300">
          <!-- Draggable Top Bar Area with Controls -->
          <div class="h-10 max-h-10 w-full window-drag shrink-0 rounded-tl-lg flex justify-end items-center relative pr-0">
            <div class="flex items-center h-10 no-drag">
              <button @click="minimizeWindow" class="w-12 h-10 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors group cursor-pointer">
                <span class="text-[14px] opacity-70 group-hover:opacity-100">⎯</span>
              </button>
              <button @click="toggleMaximize" class="w-12 h-10 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors group cursor-pointer">
                <span v-if="!isWindowMaximized" class="text-[12px] opacity-70 group-hover:opacity-100">⬜</span>
                <span v-else class="text-[12px] opacity-70 group-hover:opacity-100">❐</span>
              </button>
              <button @click="closeWindow" class="w-12 h-10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors group cursor-pointer">
                <span class="text-[16px] opacity-70 group-hover:opacity-100">✕</span>
              </button>
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto custom-scrollbar px-10 pb-10">
            <Transition name="fade" mode="out-in">
              <BookshelfView
                v-if="currentView === 'bookshelf'"
                @open-book="openBook"
                class="fade-element max-w-7xl mx-auto"
              />
              <SettingsView
                v-else-if="currentView === 'settings'"
                @back="currentView = 'bookshelf'"
                @refresh-settings="() => {}"
                class="fade-element max-w-5xl mx-auto"
              />
              <TypographyView
                v-else-if="currentView === 'typography'"
                @back="currentView = 'bookshelf'"
                class="fade-element max-w-5xl mx-auto"
              />
            </Transition>
          </div>
        </main>
      </div>
    </Transition>
  </div>
</template>

<style>
@import './index.css';
</style>
