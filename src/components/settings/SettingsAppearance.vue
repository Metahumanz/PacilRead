<script setup lang="ts">
import { useAppTheme } from '../../composables/useAppTheme'
import type {
  AppDarkStyleVariant,
  AppLightStyleVariant,
  AppThemeMode,
} from '../../composables/useSettings'

const {
  appThemeMode,
  appLightStyleVariant,
  appDarkStyleVariant,
  glassOpacityPercent,
  resolvedAppearanceLabel,
  setAppThemeMode,
  setAppLightStyleVariant,
  setAppDarkStyleVariant,
  setGlassOpacityPercent,
} = useAppTheme()

const themeModes: Array<{ value: AppThemeMode; label: string; hint: string }> = [
  { value: 'system', label: '跟随系统', hint: '随系统浅深色自动切换' },
  { value: 'light', label: '浅色', hint: '固定使用浅色风格' },
  { value: 'dark', label: '深色', hint: '固定使用深色风格' },
]

const lightStyles: Array<{ value: AppLightStyleVariant; label: string; hint: string }> = [
  { value: 'yaobai', label: '曜白', hint: '方正、克制、明亮' },
  { value: 'yunbai', label: '云白', hint: '柔和、通透、轻盈' },
]

const darkStyles: Array<{ value: AppDarkStyleVariant; label: string; hint: string }> = [
  { value: 'yemu', label: '夜幕', hint: '暖暗、低饱和、文本感' },
  { value: 'jiye', label: '极夜', hint: '冷暗、精密、层级感' },
]
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">应用外观</h3>
    <div class="app-card app-card-hover app-divide-y overflow-hidden">
      <div class="p-4 app-row">
        <div class="flex items-start justify-between gap-4 mb-4">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">◐</span>
            <div>
              <div class="text-[14px] font-medium app-title">应用主题模式</div>
              <div class="text-[12px] app-muted mt-0.5">当前外观：{{ resolvedAppearanceLabel }}</div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
          <button
            v-for="mode in themeModes"
            :key="mode.value"
            @click="setAppThemeMode(mode.value)"
            class="app-button p-3 text-left"
            :class="{ 'app-button-primary': appThemeMode === mode.value }"
          >
            <span class="block text-[13px] font-semibold">{{ mode.label }}</span>
            <span class="block text-[11px] opacity-70 mt-1">{{ mode.hint }}</span>
          </button>
        </div>
      </div>

      <div class="p-4 app-row">
        <div class="text-[14px] font-medium app-title mb-3">浅色风格</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            v-for="style in lightStyles"
            :key="style.value"
            @click="setAppLightStyleVariant(style.value)"
            class="app-button p-3 text-left"
            :class="{ 'app-button-primary': appLightStyleVariant === style.value }"
          >
            <span class="block text-[13px] font-semibold">{{ style.label }}</span>
            <span class="block text-[11px] opacity-70 mt-1">{{ style.hint }}</span>
          </button>
        </div>
      </div>

      <div class="p-4 app-row">
        <div class="text-[14px] font-medium app-title mb-3">深色风格</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            v-for="style in darkStyles"
            :key="style.value"
            @click="setAppDarkStyleVariant(style.value)"
            class="app-button p-3 text-left"
            :class="{ 'app-button-primary': appDarkStyleVariant === style.value }"
          >
            <span class="block text-[13px] font-semibold">{{ style.label }}</span>
            <span class="block text-[11px] opacity-70 mt-1">{{ style.hint }}</span>
          </button>
        </div>
      </div>

      <div class="p-4 app-row">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-[14px] font-medium app-title">毛玻璃不透明度</div>
            <div class="text-[12px] app-muted mt-0.5">控制非阅读界面侧栏、卡片和弹窗的透视强度</div>
          </div>
          <span class="app-badge px-3 py-1 text-[12px] font-mono">{{ glassOpacityPercent }}%</span>
        </div>
        <input
          v-model.number="glassOpacityPercent"
          type="range"
          min="20"
          max="100"
          step="1"
          class="w-full mt-4 h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--app-accent)]"
          @change="setGlassOpacityPercent(glassOpacityPercent)"
        />
      </div>
    </div>
  </div>
</template>
