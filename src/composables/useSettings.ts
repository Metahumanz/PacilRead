import { ref } from 'vue'
import { MIMO_TTS_DEFAULT_VOICE, isMimoTtsVoiceId } from '../data/mimoTts'

// ---- Persistence helpers ----
export const saveSetting = async (k: string, v: any) => {
  await window.electronAPI.db.query(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [k, String(v)]
  )
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
const flipMode = ref<'slide' | 'cover' | 'curl'>('slide')
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
      const r = await window.electronAPI.db.query('SELECT * FROM settings')
      if (Array.isArray(r)) {
        r.forEach((s: any) => {
          if (s.key === 'reader_fontSize') fontSize.value = parseInt(s.value) || 20
          if (s.key === 'reader_lineHeight') lineHeight.value = parseFloat(s.value) || 1.8
          if (s.key === 'reader_letterSpacing') letterSpacing.value = parseFloat(s.value) || 0
          if (s.key === 'reader_fontWeight') fontWeight.value = parseInt(s.value) || 400
          if (s.key === 'reader_marginX') marginX.value = parseInt(s.value) || 60
          if (s.key === 'reader_marginY') marginY.value = parseInt(s.value) || 40
          if (s.key === 'reader_fontFamily') fontFamily.value = s.value || 'system-ui'
          if (s.key === 'reader_fontColor') fontColor.value = s.value || '#e2e8f0'
          if (s.key === 'reader_coverColor') coverColor.value = s.value || '#0f172a'
          if (s.key === 'bgImage') bgImage.value = s.value || ''
          if (s.key === 'reader_flipMode') {
            if (s.value === 'curl') flipMode.value = 'curl'
            else if (s.value === 'cover') flipMode.value = 'cover'
            else flipMode.value = 'slide'
          }
          if (s.key === 'reader_flipSpeed') flipSpeed.value = s.value as any || 'medium'
          if (s.key === 'reader_autoPageSpeed') autoPageSpeed.value = parseInt(s.value) || 10
          if (s.key === 'reader_ttsEngine') ttsEngine.value = s.value as any || 'edge'
          if (s.key === 'reader_ttsVoice') ttsVoice.value = s.value || ''
          if (s.key === 'reader_ttsRate') ttsRate.value = parseFloat(s.value) || 1.0
          if (s.key === 'reader_highlightColor') highlightColor.value = s.value || '#3b82f6'
          if (s.key === 'reader_ttsMiMoApiKey') ttsMiMoApiKey.value = s.value || ''
          if (s.key === 'reader_ttsMiMoVoice') {
            ttsMiMoVoice.value = isMimoTtsVoiceId(s.value) ? s.value : MIMO_TTS_DEFAULT_VOICE
          }
          if (s.key === 'reader_pageMode') pageMode.value = (s.value === 'double' ? 'double' : 'single')
          if (s.key === 'reader_double_page_enabled') pageMode.value = (s.value === 'true' ? 'double' : 'single')
          if (s.key === 'reader_doublePageStep') doublePageStep.value = (parseInt(s.value) === 1 ? 1 : 2)
          if (s.key === 'reader_auto_night_enabled') readerAutoNightEnabled.value = s.value === 'true'
          if (s.key === 'reader_auto_night_custom_policy') {
            readerAutoNightCustomPolicy.value = s.value === 'override' ? 'override' : 'preserve'
          }
          if (s.key === 'hideKeyHints') showKeyHints.value = (s.value !== 'true')
          if (s.key === 'reader_alwaysOnTop') {
            isAlwaysOnTop.value = (s.value === 'true')
            window.electronAPI.win.setAlwaysOnTop(isAlwaysOnTop.value)
          }
          if (s.key === 'reader_nextKeys') { try { nextKeys.value = JSON.parse(s.value) } catch (_) {} }
          if (s.key === 'reader_prevKeys') { try { prevKeys.value = JSON.parse(s.value) } catch (_) {} }
          if (s.key === 'reader_blurAmount') blurAmount.value = parseInt(s.value) || 0
          if (s.key === 'reader_textAlign') textAlign.value = s.value === 'justify' ? 'justify' : 'left'
          if (s.key === 'reader_alignBottom') alignBottom.value = s.value === 'true'
          if (s.key === 'webdavUrl') webdavUrl.value = s.value
          if (s.key === 'webdavDir') webdavDir.value = s.value
          if (s.key === 'webdavUser') webdavUser.value = s.value
          if (s.key === 'webdavPass') webdavPass.value = s.value
          if (s.key === 'webdavSync') webdavSync.value = s.value === 'true'
          if (s.key === 'webdavSyncBookshelf') webdavSyncBookshelf.value = s.value !== 'false'
          if (s.key === 'webdavSyncFiles') webdavSyncFiles.value = s.value !== 'false'
          if (s.key === 'webdavSyncUISettings') webdavSyncUISettings.value = s.value !== 'false'
          if (s.key === 'webdavSyncThemes') webdavSyncThemes.value = s.value !== 'false'
          if (s.key === 'webdavSyncBackgrounds') webdavSyncBackgrounds.value = s.value !== 'false'
          if (s.key === 'webdav_sync_reading_stats') webdavSyncReadingStats.value = s.value !== 'false'
          if (s.key === 'webdavLastSync') webdavLastSync.value = s.value || ''
          if (s.key === 'webdavLastLiteSync') webdavLastLiteSync.value = s.value || ''
          if (s.key === 'webdavDesktopSettingsDir') webdavDesktopSettingsDir.value = s.value || DEFAULT_DESKTOP_SETTINGS_DIR
          if (s.key === 'autoOpenLastRead') autoOpenLastRead.value = s.value === 'true'
          if (s.key === 'silentUpdate') silentUpdate.value = s.value === 'true'
          if (s.key === 'reader_sliderMode') sliderMode.value = s.value === 'chapter' ? 'chapter' : 'book'
          if (s.key === 'custom_themes') {
            try { customThemes.value = JSON.parse(s.value) || [] } catch (_) {}
          }
          if (s.key === 'hud_tl') hudTopLeft.value = s.value
          if (s.key === 'hud_tc') hudTopCenter.value = s.value
          if (s.key === 'hud_tr') hudTopRight.value = s.value
          if (s.key === 'hud_bl') hudBottomLeft.value = s.value
          if (s.key === 'hud_bc') hudBottomCenter.value = s.value
          if (s.key === 'hud_br') hudBottomRight.value = s.value
          if (s.key === 'chapterTitleDisplay') chapterTitleDisplay.value = s.value as any || 'left'
          if (s.key === 'sidebarCollapsed') sidebarCollapsed.value = s.value === 'true'
          if (s.key === 'viewMode') viewMode.value = s.value as any || 'grid'
          if (s.key === 'bookshelf_show_add_entry') bookshelfShowAddEntry.value = s.value !== 'false'
          if (s.key === 'home_nav_auto_switch_enabled') homeNavAutoSwitchEnabled.value = s.value !== 'false'
          if (s.key === 'home_nav_manual_mode') homeNavManualMode.value = s.value === 'bottom' ? 'bottom' : 'sidebar'
          if (s.key === 'home_bottom_nav_style') homeBottomNavStyle.value = s.value || 'compact'
          if (s.key === 'home_nav_portrait_mode') {
            homeNavPortraitMode.value = s.value === 'sidebar' || s.value === 'drawer' ? s.value : 'bottom'
          }
          if (s.key === 'home_nav_landscape_mode') {
            homeNavLandscapeMode.value = s.value === 'bottom' || s.value === 'drawer' ? s.value : 'sidebar'
          }
          if (s.key === 'home_sidebar_presentation') homeSidebarPresentation.value = s.value || 'fixed'
          if (s.key === 'home_fixed_sidebar_style') homeFixedSidebarStyle.value = s.value || 'expanded'
          if (s.key === 'app_theme_mode') {
            appThemeMode.value = s.value === 'light' || s.value === 'dark' ? s.value : 'system'
          }
          if (s.key === 'app_light_style_variant') {
            appLightStyleVariant.value = s.value === 'yaobai' ? 'yaobai' : 'yunbai'
          }
          if (s.key === 'app_dark_style_variant') {
            appDarkStyleVariant.value = s.value === 'jiye' ? 'jiye' : 'yemu'
          }
          if (s.key === 'glass_opacity_percent') {
            glassOpacityPercent.value = clampGlassOpacity(parseInt(s.value) || 80)
          }
          if (s.key === 'reader_pIndent') pIndent.value = parseFloat(s.value) || 2
          if (s.key === 'reader_pSpacing') pSpacing.value = parseFloat(s.value) || 0.8
          if (s.key === 'readingTimeTrackingEnabled' || s.key === 'reading_time_tracking_enabled') readingTimeTrackingEnabled.value = s.value === 'true'
          if (s.key === 'readingTimeStatsHidden') readingTimeStatsHidden.value = s.value === 'true'
          if (s.key === 'readingStatsDeviceId' || s.key === 'reading_stats_device_id') readingStatsDeviceId.value = s.value || ''
        })
      }
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
    saveSetting('reader_fontSize', fontSize.value)
    saveSetting('reader_lineHeight', lineHeight.value)
    saveSetting('reader_letterSpacing', letterSpacing.value)
    saveSetting('reader_fontWeight', fontWeight.value)
    saveSetting('reader_marginX', marginX.value)
    saveSetting('reader_marginY', marginY.value)
    saveSetting('reader_fontFamily', fontFamily.value)
    saveSetting('reader_fontColor', fontColor.value)
    saveSetting('reader_coverColor', coverColor.value)
    saveSetting('bgImage', bgImage.value)
    saveSetting('reader_flipMode', flipMode.value)
    saveSetting('reader_pageMode', pageMode.value)
    saveSetting('reader_double_page_enabled', pageMode.value === 'double' ? 'true' : 'false')
    saveSetting('reader_double_page_mode', pageMode.value === 'double' ? 'force' : 'auto')
    saveSetting('reader_doublePageStep', doublePageStep.value)
    saveSetting('reader_blurAmount', blurAmount.value)
    saveSetting('reader_textAlign', textAlign.value)
    saveSetting('reader_alignBottom', alignBottom.value ? 'true' : 'false')
    saveSetting('hud_tl', hudTopLeft.value)
    saveSetting('hud_tc', hudTopCenter.value)
    saveSetting('hud_tr', hudTopRight.value)
    saveSetting('hud_bl', hudBottomLeft.value)
    saveSetting('hud_bc', hudBottomCenter.value)
    saveSetting('hud_br', hudBottomRight.value)
    saveSetting('chapterTitleDisplay', chapterTitleDisplay.value)
    saveSetting('reader_sliderMode', sliderMode.value)
    saveSetting('reader_pIndent', pIndent.value)
    saveSetting('reader_pSpacing', pSpacing.value)
  }

  const saveTtsSettings = () => {
    saveSetting('reader_autoPageSpeed', autoPageSpeed.value)
    saveSetting('reader_ttsEngine', ttsEngine.value)
    saveSetting('reader_ttsVoice', ttsVoice.value)
    saveSetting('reader_ttsRate', ttsRate.value)
    saveSetting('reader_highlightColor', highlightColor.value)
    saveSetting('reader_ttsMiMoApiKey', ttsMiMoApiKey.value)
    saveSetting('reader_ttsMiMoVoice', ttsMiMoVoice.value)
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
