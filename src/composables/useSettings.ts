import { ref } from 'vue'

// ---- Persistence helpers ----
export const saveSetting = async (k: string, v: any) => {
  await window.electronAPI.db.query(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [k, String(v)]
  )
}

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

// Navigation keys
const nextKeys = ref<string[]>(['ArrowRight', 'PageDown', ' '])
const prevKeys = ref<string[]>(['ArrowLeft', 'PageUp'])

// UI hints
const showKeyHints = ref(true)

// Always on top
const isAlwaysOnTop = ref(false)

// Auto-open
const autoOpenLastRead = ref(false)
const silentUpdate = ref(false)
const sliderMode = ref<'book' | 'chapter'>('book')

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
const webdavLastSync = ref('')

// Custom themes
interface CustomTheme {
  id: number; name: string; bgImage: string; coverColor: string; fontColor: string
  fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number
  fontWeight: number; marginX: number; marginY: number; pageMode: string; doublePageStep: number
}
const customThemes = ref<CustomTheme[]>([])

// System fonts
const systemFonts = ref<string[]>([])

// ---- Reader styling refs (shared across views) ----
export function useSettings() {
  const loadAllSettings = async () => {
    try {
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
          if (s.key === 'reader_pageMode') pageMode.value = (s.value === 'double' ? 'double' : 'single')
          if (s.key === 'reader_doublePageStep') doublePageStep.value = (parseInt(s.value) === 1 ? 1 : 2)
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
          if (s.key === 'webdavLastSync') webdavLastSync.value = s.value || ''
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
        })
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
    saveSetting('reader_pageMode', pageMode.value)
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
  }

  const saveTtsSettings = () => {
    saveSetting('reader_autoPageSpeed', autoPageSpeed.value)
    saveSetting('reader_ttsEngine', ttsEngine.value)
    saveSetting('reader_ttsVoice', ttsVoice.value)
    saveSetting('reader_ttsRate', ttsRate.value)
    saveSetting('reader_highlightColor', highlightColor.value)
    saveSetting('reader_ttsMiMoApiKey', ttsMiMoApiKey.value)
  }

  return {
    // Styling
    fontSize, lineHeight, letterSpacing, fontWeight, marginX, marginY,
    fontFamily, fontColor, coverColor, bgImage, blurAmount,
    textAlign, alignBottom, pageMode, doublePageStep,
    flipMode, flipSpeed,
    // Auto-page
    autoPageSpeed,
    // TTS
    ttsEngine, ttsVoice, ttsRate, highlightColor, ttsMiMoApiKey,
    // Keys
    nextKeys, prevKeys,
    // UI
    showKeyHints, isAlwaysOnTop,
    autoOpenLastRead, silentUpdate,
    // WebDAV
    webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync,
    webdavSyncBookshelf, webdavSyncFiles, webdavSyncUISettings,
    webdavSyncThemes, webdavSyncBackgrounds, webdavLastSync,
    // Themes
    customThemes, systemFonts,
    // HUD
    hudTopLeft, hudTopCenter, hudTopRight,
    hudBottomLeft, hudBottomCenter, hudBottomRight,
    chapterTitleDisplay,
    sliderMode,
    // Methods
    loadAllSettings, saveAllStyling, saveTtsSettings, saveSetting
  }
}

export type { }
