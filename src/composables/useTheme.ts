import { ref, computed, type Ref } from 'vue'
import { saveSetting } from './useSettings'
import darkThemeBg from '../assets/themes/dark.jpg'
import paperThemeBg from '../assets/themes/paper.jpg'
import greenThemeBg from '../assets/themes/green.jpg'

interface CustomTheme {
  id: number; name: string; bgImage: string; coverColor: string; fontColor: string
  fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number
  fontWeight: number; marginX: number; marginY: number; pageMode: string; doublePageStep: number
}

export function useTheme(opts: {
  bgImage: Ref<string>
  coverColor: Ref<string>
  fontColor: Ref<string>
  fontFamily: Ref<string>
  fontSize: Ref<number>
  lineHeight: Ref<number>
  letterSpacing: Ref<number>
  fontWeight: Ref<number>
  marginX: Ref<number>
  marginY: Ref<number>
  pageMode: Ref<'single' | 'double'>
  doublePageStep: Ref<1 | 2>
  customThemes: Ref<CustomTheme[]>
  blurAmount: Ref<number>
  onStyleChanged: () => void
}) {
  const newThemeName = ref('')

  const applyThemeConfig = (t: Partial<CustomTheme>) => {
    if (t.bgImage !== undefined) opts.bgImage.value = t.bgImage
    if (t.coverColor !== undefined) opts.coverColor.value = t.coverColor
    if (t.fontColor !== undefined) opts.fontColor.value = t.fontColor
    if (t.fontFamily !== undefined) opts.fontFamily.value = t.fontFamily
    if (t.fontSize !== undefined) opts.fontSize.value = t.fontSize
    if (t.lineHeight !== undefined) opts.lineHeight.value = t.lineHeight
    if (t.letterSpacing !== undefined) opts.letterSpacing.value = t.letterSpacing
    if (t.fontWeight !== undefined) opts.fontWeight.value = t.fontWeight
    if (t.marginX !== undefined) opts.marginX.value = t.marginX
    if (t.marginY !== undefined) opts.marginY.value = t.marginY
    if (t.pageMode !== undefined) opts.pageMode.value = t.pageMode as 'single' | 'double'
    if (t.doublePageStep !== undefined) opts.doublePageStep.value = t.doublePageStep as 1 | 2
    opts.onStyleChanged()
  }

  const applyTheme = (type: string) => {
    if (type === 'dark') { applyThemeConfig({ bgImage: darkThemeBg, coverColor: '#0f172a', fontColor: '#e2e8f0' }) }
    else if (type === 'paper') { applyThemeConfig({ bgImage: paperThemeBg, coverColor: '#f4ecd8', fontColor: '#5c4b37' }) }
    else if (type === 'green') { applyThemeConfig({ bgImage: greenThemeBg, coverColor: '#cce8cf', fontColor: '#2a4b2a' }) }
  }

  const saveTheme = async () => {
    if (!newThemeName.value.trim()) return
    opts.customThemes.value.push({
      id: Date.now(), name: newThemeName.value.trim(), bgImage: opts.bgImage.value, coverColor: opts.coverColor.value,
      fontColor: opts.fontColor.value, fontFamily: opts.fontFamily.value, fontSize: opts.fontSize.value, lineHeight: opts.lineHeight.value,
      letterSpacing: opts.letterSpacing.value, fontWeight: opts.fontWeight.value, marginX: opts.marginX.value, marginY: opts.marginY.value,
      pageMode: opts.pageMode.value, doublePageStep: opts.doublePageStep.value
    })
    await saveSetting('custom_themes', JSON.stringify(opts.customThemes.value))
    newThemeName.value = ''
  }

  const deleteTheme = async (id: number) => {
    opts.customThemes.value = opts.customThemes.value.filter(t => t.id !== id)
    await saveSetting('custom_themes', JSON.stringify(opts.customThemes.value))
  }

  const readerBgStyle = computed(() => {
    if (!opts.bgImage.value) return {}
    return { backgroundImage: `url('${opts.bgImage.value}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
  })

  // textStyle is computed in ReaderView directly since it also needs textAlign

  return {
    newThemeName,
    applyThemeConfig, applyTheme, saveTheme, deleteTheme,
    readerBgStyle,
  }
}
