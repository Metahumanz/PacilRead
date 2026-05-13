import { ref, computed } from 'vue'
import { useSettings } from './useSettings'
import { useDataStore } from './useDataStore'
import darkThemeBg from '../assets/themes/dark.jpg'
import paperThemeBg from '../assets/themes/paper.jpg'
import greenThemeBg from '../assets/themes/green.jpg'

export function useTheme(opts?: { onStyleChanged?: () => void }) {
  const settings = useSettings()
  const {
    bgImage, coverColor, fontColor, fontFamily, fontSize, lineHeight,
    letterSpacing, fontWeight, marginX, marginTop, marginBottom, marginY, pageMode, doublePageStep,
    customThemes
  } = settings

  const newThemeName = ref('')

  const applyThemeConfig = (t: any) => {
    if (t.bgImage !== undefined) bgImage.value = t.bgImage
    if (t.coverColor !== undefined) coverColor.value = t.coverColor
    if (t.fontColor !== undefined) fontColor.value = t.fontColor
    if (t.fontFamily !== undefined) fontFamily.value = t.fontFamily
    if (t.fontSize !== undefined) fontSize.value = t.fontSize
    if (t.lineHeight !== undefined) lineHeight.value = t.lineHeight
    if (t.letterSpacing !== undefined) letterSpacing.value = t.letterSpacing
    if (t.fontWeight !== undefined) fontWeight.value = t.fontWeight
    if (t.marginX !== undefined) marginX.value = t.marginX
    if (t.marginTop !== undefined) marginTop.value = t.marginTop
    if (t.marginBottom !== undefined) marginBottom.value = t.marginBottom
    if (t.marginTop === undefined && t.marginBottom === undefined && t.marginY !== undefined) marginY.value = t.marginY
    if (t.pageMode !== undefined) pageMode.value = t.pageMode as 'single' | 'double'
    if (t.doublePageStep !== undefined) doublePageStep.value = t.doublePageStep as 1 | 2

    if (opts?.onStyleChanged) opts.onStyleChanged()
  }

  const applyTheme = (type: string) => {
    if (type === 'dark') { applyThemeConfig({ bgImage: darkThemeBg, coverColor: '#0f172a', fontColor: '#e2e8f0' }) }
    else if (type === 'paper') { applyThemeConfig({ bgImage: paperThemeBg, coverColor: '#f4ecd8', fontColor: '#5c4b37' }) }
    else if (type === 'green') { applyThemeConfig({ bgImage: greenThemeBg, coverColor: '#cce8cf', fontColor: '#2a4b2a' }) }
  }

  const saveTheme = async () => {
    if (!newThemeName.value.trim()) return
    const { addTheme } = useDataStore()
    const config = {
      bgImage: bgImage.value, coverColor: coverColor.value,
      fontColor: fontColor.value, fontFamily: fontFamily.value, fontSize: fontSize.value,
      lineHeight: lineHeight.value, letterSpacing: letterSpacing.value,
      fontWeight: fontWeight.value, marginX: marginX.value,
      marginTop: marginTop.value, marginBottom: marginBottom.value, marginY: marginY.value,
      pageMode: pageMode.value, doublePageStep: doublePageStep.value
    }
    const theme = await addTheme({
      name: newThemeName.value.trim(),
      configJson: JSON.stringify(config),
    })
    customThemes.value.push({ id: theme.id, name: theme.name, ...config })
    newThemeName.value = ''
  }

  const deleteTheme = async (id: number) => {
    const { deleteTheme: delTheme } = useDataStore()
    await delTheme(id)
    customThemes.value = customThemes.value.filter(t => t.id !== id)
  }

  const readerBgStyle = computed(() => {
    if (!bgImage.value) return {}
    return { backgroundImage: `url('${bgImage.value}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
  })

  return {
    newThemeName,
    applyThemeConfig, applyTheme, saveTheme, deleteTheme,
    readerBgStyle,
  }
}
