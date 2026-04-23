import { computed, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import {
  saveSetting,
  useSettings,
  type AppDarkStyleVariant,
  type AppLightStyleVariant,
  type AppThemeMode,
  type ResolvedAppStyle,
} from './useSettings'

type ResolvedAppBucket = 'light' | 'dark'

const LIGHT_STYLE_LABELS: Record<AppLightStyleVariant, string> = {
  yaobai: '曜白',
  yunbai: '云白',
}

const DARK_STYLE_LABELS: Record<AppDarkStyleVariant, string> = {
  yemu: '夜幕',
  jiye: '极夜',
}

const clampGlassOpacity = (value: number) => Math.max(20, Math.min(100, value))

export function useAppTheme() {
  const settings = useSettings()
  const {
    appThemeMode,
    appLightStyleVariant,
    appDarkStyleVariant,
    glassOpacityPercent,
  } = settings

  const systemPrefersDark = ref(false)
  let mediaQuery: MediaQueryList | null = null

  const updateSystemPreference = () => {
    systemPrefersDark.value = Boolean(mediaQuery?.matches)
  }

  const resolvedBucket = computed<ResolvedAppBucket>(() => {
    if (appThemeMode.value === 'light' || appThemeMode.value === 'dark') return appThemeMode.value
    return systemPrefersDark.value ? 'dark' : 'light'
  })

  const resolvedStyle = computed<ResolvedAppStyle>(() => (
    resolvedBucket.value === 'dark'
      ? appDarkStyleVariant.value
      : appLightStyleVariant.value
  ))

  const resolvedAppearanceLabel = computed(() => {
    const bucketLabel = resolvedBucket.value === 'dark' ? '深色' : '浅色'
    const styleLabel = resolvedBucket.value === 'dark'
      ? DARK_STYLE_LABELS[appDarkStyleVariant.value]
      : LIGHT_STYLE_LABELS[appLightStyleVariant.value]
    return `${bucketLabel}·${styleLabel}`
  })

  const appThemeStyle = computed<CSSProperties>(() => ({
    '--app-glass-opacity': (clampGlassOpacity(glassOpacityPercent.value) / 100).toFixed(2),
  } as CSSProperties))

  const applyDocumentTheme = () => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.appBucket = resolvedBucket.value
    root.dataset.appStyle = resolvedStyle.value
    root.classList.toggle('dark', resolvedBucket.value === 'dark')
    root.style.colorScheme = resolvedBucket.value
  }

  const setAppThemeMode = async (value: AppThemeMode) => {
    appThemeMode.value = value === 'light' || value === 'dark' ? value : 'system'
    await saveSetting('app_theme_mode', appThemeMode.value)
  }

  const setAppLightStyleVariant = async (value: AppLightStyleVariant) => {
    appLightStyleVariant.value = value === 'yaobai' ? 'yaobai' : 'yunbai'
    await saveSetting('app_light_style_variant', appLightStyleVariant.value)
  }

  const setAppDarkStyleVariant = async (value: AppDarkStyleVariant) => {
    appDarkStyleVariant.value = value === 'jiye' ? 'jiye' : 'yemu'
    await saveSetting('app_dark_style_variant', appDarkStyleVariant.value)
  }

  const setGlassOpacityPercent = async (value: number) => {
    glassOpacityPercent.value = clampGlassOpacity(value)
    await saveSetting('glass_opacity_percent', glassOpacityPercent.value)
  }

  onMounted(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      updateSystemPreference()
      mediaQuery.addEventListener('change', updateSystemPreference)
    }
    applyDocumentTheme()
  })

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', updateSystemPreference)
    mediaQuery = null
  })

  watch([resolvedBucket, resolvedStyle], applyDocumentTheme, { immediate: true })

  return {
    appThemeMode,
    appLightStyleVariant,
    appDarkStyleVariant,
    glassOpacityPercent,
    resolvedBucket,
    resolvedStyle,
    resolvedAppearanceLabel,
    appThemeStyle,
    setAppThemeMode,
    setAppLightStyleVariant,
    setAppDarkStyleVariant,
    setGlassOpacityPercent,
  }
}

export type {
  AppThemeMode,
  AppLightStyleVariant,
  AppDarkStyleVariant,
  ResolvedAppStyle,
}
