<script setup lang="ts">
import { useSettings, type HomeManualNavMode } from '../../composables/useSettings'

const { setAspectRatio } = defineProps<{
  setAspectRatio: (ratio: number) => void
}>()

const settings = useSettings()
const {
  homeNavAutoSwitchEnabled,
  homeNavManualMode,
  homeNavPortraitMode,
  homeNavLandscapeMode,
  saveSetting,
} = settings

const saveAutoSwitch = async () => {
  await saveSetting('home_nav_auto_switch_enabled', homeNavAutoSwitchEnabled.value ? 'true' : 'false')
}

const setManualMode = async (mode: HomeManualNavMode) => {
  homeNavManualMode.value = mode
  await saveSetting('home_nav_manual_mode', mode)
}

const setAutoRule = async (target: 'portrait' | 'landscape', mode: 'sidebar' | 'bottom') => {
  if (target === 'portrait') {
    homeNavPortraitMode.value = mode
    await saveSetting('home_nav_portrait_mode', mode)
  } else {
    homeNavLandscapeMode.value = mode
    await saveSetting('home_nav_landscape_mode', mode)
  }
}
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">窗口与显示</h3>
    <div class="app-card app-card-hover app-divide-y">
      <div class="p-4 app-row">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">☰</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-4">
              <div>
                <div class="text-[14px] font-medium app-title">首页导航模式</div>
                <div class="text-[12px] app-muted mt-0.5">
                  {{ homeNavAutoSwitchEnabled ? '自动：窄窗口按窄屏规则，宽窗口按宽屏规则' : '手动：固定使用所选导航' }}
                </div>
              </div>
              <label class="flex items-center cursor-pointer relative shrink-0">
                <input type="checkbox" v-model="homeNavAutoSwitchEnabled" @change="saveAutoSwitch" class="peer sr-only" />
                <div class="app-switch"></div>
              </label>
            </div>

            <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div class="app-card app-card-strong p-3">
                <div class="text-[12px] font-medium app-title mb-2">自动规则</div>
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[12px] app-muted">窄窗口</span>
                    <div class="flex gap-2">
                      <button
                        @click="setAutoRule('portrait', 'bottom')"
                        :class="{ 'app-button-primary': homeNavPortraitMode === 'bottom' }"
                        class="app-button px-3 py-1.5 text-[12px]"
                      >
                        底栏
                      </button>
                      <button
                        @click="setAutoRule('portrait', 'sidebar')"
                        :class="{ 'app-button-primary': homeNavPortraitMode === 'sidebar' }"
                        class="app-button px-3 py-1.5 text-[12px]"
                      >
                        侧栏
                      </button>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-[12px] app-muted">宽窗口</span>
                    <div class="flex gap-2">
                      <button
                        @click="setAutoRule('landscape', 'sidebar')"
                        :class="{ 'app-button-primary': homeNavLandscapeMode === 'sidebar' }"
                        class="app-button px-3 py-1.5 text-[12px]"
                      >
                        侧栏
                      </button>
                      <button
                        @click="setAutoRule('landscape', 'bottom')"
                        :class="{ 'app-button-primary': homeNavLandscapeMode === 'bottom' }"
                        class="app-button px-3 py-1.5 text-[12px]"
                      >
                        底栏
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="app-card app-card-strong p-3">
                <div class="text-[12px] font-medium app-title mb-2">手动模式</div>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    @click="setManualMode('sidebar')"
                    :class="{ 'app-button-primary': homeNavManualMode === 'sidebar' }"
                    class="app-button px-3 py-2 text-[12px]"
                  >
                    固定侧栏
                  </button>
                  <button
                    @click="setManualMode('bottom')"
                    :class="{ 'app-button-primary': homeNavManualMode === 'bottom' }"
                    class="app-button px-3 py-2 text-[12px]"
                  >
                    固定底栏
                  </button>
                </div>
                <div class="mt-2 text-[11px] app-muted">
                  关闭自动切换后立即使用。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
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
