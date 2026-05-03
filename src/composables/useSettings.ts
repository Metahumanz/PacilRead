import { ref } from 'vue'
import { MIMO_TTS_DEFAULT_VOICE, isMimoTtsVoiceId } from '../data/mimoTts'
import { useDataStore } from './useDataStore'
import type { FlipMode } from '../types/pagination'

/*
 * 设置系统架构说明（与 Android 端兼容性）
 *
 * PacilRead 桌面端使用 SQLite `settings` 表存储所有设置（键值对），与 Android 端
 * SharedPreferences 的 `ANDROID_PRIVATE_SYNC_KEYS`（55 个键）不同。桌面端使用
 * 独立的 JSON 同步格式（`platform: 'desktop'`, `schemaVersion: 1`），存储在 WebDAV
 * 的 `<desktop-settings>/desktop-settings.json`。
 *
 * DATABASE_COMPATIBILITY.md 推荐方案一（模拟 SharedPreferences）以获得最大兼容性，
 * 但当前桌面端采用方案二（独立平台设置 + 桥接层），因为：
 *   1. 桌面端设置的键名语义与 Android 不同（如 `reader_fontSize` vs `font_size_sp`）
 *   2. 部分设置是桌面端独有的（窗口状态、键盘快捷键等）
 *   3. Android 的 55 键白名单中有些键桌面端不适用
 *
 * WebDAV 同步时，桌面设置通过 `useReadingStats.ts` 中的
 * `uploadDesktopSettingsSnapshot` / `restoreDesktopSettingsSnapshot` 处理。
 * 背景图通过 placeholder 机制处理（上传到 backgrounds/，JSON 中存占位符）。
 *
 * Float 精度说明：Android 端 `FLOAT_SYNC_KEYS` 包含 4 个键需要强制以 Float 类型写入：
 *   font_size_sp, line_spacing_extra, tts_rate, letter_spacing
 * 桌面端 SQLite settings 表使用 TEXT 类型存储所有值，反序列化时由各组件自行转换类型，
 * 因此不受此限制。
 */

// ---- Persistence helpers ----
export const saveSetting = async (k: string, v: any) => {
  const { setSetting } = useDataStore()
  await setSetting(k, String(v))
}

const DEFAULT_NEXT_KEYS = ['ArrowRight', 'PageDown', ' ']
const DEFAULT_PREV_KEYS = ['ArrowLeft', 'PageUp']
const DEFAULT_DESKTOP_SETTINGS_DIR = 'desktop-settings'

export type AppThemeMode = 'system' | 'light' | 'dark'
export type AppLightStyleVariant = 'yaobai' | 'yunbai'
export type AppDarkStyleVariant = 'yemu' | 'jiye'
export type ResolvedAppStyle = AppLightStyleVariant | AppDarkStyleVariant
export type ReaderAutoNightPolicy = 'preserve' | 'override'
export type HomeNavMode = 'sidebar' | 'bottom' | 'drawer'
export type HomeManualNavMode = 'sidebar' | 'bottom'

const clampGlassOpacity = (value: number) => Math.max(20, Math.min(100, value))

// ---- Singleton State ----
const fontSize = ref(20)
const lineHeight = ref(1.8)
const letterSpacing = ref(0)
const fontWeight = ref(400)
const marginX = ref(60)
const marginY = ref(40)
const fontFamily = ref('system-ui')
const fontColor = ref('#e2e8f0')
const coverColor = ref('#0f172a')
const bgImage = ref('')
const blurAmount = ref(0)
const textAlign = ref('left')
const alignBottom = ref(false)
const pageMode = ref<'single' | 'double'>('single')
const doublePageStep = ref<1 | 2>(2)
const flipMode = ref<FlipMode>('slide')
const flipSpeed = ref<'fast' | 'medium' | 'slow'>('medium')
const pIndent = ref(2)
const pSpacing = ref(0.8)

// HUD settings
const hudTopLeft = ref('none')
const hudTopCenter = ref('none')
const hudTopRight = ref('none')
const hudBottomLeft = ref('titleOrChapter')
const hudBottomCenter = ref('none')
const hudBottomRight = ref('pageAndProgress')

// Chapter title settings
const chapterTitleDisplay = ref<'left' | 'center' | 'none'>('left')

// Auto-page
const autoPageSpeed = ref(10)

// TTS
const ttsEngine = ref<'system' | 'edge' | 'mimo'>('edge')
const ttsVoice = ref('')
const ttsRate = ref(1.0)
const highlightColor = ref('#3b82f6')
const ttsMiMoApiKey = ref('')
const ttsMiMoVoice = ref(MIMO_TTS_DEFAULT_VOICE)

// Navigation keys
const nextKeys = ref<string[]>([...DEFAULT_NEXT_KEYS])
const prevKeys = ref<string[]>([...DEFAULT_PREV_KEYS])

// UI hints
const showKeyHints = ref(true)

// Always on top
const isAlwaysOnTop = ref(false)

// Auto-open
const autoOpenLastRead = ref(false)
const silentUpdate = ref(false)
const sliderMode = ref<'book' | 'chapter'>('book')
const sidebarCollapsed = ref(false)
const viewMode = ref<'grid' | 'list' | 'icon'>('grid')
const bookshelfShowAddEntry = ref(true)

// Home navigation preferences are desktop-private WebDAV settings.
const homeNavAutoSwitchEnabled = ref(true)
const homeNavManualMode = ref<HomeManualNavMode>('sidebar')
const homeBottomNavStyle = ref('compact')
const homeNavPortraitMode = ref<HomeNavMode>('bottom')
const homeNavLandscapeMode = ref<HomeNavMode>('sidebar')
const homeSidebarPresentation = ref('fixed')
const homeFixedSidebarStyle = ref('expanded')

// App chrome appearance
const appThemeMode = ref<AppThemeMode>('system')
const appLightStyleVariant = ref<AppLightStyleVariant>('yunbai')
const appDarkStyleVariant = ref<AppDarkStyleVariant>('yemu')
const glassOpacityPercent = ref(80)

// Reader display
const readerAutoNightEnabled = ref(false)
const readerAutoNightCustomPolicy = ref<ReaderAutoNightPolicy>('preserve')

// WebDAV
const webdavUrl = ref('')
const webdavDir = ref('Books')
const webdavUser = ref('')
const webdavPass = ref('')
const webdavSync = ref(false)
const webdavSyncBookshelf = ref(true)
const webdavSyncFiles = ref(true)
const webdavSyncUISettings = ref(true)
const webdavSyncThemes = ref(true)
const webdavSyncBackgrounds = ref(true)
const webdavSyncReadingStats = ref(true)
const webdavLastSync = ref('')
const webdavLastLiteSync = ref('')
const webdavDesktopSettingsDir = ref(DEFAULT_DESKTOP_SETTINGS_DIR)

// Reading stats
const readingTimeTrackingEnabled = ref(false)
const readingTimeStatsHidden = ref(false)
const readingStatsDeviceId = ref('')

// Custom themes
interface CustomTheme {
  id: number; name: string; bgImage: string; coverColor: string; fontColor: string
  fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number
  fontWeight: number; marginX: number; marginY: number; pageMode: string; doublePageStep: number
}
const customThemes = ref<CustomTheme[]>([])

// System fonts
const systemFonts = ref<string[]>([])

const normalizeFlipMode = (value: string | undefined): FlipMode => {
  if (value === 'cover' || value === 'slide' || value === 'simulation' || value === 'scroll' || value === 'none') {
    return value
  }
  if (value === 'curl' || value === 'flip') return 'simulation'
  if (value === 'fade') return 'scroll'
  return 'slide'
}

function resetSettingsState() {
  fontSize.value = 20
  lineHeight.value = 1.8
  letterSpacing.value = 0
  fontWeight.value = 400
  marginX.value = 60
  marginY.value = 40
  fontFamily.value = 'system-ui'
  fontColor.value = '#e2e8f0'
  coverColor.value = '#0f172a'
  bgImage.value = ''
  blurAmount.value = 0
  textAlign.value = 'left'
  alignBottom.value = false
  pageMode.value = 'single'
  doublePageStep.value = 2
  flipMode.value = 'slide'
  flipSpeed.value = 'medium'
  pIndent.value = 2
  pSpacing.value = 0.8

  hudTopLeft.value = 'none'
  hudTopCenter.value = 'none'
  hudTopRight.value = 'none'
  hudBottomLeft.value = 'titleOrChapter'
  hudBottomCenter.value = 'none'
  hudBottomRight.value = 'pageAndProgress'
  chapterTitleDisplay.value = 'left'

  autoPageSpeed.value = 10
  ttsEngine.value = 'edge'
  ttsVoice.value = ''
  ttsRate.value = 1.0
  highlightColor.value = '#3b82f6'
  ttsMiMoApiKey.value = ''
  ttsMiMoVoice.value = MIMO_TTS_DEFAULT_VOICE

  nextKeys.value = [...DEFAULT_NEXT_KEYS]
  prevKeys.value = [...DEFAULT_PREV_KEYS]
  showKeyHints.value = true
  isAlwaysOnTop.value = false
  autoOpenLastRead.value = false
  silentUpdate.value = false
  sliderMode.value = 'book'
  sidebarCollapsed.value = false
  viewMode.value = 'grid'
  bookshelfShowAddEntry.value = true
  homeNavAutoSwitchEnabled.value = true
  homeNavManualMode.value = 'sidebar'
  homeBottomNavStyle.value = 'compact'
  homeNavPortraitMode.value = 'bottom'
  homeNavLandscapeMode.value = 'sidebar'
  homeSidebarPresentation.value = 'fixed'
  homeFixedSidebarStyle.value = 'expanded'
  appThemeMode.value = 'system'
  appLightStyleVariant.value = 'yunbai'
  appDarkStyleVariant.value = 'yemu'
  glassOpacityPercent.value = 80
  readerAutoNightEnabled.value = false
  readerAutoNightCustomPolicy.value = 'preserve'

  webdavUrl.value = ''
  webdavDir.value = 'Books'
  webdavUser.value = ''
  webdavPass.value = ''
  webdavSync.value = false
  webdavSyncBookshelf.value = true
  webdavSyncFiles.value = true
  webdavSyncUISettings.value = true
  webdavSyncThemes.value = true
  webdavSyncBackgrounds.value = true
  webdavSyncReadingStats.value = true
  webdavLastSync.value = ''
  webdavLastLiteSync.value = ''
  webdavDesktopSettingsDir.value = DEFAULT_DESKTOP_SETTINGS_DIR

  readingTimeTrackingEnabled.value = false
  readingTimeStatsHidden.value = false
  readingStatsDeviceId.value = ''

  customThemes.value = []
}

// ---- Reader styling refs (shared across views) ----
export function useSettings() {
  const loadAllSettings = async () => {
    try {
      resetSettingsState()
      const dataStore = useDataStore()
      if (!dataStore.dataLoaded.value) await dataStore.loadAllData()
      const s = dataStore.settingsMap.value

      // Load settings from settings map (v8 JSON format)
      const v = (key: string): string | undefined => s[key]
      if (v('reader_fontSize') !== undefined) fontSize.value = parseInt(v('reader_fontSize')!) || 20
      if (v('reader_lineHeight') !== undefined) lineHeight.value = parseFloat(v('reader_lineHeight')!) || 1.8
      if (v('reader_letterSpacing') !== undefined) letterSpacing.value = parseFloat(v('reader_letterSpacing')!) || 0
      if (v('reader_fontWeight') !== undefined) fontWeight.value = parseInt(v('reader_fontWeight')!) || 400
      if (v('reader_marginX') !== undefined) marginX.value = parseInt(v('reader_marginX')!) || 60
      if (v('reader_marginY') !== undefined) marginY.value = parseInt(v('reader_marginY')!) || 40
      if (v('reader_fontFamily') !== undefined) fontFamily.value = v('reader_fontFamily')! || 'system-ui'
      if (v('reader_fontColor') !== undefined) fontColor.value = v('reader_fontColor')! || '#e2e8f0'
      if (v('reader_coverColor') !== undefined) coverColor.value = v('reader_coverColor')! || '#0f172a'
      if (v('bgImage') !== undefined) bgImage.value = v('bgImage')! || ''
      if (v('reader_flipMode') !== undefined) {
        flipMode.value = normalizeFlipMode(v('reader_flipMode'))
      }
      if (v('reader_flipSpeed') !== undefined) flipSpeed.value = v('reader_flipSpeed')! as any || 'medium'
      if (v('reader_autoPageSpeed') !== undefined) autoPageSpeed.value = parseInt(v('reader_autoPageSpeed')!) || 10
      if (v('reader_ttsEngine') !== undefined) ttsEngine.value = v('reader_ttsEngine')! as any || 'edge'
      if (v('reader_ttsVoice') !== undefined) ttsVoice.value = v('reader_ttsVoice')! || ''
      if (v('reader_ttsRate') !== undefined) ttsRate.value = parseFloat(v('reader_ttsRate')!) || 1.0
      if (v('reader_highlightColor') !== undefined) highlightColor.value = v('reader_highlightColor')! || '#3b82f6'
      if (v('reader_ttsMiMoApiKey') !== undefined) ttsMiMoApiKey.value = v('reader_ttsMiMoApiKey')! || ''
      if (v('reader_ttsMiMoVoice') !== undefined) {
        const mv = v('reader_ttsMiMoVoice')!
        ttsMiMoVoice.value = isMimoTtsVoiceId(mv) ? mv : MIMO_TTS_DEFAULT_VOICE
      }
      if (v('reader_pageMode') !== undefined) pageMode.value = (v('reader_pageMode')! === 'double' ? 'double' : 'single')
      if (v('reader_double_page_enabled') !== undefined) pageMode.value = (v('reader_double_page_enabled')! === 'true' ? 'double' : 'single')
      if (v('reader_doublePageStep') !== undefined) doublePageStep.value = (parseInt(v('reader_doublePageStep')!) === 1 ? 1 : 2)
      if (v('reader_auto_night_enabled') !== undefined) readerAutoNightEnabled.value = v('reader_auto_night_enabled')! === 'true'
      if (v('reader_auto_night_custom_policy') !== undefined) {
        readerAutoNightCustomPolicy.value = v('reader_auto_night_custom_policy')! === 'override' ? 'override' : 'preserve'
      }
      if (v('hideKeyHints') !== undefined) showKeyHints.value = (v('hideKeyHints')! !== 'true')
      if (v('reader_alwaysOnTop') !== undefined) {
        isAlwaysOnTop.value = (v('reader_alwaysOnTop')! === 'true')
        window.electronAPI.win.setAlwaysOnTop(isAlwaysOnTop.value)
      }
      if (v('reader_nextKeys') !== undefined) { try { nextKeys.value = JSON.parse(v('reader_nextKeys')!) } catch (_) {} }
      if (v('reader_prevKeys') !== undefined) { try { prevKeys.value = JSON.parse(v('reader_prevKeys')!) } catch (_) {} }
      if (v('reader_blurAmount') !== undefined) blurAmount.value = parseInt(v('reader_blurAmount')!) || 0
      if (v('reader_textAlign') !== undefined) textAlign.value = v('reader_textAlign')! === 'justify' ? 'justify' : 'left'
      if (v('reader_alignBottom') !== undefined) alignBottom.value = v('reader_alignBottom')! === 'true'
      if (v('webdavUrl') !== undefined) webdavUrl.value = v('webdavUrl')!
      if (v('webdavDir') !== undefined) webdavDir.value = v('webdavDir')!
      if (v('webdavUser') !== undefined) webdavUser.value = v('webdavUser')!
      if (v('webdavPass') !== undefined) webdavPass.value = v('webdavPass')!
      if (v('webdavSync') !== undefined) webdavSync.value = v('webdavSync')! === 'true'
      if (v('webdavSyncBookshelf') !== undefined) webdavSyncBookshelf.value = v('webdavSyncBookshelf')! !== 'false'
      if (v('webdavSyncFiles') !== undefined) webdavSyncFiles.value = v('webdavSyncFiles')! !== 'false'
      if (v('webdavSyncUISettings') !== undefined) webdavSyncUISettings.value = v('webdavSyncUISettings')! !== 'false'
      if (v('webdavSyncThemes') !== undefined) webdavSyncThemes.value = v('webdavSyncThemes')! !== 'false'
      if (v('webdavSyncBackgrounds') !== undefined) webdavSyncBackgrounds.value = v('webdavSyncBackgrounds')! !== 'false'
      if (v('webdav_sync_reading_stats') !== undefined) webdavSyncReadingStats.value = v('webdav_sync_reading_stats')! !== 'false'
      if (v('webdavLastSync') !== undefined) webdavLastSync.value = v('webdavLastSync')! || ''
      if (v('webdavLastLiteSync') !== undefined) webdavLastLiteSync.value = v('webdavLastLiteSync')! || ''
      if (v('webdavDesktopSettingsDir') !== undefined) webdavDesktopSettingsDir.value = v('webdavDesktopSettingsDir')! || DEFAULT_DESKTOP_SETTINGS_DIR
      if (v('autoOpenLastRead') !== undefined) autoOpenLastRead.value = v('autoOpenLastRead')! === 'true'
      if (v('silentUpdate') !== undefined) silentUpdate.value = v('silentUpdate')! === 'true'
      if (v('reader_sliderMode') !== undefined) sliderMode.value = v('reader_sliderMode')! === 'chapter' ? 'chapter' : 'book'
      if (v('hud_tl') !== undefined) hudTopLeft.value = v('hud_tl')!
      if (v('hud_tc') !== undefined) hudTopCenter.value = v('hud_tc')!
      if (v('hud_tr') !== undefined) hudTopRight.value = v('hud_tr')!
      if (v('hud_bl') !== undefined) hudBottomLeft.value = v('hud_bl')!
      if (v('hud_bc') !== undefined) hudBottomCenter.value = v('hud_bc')!
      if (v('hud_br') !== undefined) hudBottomRight.value = v('hud_br')!
      if (v('chapterTitleDisplay') !== undefined) chapterTitleDisplay.value = v('chapterTitleDisplay')! as any || 'left'
      if (v('sidebarCollapsed') !== undefined) sidebarCollapsed.value = v('sidebarCollapsed')! === 'true'
      if (v('viewMode') !== undefined) viewMode.value = v('viewMode')! as any || 'grid'
      if (v('bookshelf_show_add_entry') !== undefined) bookshelfShowAddEntry.value = v('bookshelf_show_add_entry')! !== 'false'
      if (v('home_nav_auto_switch_enabled') !== undefined) homeNavAutoSwitchEnabled.value = v('home_nav_auto_switch_enabled')! !== 'false'
      if (v('home_nav_manual_mode') !== undefined) homeNavManualMode.value = v('home_nav_manual_mode')! === 'bottom' ? 'bottom' : 'sidebar'
      if (v('home_bottom_nav_style') !== undefined) homeBottomNavStyle.value = v('home_bottom_nav_style')! || 'compact'
      if (v('home_nav_portrait_mode') !== undefined) {
        const nv = v('home_nav_portrait_mode')!
        homeNavPortraitMode.value = nv === 'sidebar' || nv === 'drawer' ? nv : 'bottom'
      }
      if (v('home_nav_landscape_mode') !== undefined) {
        const nv = v('home_nav_landscape_mode')!
        homeNavLandscapeMode.value = nv === 'bottom' || nv === 'drawer' ? nv : 'sidebar'
      }
      if (v('home_sidebar_presentation') !== undefined) homeSidebarPresentation.value = v('home_sidebar_presentation')! || 'fixed'
      if (v('home_fixed_sidebar_style') !== undefined) homeFixedSidebarStyle.value = v('home_fixed_sidebar_style')! || 'expanded'
      if (v('app_theme_mode') !== undefined) {
        const am = v('app_theme_mode')!
        appThemeMode.value = am === 'light' || am === 'dark' ? am : 'system'
      }
      if (v('app_light_style_variant') !== undefined) {
        appLightStyleVariant.value = v('app_light_style_variant')! === 'yaobai' ? 'yaobai' : 'yunbai'
      }
      if (v('app_dark_style_variant') !== undefined) {
        appDarkStyleVariant.value = v('app_dark_style_variant')! === 'jiye' ? 'jiye' : 'yemu'
      }
      if (v('glass_opacity_percent') !== undefined) {
        glassOpacityPercent.value = clampGlassOpacity(parseInt(v('glass_opacity_percent')!) || 80)
      }
      if (v('reader_pIndent') !== undefined) pIndent.value = parseFloat(v('reader_pIndent')!) || 2
      if (v('reader_pSpacing') !== undefined) pSpacing.value = parseFloat(v('reader_pSpacing')!) || 0.8
      if (v('readingTimeTrackingEnabled') !== undefined || v('reading_time_tracking_enabled') !== undefined) readingTimeTrackingEnabled.value = (v('readingTimeTrackingEnabled') || v('reading_time_tracking_enabled')) === 'true'
      if (v('readingTimeStatsHidden') !== undefined) readingTimeStatsHidden.value = v('readingTimeStatsHidden')! === 'true'
      if (v('readingStatsDeviceId') !== undefined || v('reading_stats_device_id') !== undefined) readingStatsDeviceId.value = (v('readingStatsDeviceId') || v('reading_stats_device_id')) || ''

      // Load custom themes from themes.json (v8 format)
      try {
        customThemes.value = dataStore.themes.value.map(t => {
          try { return { id: t.id, name: t.name, ...JSON.parse(t.configJson) } }
          catch { return null }
        }).filter(Boolean) as any[]
      } catch (_) {}
      if (!readingStatsDeviceId.value) {
        readingStatsDeviceId.value = crypto.randomUUID()
        await saveSetting('readingStatsDeviceId', readingStatsDeviceId.value)
        await saveSetting('reading_stats_device_id', readingStatsDeviceId.value)
      }
      if (!webdavDesktopSettingsDir.value) {
        webdavDesktopSettingsDir.value = DEFAULT_DESKTOP_SETTINGS_DIR
        await saveSetting('webdavDesktopSettingsDir', webdavDesktopSettingsDir.value)
      }
      try { systemFonts.value = await window.electronAPI.font.getSystemFonts() } catch (_) { systemFonts.value = [] }
    } catch (e) { console.error(e) }
  }

  const saveAllStyling = () => {
    const { setSettings } = useDataStore()
    setSettings({
      reader_fontSize: String(fontSize.value),
      reader_lineHeight: String(lineHeight.value),
      reader_letterSpacing: String(letterSpacing.value),
      reader_fontWeight: String(fontWeight.value),
      reader_marginX: String(marginX.value),
      reader_marginY: String(marginY.value),
      reader_fontFamily: fontFamily.value,
      reader_fontColor: fontColor.value,
      reader_coverColor: coverColor.value,
      bgImage: bgImage.value,
      reader_flipMode: flipMode.value,
      reader_pageMode: pageMode.value,
      reader_double_page_enabled: pageMode.value === 'double' ? 'true' : 'false',
      reader_double_page_mode: pageMode.value === 'double' ? 'force' : 'auto',
      reader_doublePageStep: String(doublePageStep.value),
      reader_blurAmount: String(blurAmount.value),
      reader_textAlign: textAlign.value,
      reader_alignBottom: alignBottom.value ? 'true' : 'false',
      hud_tl: hudTopLeft.value,
      hud_tc: hudTopCenter.value,
      hud_tr: hudTopRight.value,
      hud_bl: hudBottomLeft.value,
      hud_bc: hudBottomCenter.value,
      hud_br: hudBottomRight.value,
      chapterTitleDisplay: chapterTitleDisplay.value,
      reader_sliderMode: sliderMode.value,
      reader_pIndent: String(pIndent.value),
      reader_pSpacing: String(pSpacing.value),
    })
  }

  const saveTtsSettings = () => {
    const { setSettings } = useDataStore()
    setSettings({
      reader_autoPageSpeed: String(autoPageSpeed.value),
      reader_ttsEngine: ttsEngine.value,
      reader_ttsVoice: ttsVoice.value,
      reader_ttsRate: String(ttsRate.value),
      reader_highlightColor: highlightColor.value,
      reader_ttsMiMoApiKey: ttsMiMoApiKey.value,
      reader_ttsMiMoVoice: ttsMiMoVoice.value,
    })
  }

  return {
    // Styling
    fontSize, lineHeight, letterSpacing, fontWeight, marginX, marginY,
    fontFamily, fontColor, coverColor, bgImage, blurAmount,
    textAlign, alignBottom, pageMode, doublePageStep,
    flipMode, flipSpeed,
    pIndent, pSpacing,
    // Auto-page
    autoPageSpeed,
    // TTS
    ttsEngine, ttsVoice, ttsRate, highlightColor, ttsMiMoApiKey, ttsMiMoVoice,
    // Keys
    nextKeys, prevKeys,
    // UI
    showKeyHints, isAlwaysOnTop,
    autoOpenLastRead, silentUpdate,
    readingTimeTrackingEnabled, readingTimeStatsHidden, readingStatsDeviceId,
    // WebDAV
    webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
    webdavSyncBookshelf, webdavSyncFiles, webdavSyncUISettings,
    webdavSyncThemes, webdavSyncBackgrounds, webdavSyncReadingStats, webdavLastSync, webdavLastLiteSync,
    webdavDesktopSettingsDir,
    // Themes
    customThemes, systemFonts,
    // HUD
    hudTopLeft, hudTopCenter, hudTopRight,
    hudBottomLeft, hudBottomCenter, hudBottomRight,
    chapterTitleDisplay,
    sliderMode, sidebarCollapsed, viewMode, bookshelfShowAddEntry,
    homeNavAutoSwitchEnabled, homeNavManualMode,
    homeBottomNavStyle, homeNavPortraitMode, homeNavLandscapeMode,
    homeSidebarPresentation, homeFixedSidebarStyle,
    appThemeMode, appLightStyleVariant, appDarkStyleVariant, glassOpacityPercent,
    readerAutoNightEnabled, readerAutoNightCustomPolicy,
    // Methods
    loadAllSettings, saveAllStyling, saveTtsSettings, saveSetting
  }
}

export type { }
