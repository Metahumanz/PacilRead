<script setup lang="ts">
import { computed, defineAsyncComponent, ref, onMounted, onUnmounted, watch } from 'vue'
import { useSettings } from './composables/useSettings'
import { useAppTheme } from './composables/useAppTheme'
import { hasReadingStatsHistory } from './utils/readingStatsAvailability'
import type { BookmarkTarget } from './composables/useBookmarks'
import BookshelfView from './components/BookshelfView.vue'
import AsyncViewLoading from './components/common/AsyncViewLoading.vue'
import AppToastHost from './components/common/AppToastHost.vue'

const ReaderView = defineAsyncComponent({ loader: () => import('./components/ReaderView.vue'), loadingComponent: AsyncViewLoading, delay: 120 })
const SettingsView = defineAsyncComponent({ loader: () => import('./components/SettingsView.vue'), loadingComponent: AsyncViewLoading, delay: 120 })
const ReadingStatsView = defineAsyncComponent({ loader: () => import('./components/ReadingStatsView.vue'), loadingComponent: AsyncViewLoading, delay: 120 })
const BookmarksView = defineAsyncComponent({ loader: () => import('./components/BookmarksView.vue'), loadingComponent: AsyncViewLoading, delay: 120 })

type View = 'bookshelf' | 'reader' | 'settings' | 'stats' | 'bookmarks'
type NonStatsView = Exclude<View, 'stats'>

const settings = useSettings()
const {
  sidebarCollapsed,
  autoOpenLastRead,
  readingTimeTrackingEnabled,
  readingTimeStatsHidden,
  homeNavAutoSwitchEnabled,
  homeNavManualMode,
  homeBottomNavStyle,
  homeNavPortraitMode,
  homeNavLandscapeMode,
  homeFixedSidebarStyle,
  loadAllSettings,
  saveSetting
} = settings
const { appThemeStyle } = useAppTheme()

const currentView = ref<View>('bookshelf')
const selectedBookId = ref<number | null>(null)
const selectedBookmarkTarget = ref<BookmarkTarget | null>(null)
const statsBookId = ref<number | null>(null)
const statsReturnView = ref<NonStatsView>('settings')
const statsCanReturnToGlobal = ref(false)
const showStatsNav = ref(false)
const isImmersive = ref(false)
const showQuitConfirm = ref(false)
const isWindowMaximized = ref(false)
const windowWidth = ref(typeof window === 'undefined' ? 1200 : window.innerWidth)
const windowHeight = ref(typeof window === 'undefined' ? 800 : window.innerHeight)
let offWindowMaximized: (() => void) | null = null
let offWindowFullScreen: (() => void) | null = null

const updateWindowSize = () => {
  windowWidth.value = window.innerWidth
  windowHeight.value = window.innerHeight
}

const normalizeHomeNavMode = (mode: string) => {
  if (mode === 'bottom' || mode === 'sidebar' || mode === 'drawer') return mode
  return 'sidebar'
}

const resolvedHomeNavMode = computed(() => {
  if (!homeNavAutoSwitchEnabled.value) {
    return homeNavManualMode.value === 'bottom' ? 'bottom' : 'sidebar'
  }

  const isNarrow = windowWidth.value < 760
  const isPortrait = windowHeight.value > windowWidth.value
  const preferredMode = normalizeHomeNavMode(
    isNarrow || isPortrait ? homeNavPortraitMode.value : homeNavLandscapeMode.value
  )

  if (preferredMode === 'drawer') return isNarrow ? 'bottom' : 'sidebar'
  return preferredMode
})

const useBottomNav = computed(() => resolvedHomeNavMode.value === 'bottom')
const effectiveSidebarCollapsed = computed(() => (
  sidebarCollapsed.value || homeFixedSidebarStyle.value === 'compact'
))

const homeNavItems = computed(() => [
  {
    key: 'bookshelf',
    label: '书架',
    icon: '📚',
    visible: true,
    active: currentView.value === 'bookshelf',
    select: () => { currentView.value = 'bookshelf' }
  },
  {
    key: 'stats',
    label: '统计',
    icon: '⏱️',
    visible: showStatsNav.value,
    active: currentView.value === 'stats',
    select: () => { openGlobalStats() }
  },
  {
    key: 'bookmarks',
    label: '书签',
    icon: '🔖',
    visible: true,
    active: currentView.value === 'bookmarks',
    select: () => { currentView.value = 'bookmarks' }
  },
  {
    key: 'settings',
    label: '设置',
    icon: '⚙️',
    visible: true,
    active: currentView.value === 'settings',
    select: () => { currentView.value = 'settings' }
  }
].filter(item => item.visible))

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
  saveSetting('sidebarCollapsed', sidebarCollapsed.value ? 'true' : 'false')
}

const refreshHomeAvailability = async () => {
  try {
    const hasHistory = await hasReadingStatsHistory()
    showStatsNav.value = readingTimeTrackingEnabled.value || (!readingTimeStatsHidden.value && hasHistory)
  } catch (_) {
    showStatsNav.value = readingTimeTrackingEnabled.value
  }
}

const openBook = (bookId: number, target?: BookmarkTarget | null) => {
  selectedBookId.value = bookId
  selectedBookmarkTarget.value = target || null
  currentView.value = 'reader'
}

const goBack = () => {
  currentView.value = 'bookshelf'
  selectedBookId.value = null
  selectedBookmarkTarget.value = null
  isImmersive.value = false
  window.electronAPI.win.setFullScreen(false)
  window.electronAPI.win.setControlsVisible(true)
  refreshHomeAvailability()
}

const exitReaderShellForStats = async () => {
  isImmersive.value = false
  await window.electronAPI.win.setFullScreen(false)
  await window.electronAPI.win.setControlsVisible(true)
}

const openGlobalStats = async () => {
  if (currentView.value === 'reader') {
    statsReturnView.value = 'reader'
    await exitReaderShellForStats()
  } else {
    statsReturnView.value = currentView.value as NonStatsView
  }
  statsBookId.value = null
  statsCanReturnToGlobal.value = false
  currentView.value = 'stats'
}

const openBookStatsFromReader = async (bookId: number) => {
  statsReturnView.value = 'reader'
  statsBookId.value = bookId
  statsCanReturnToGlobal.value = false
  await exitReaderShellForStats()
  currentView.value = 'stats'
}

const openStatsBook = (bookId: number) => {
  statsBookId.value = bookId
  statsCanReturnToGlobal.value = true
}

const closeStats = () => {
  if (statsBookId.value !== null && statsCanReturnToGlobal.value) {
    statsBookId.value = null
    statsCanReturnToGlobal.value = false
    return
  }
  statsBookId.value = null
  statsCanReturnToGlobal.value = false
  currentView.value = statsReturnView.value
  refreshHomeAvailability()
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
    if (currentView.value === 'bookmarks') {
      goBack()
      return
    }
    if (currentView.value === 'stats') {
      closeStats()
      return
    }
    if (currentView.value === 'bookshelf') {
      showQuitConfirm.value = true
      return
    }
    if (currentView.value === 'reader') {
      goBack()
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
    if (currentView.value === 'stats') closeStats()
    else goBack()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('resize', updateWindowSize)
  window.addEventListener('touchstart', handleTouchStart, { passive: true })
  window.addEventListener('touchend', handleTouchEnd, { passive: true })
  updateWindowSize()
  
  await loadAllSettings()
  await refreshHomeAvailability()
  
  if (autoOpenLastRead.value) {
    try {
      const recentBook = await window.electronAPI.library.getMostRecentBook()
      if (recentBook) {
        selectedBookId.value = recentBook.id
        selectedBookmarkTarget.value = null
        currentView.value = 'reader'
      }
    } catch (e) {
      console.error('Auto open last read failed:', e)
    }
  }

  // Sync window maximized state
  try {
    isWindowMaximized.value = await window.electronAPI.win.getIsMaximized()
    offWindowMaximized = window.electronAPI.win.onMaximized((val: boolean) => {
      isWindowMaximized.value = val
    })
    offWindowFullScreen = window.electronAPI.win.onFullScreen((val: boolean) => {
      isImmersive.value = val
    })
  } catch {}
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', updateWindowSize)
  window.removeEventListener('touchstart', handleTouchStart)
  window.removeEventListener('touchend', handleTouchEnd)
  offWindowMaximized?.()
  offWindowFullScreen?.()
  offWindowMaximized = null
  offWindowFullScreen = null
})

watch([readingTimeTrackingEnabled, readingTimeStatsHidden], () => {
  refreshHomeAvailability()
})
</script>

<template>
  <div
    :style="appThemeStyle"
    :class="currentView === 'reader'
      ? 'min-h-screen bg-transparent text-slate-800 dark:text-white selection:bg-blue-500/30 overflow-hidden font-sans'
      : 'app-shell'"
  >
    <AppToastHost />
    <!-- Quit Confirmation Modal -->
    <Transition name="fade">
      <div v-if="showQuitConfirm" class="fixed inset-0 app-modal-backdrop z-[200] flex items-center justify-center" @click.self="cancelQuit">
        <div class="app-card app-card-strong p-6 max-w-sm w-full text-center">
          <h3 class="text-xl font-bold mb-2 app-title">退出阅读器</h3>
          <p class="text-sm app-muted mb-6">确定要退出 PacilRead 吗？</p>
          <div class="flex gap-3">
            <button @click="cancelQuit" class="app-button flex-1 py-2">取消</button>
            <button @click="confirmQuit" class="app-button app-button-danger flex-1 py-2">退出 (ESC/Enter)</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade" mode="out-in">
      <!-- Full Screen Reader -->
      <ReaderView
        v-if="currentView === 'reader' && selectedBookId"
        :book-id="selectedBookId"
        :initial-bookmark="selectedBookmarkTarget"
        :is-immersive="isImmersive"
        @toggle-immersive="toggleImmersive"
        @go-back="goBack"
        @open-book-stats="openBookStatsFromReader"
      />
      
      <!-- PowerToys Style App Layout -->
      <div v-else class="flex h-screen w-full min-w-0 overflow-hidden relative">

        <!-- Sidebar -->
        <aside
          v-if="!useBottomNav"
          :class="['app-sidebar flex flex-col pt-6 shrink-0 z-10 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]', effectiveSidebarCollapsed ? 'w-[68px]' : 'w-[260px]']"
        >
          <div class="px-4 mb-6 flex items-center window-drag relative min-h-[32px]">
            <button @click="toggleSidebar" class="app-icon-button absolute left-4 w-9 h-9 flex items-center justify-center text-lg active:scale-95 no-drag cursor-pointer z-50" title="折叠导航栏">
              ☰
            </button>
            <div class="flex items-center gap-3 ml-12 transition-opacity duration-300 pointer-events-none" :class="effectiveSidebarCollapsed ? 'opacity-0' : 'opacity-100'">
              <div class="app-logo w-8 h-8 flex items-center justify-center font-bold text-lg italic">P</div>
              <h1 class="app-brand text-[15px] font-semibold">PacilRead</h1>
            </div>
          </div>
          
          <nav class="flex-1 px-3 space-y-1">
            <button
              v-for="item in homeNavItems.filter(item => item.key !== 'settings')"
              :key="item.key"
              @click="item.select"
              :class="item.active ? 'is-active relative' : ''"
              class="app-nav-button flex items-center group"
            >
              <div v-if="item.active" class="app-nav-indicator absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4"></div>
              <div class="w-8 flex justify-center shrink-0">
                <span class="text-[18px] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform">{{ item.icon }}</span>
              </div>
              <span class="text-[13px] font-medium opacity-90 whitespace-nowrap overflow-hidden transition-all duration-300 ml-2" :class="effectiveSidebarCollapsed ? 'w-0 opacity-0' : 'w-full'">{{ item.label }}</span>
            </button>
          </nav>

          <div class="px-3 pb-6">
            <button
              v-for="item in homeNavItems.filter(item => item.key === 'settings')"
              :key="item.key"
              @click="item.select"
              :class="item.active ? 'is-active relative' : ''"
              class="app-nav-button flex items-center group"
            >
              <div v-if="item.active" class="app-nav-indicator absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4"></div>
              <div class="w-8 flex justify-center shrink-0">
                <span class="text-[18px] opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-transform">{{ item.icon }}</span>
              </div>
              <span class="text-[13px] font-medium opacity-90 whitespace-nowrap overflow-hidden transition-all duration-300 ml-2" :class="effectiveSidebarCollapsed ? 'w-0 opacity-0' : 'w-full'">{{ item.label }}</span>
            </button>
          </div>
        </aside>
        
        <!-- Content Pane -->
        <main
          :class="[
            isWindowMaximized || useBottomNav ? 'rounded-none mt-0' : 'rounded-tl-lg mt-1',
            useBottomNav ? 'home-main-bottom' : ''
          ]"
          class="flex-1 min-w-0 bg-transparent relative z-0 flex flex-col maximize-ease"
        >
          <!-- Draggable Top Bar Area with Controls -->
          <div class="h-10 max-h-10 w-full window-drag shrink-0 rounded-tl-lg flex justify-end items-center relative">
            <div class="flex items-center h-10 no-drag">
              <button @click="minimizeWindow" class="app-window-button w-12 h-10 flex items-center justify-center group cursor-pointer">
                <span class="text-[14px] opacity-70 group-hover:opacity-100">⎯</span>
              </button>
              <button @click="toggleMaximize" class="app-window-button w-12 h-10 flex items-center justify-center group cursor-pointer">
                <Transition name="icon-fade" mode="out-in">
                  <span v-if="!isWindowMaximized" key="max" class="text-[12px] opacity-70 group-hover:opacity-100">⬜</span>
                  <span v-else key="restore" class="text-[12px] opacity-70 group-hover:opacity-100">❐</span>
                </Transition>
              </button>
              <button @click="closeWindow" class="app-window-button app-window-close w-12 h-10 flex items-center justify-center group cursor-pointer">
                <span class="text-[16px] opacity-70 group-hover:opacity-100">✕</span>
              </button>
            </div>
          </div>
          
          <div :class="['flex-1 min-w-0 overflow-y-auto overflow-x-hidden custom-scrollbar', useBottomNav ? 'px-4 sm:px-6 pb-28' : 'px-10 pb-10']">
            <Transition name="fade" mode="out-in">
              <BookshelfView
                v-if="currentView === 'bookshelf'"
                @open-book="openBook"
                class="fade-element max-w-7xl mx-auto"
              />
              <SettingsView
                v-else-if="currentView === 'settings'"
                @back="currentView = 'bookshelf'"
                @open-reading-stats="openGlobalStats"
                @refresh-settings="() => {}"
                class="fade-element max-w-5xl mx-auto"
              />
              <ReadingStatsView
                v-else-if="currentView === 'stats'"
                :book-id="statsBookId"
                @back="closeStats"
                @open-book-stats="openStatsBook"
                class="fade-element max-w-5xl mx-auto"
              />
              <BookmarksView
                v-else-if="currentView === 'bookmarks'"
                @open-book="openBook"
                class="fade-element max-w-5xl mx-auto"
              />
            </Transition>
          </div>
        </main>

        <nav v-if="useBottomNav" class="app-bottom-nav no-drag" :class="`is-${homeBottomNavStyle}`" aria-label="首页导航">
          <button
            v-for="item in homeNavItems"
            :key="item.key"
            @click="item.select"
            class="app-bottom-nav-button"
            :class="{ 'is-active': item.active }"
            type="button"
          >
            <span class="app-bottom-nav-icon">{{ item.icon }}</span>
            <span class="app-bottom-nav-label">{{ item.label }}</span>
          </button>
        </nav>
      </div>
    </Transition>
  </div>
</template>

<style>
@import './index.css';
</style>
