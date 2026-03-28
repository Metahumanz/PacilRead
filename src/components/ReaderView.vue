<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted, nextTick } from 'vue'
import darkThemeBg from '../assets/themes/dark.jpg'
import paperThemeBg from '../assets/themes/paper.jpg'
import greenThemeBg from '../assets/themes/green.jpg'

interface Chapter { id: number; title: string; body: string; order_index: number }
interface Book { id: number; title: string; author: string | null; path: string; progress_index: number; progress_offset: number; last_read?: string }
interface ReplacementRule { id: number; pattern: string; replacement: string; scope: string; book_id: number | null; is_regex: number; active: number }
interface SearchResult { chapterIndex: number; chapterTitle: string; snippet: string }

const props = defineProps<{ bookId: number }>()
const emit = defineEmits<{
  (e: 'toggle-immersive', isFull: boolean): void
  (e: 'go-back'): void
}>()

const book = ref<Book | null>(null)
const chapters = ref<Chapter[]>([])
const currentChapterIndex = ref(0)
const loading = ref(true)
const showMenu = ref(false)
const showStyling = ref(false)
const showToc = ref(false)
const showSearch = ref(false)
const showRules = ref(false)
const showAutoPage = ref(false)
const showTts = ref(false)
const autoPageActive = ref(false)
const ttsActive = ref(false)

const isImmersive = ref(false)
const bgImage = ref('')
const blurAmount = ref(0)
const isAlwaysOnTop = ref(false)

const toggleAlwaysOnTop = () => {
  isAlwaysOnTop.value = !isAlwaysOnTop.value
  window.electronAPI.win.setAlwaysOnTop(isAlwaysOnTop.value)
  saveSetting('reader_alwaysOnTop', isAlwaysOnTop.value ? 'true' : 'false')
}

// Styling
const fontSize = ref(20)
const lineHeight = ref(1.8)
const letterSpacing = ref(0)
const fontWeight = ref(400)
const marginX = ref(60)
const marginY = ref(40)
const fontFamily = ref('system-ui')
const fontColor = ref('#e2e8f0')
const coverColor = ref('#0f172a')
const systemFonts = ref<string[]>([])

// Flip mode: 'slide', 'cover', or 'curl'
const flipMode = ref<'slide' | 'cover' | 'curl'>('slide')
const flipSpeed = ref<'fast' | 'medium' | 'slow'>('medium')

// Auto Page Settings
const autoPageSpeed = ref(10) // seconds per page

// TTS Settings
const ttsEngine = ref<'system' | 'edge'>('edge')
const ttsVoice = ref('')
const ttsRate = ref(1.0)
const highlightColor = ref('#3b82f6')
const edgeVoices = ref<any[]>([])
const systemVoices = ref<SpeechSynthesisVoice[]>([])

// Pagination
const currentPage = ref(0)
const totalPages = ref(1)
const pendingWebdavPos = ref(-1)
const pageMode = ref<'single' | 'double'>('single')
const doublePageStep = ref<1 | 2>(2)
const contentRef = ref<HTMLElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(0)

// Three-container carousel
const prevContentRef = ref<HTMLElement | null>(null)
const prevContainerRef = ref<HTMLElement | null>(null)
const carouselSliding = ref(false)
const carouselPos = ref(0)
const prevPageCount = ref(1)
const tocListRef = ref<HTMLElement | null>(null)
const suppressAnim = ref(false) // suppress translateX transition during chapter switch


let flipLock = false
let lastFlipTime = 0

// Search
const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)

// Replacement rules
const rules = ref<ReplacementRule[]>([])
const newPattern = ref('')
const newReplacement = ref('')
const newScope = ref<'book' | 'global'>('book')
const newIsRegex = ref(false)

// ---- Data ----
const fetchBook = async () => {
  try {
    const r = await window.electronAPI.db.query('SELECT * FROM books WHERE id = ?', [props.bookId])
    if (Array.isArray(r) && r.length > 0) {
      book.value = r[0] as Book
      currentChapterIndex.value = book.value.progress_index || 0
      currentPage.value = book.value.progress_offset || 0
    }
  } catch (e) { console.error(e) }
}
const fetchChapters = async () => {
  try {
    const r = await window.electronAPI.db.query('SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index', [props.bookId])
    chapters.value = r as Chapter[]
  } catch (e) { console.error(e) }
}
// Themes & Settings
interface CustomTheme {
  id: number; name: string; bgImage: string; coverColor: string; fontColor: string; 
  fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number; 
  fontWeight: number; marginX: number; marginY: number; pageMode: string; doublePageStep: number
}
const customThemes = ref<CustomTheme[]>([])
const newThemeName = ref('')
const showKeyHints = ref(true)

const nextKeys = ref<string[]>(['ArrowRight', 'PageDown', ' '])
const prevKeys = ref<string[]>(['ArrowLeft', 'PageUp'])
const showingCover = ref(false)
const sweepDir = ref('left')
const snapshotHtml = ref('')

const textAlign = ref('left')
const alignBottom = ref(false)
const showCopyModal = ref(false)
const selectedText = ref('')

const webdavUrl = ref('')
const webdavDir = ref('Books')
const webdavUser = ref('')
const webdavPass = ref('')
const webdavSync = ref(false)

const closeKeyHints = () => { showKeyHints.value = false }
const disableKeyHints = () => { showKeyHints.value = false; saveSetting('hideKeyHints', 'true') }

const loadSettings = async () => {
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
        if (s.key === 'custom_themes') {
          try { customThemes.value = JSON.parse(s.value) || [] } catch (_) {}
        }
      })
    }
    try { systemFonts.value = await window.electronAPI.font.getSystemFonts() } catch (_) { systemFonts.value = [] }
  } catch (e) { console.error(e) }
}

const saveSetting = async (k: string, v: any) => {
  await window.electronAPI.db.query('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, String(v)])
}
const updateStyling = () => {
  saveSetting('reader_fontSize', fontSize.value); saveSetting('reader_lineHeight', lineHeight.value)
  saveSetting('reader_letterSpacing', letterSpacing.value); saveSetting('reader_fontWeight', fontWeight.value)
  saveSetting('reader_marginX', marginX.value); saveSetting('reader_marginY', marginY.value)
  saveSetting('reader_fontFamily', fontFamily.value); saveSetting('reader_fontColor', fontColor.value)
  saveSetting('reader_coverColor', coverColor.value)
  saveSetting('reader_pageMode', pageMode.value)
  saveSetting('reader_doublePageStep', doublePageStep.value)
  saveSetting('reader_blurAmount', blurAmount.value)
  saveSetting('reader_textAlign', textAlign.value)
  saveSetting('reader_alignBottom', alignBottom.value ? 'true' : 'false')
  recalc()
}
const setFlipMode = (mode: 'slide' | 'cover' | 'curl') => {
  flipMode.value = mode
  saveSetting('reader_flipMode', mode)
}
const setFlipSpeed = (speed: 'fast' | 'medium' | 'slow') => {
  flipSpeed.value = speed
  saveSetting('reader_flipSpeed', speed)
}
const saveTtsSettings = () => {
  saveSetting('reader_autoPageSpeed', autoPageSpeed.value)
  saveSetting('reader_ttsEngine', ttsEngine.value)
  saveSetting('reader_ttsVoice', ttsVoice.value)
  saveSetting('reader_ttsRate', ttsRate.value)
  saveSetting('reader_highlightColor', highlightColor.value)
}

const applyThemeConfig = (t: Partial<CustomTheme>) => {
  if (t.bgImage !== undefined) bgImage.value = t.bgImage
  if (t.coverColor !== undefined) coverColor.value = t.coverColor
  if (t.fontColor !== undefined) fontColor.value = t.fontColor
  if (t.fontFamily !== undefined) fontFamily.value = t.fontFamily
  if (t.fontSize !== undefined) fontSize.value = t.fontSize
  if (t.lineHeight !== undefined) lineHeight.value = t.lineHeight
  if (t.letterSpacing !== undefined) letterSpacing.value = t.letterSpacing
  if (t.fontWeight !== undefined) fontWeight.value = t.fontWeight
  if (t.marginX !== undefined) marginX.value = t.marginX
  if (t.marginY !== undefined) marginY.value = t.marginY
  if (t.pageMode !== undefined) pageMode.value = t.pageMode as 'single' | 'double'
  if (t.doublePageStep !== undefined) doublePageStep.value = t.doublePageStep as 1 | 2
  updateStyling()
}

const applyTheme = (type: string) => {
  if (type === 'dark') { applyThemeConfig({ bgImage: darkThemeBg, coverColor: '#0f172a', fontColor: '#e2e8f0' }) }
  else if (type === 'paper') { applyThemeConfig({ bgImage: paperThemeBg, coverColor: '#f4ecd8', fontColor: '#5c4b37' }) }
  else if (type === 'green') { applyThemeConfig({ bgImage: greenThemeBg, coverColor: '#cce8cf', fontColor: '#2a4b2a' }) }
}

const saveTheme = async () => {
  if (!newThemeName.value.trim()) return
  customThemes.value.push({
    id: Date.now(), name: newThemeName.value.trim(), bgImage: bgImage.value, coverColor: coverColor.value,
    fontColor: fontColor.value, fontFamily: fontFamily.value, fontSize: fontSize.value, lineHeight: lineHeight.value,
    letterSpacing: letterSpacing.value, fontWeight: fontWeight.value, marginX: marginX.value, marginY: marginY.value,
    pageMode: pageMode.value, doublePageStep: doublePageStep.value
  })
  await window.electronAPI.db.query("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_themes', ?)", [JSON.stringify(customThemes.value)])
  newThemeName.value = ''
}
const deleteTheme = async (id: number) => {
  customThemes.value = customThemes.value.filter(t => t.id !== id)
  await window.electronAPI.db.query("INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_themes', ?)", [JSON.stringify(customThemes.value)])
}

// ---- Auto Page ----
let autoPageTimer: number | null = null
const startAutoPage = () => {
  if (autoPageTimer) clearInterval(autoPageTimer)
  autoPageActive.value = true
  // We use setInterval. If flip happens, it has its own logic.
  autoPageTimer = window.setInterval(() => {
    if (showMenu.value) return // pause when menu open
    nextPage()
  }, autoPageSpeed.value * 1000)
}
const stopAutoPage = () => {
  if (autoPageTimer) clearInterval(autoPageTimer)
  autoPageTimer = null
  autoPageActive.value = false
}
const toggleAutoPage = () => {
  if (autoPageActive.value) stopAutoPage()
  else startAutoPage()
}
watch(autoPageSpeed, () => {
  if (autoPageActive.value) startAutoPage()
})

// ---- TTS ----
declare class Highlight { constructor(...ranges: Range[]); }
let isPlayingTts = false
let ttsAudio: HTMLAudioElement | null = null
let ttsGeneration = 0
// Audio prefetch cache: index -> Promise<string> (blob URL)
const ttsPrefetchCache = new Map<number, Promise<string | null>>()

const getSentencesFromNode = (node: Node, sentences: {text:string, range:Range}[]) => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue || ''
    // Split only on major sentence-ending punctuation
    const regex = /[^ \n\t。！？.!?]+[。！？.!?]*/g
    let match
    while ((match = regex.exec(text)) !== null) {
      if (match[0].trim().length > 0) {
        const r = new Range()
        try {
          r.setStart(node, match.index)
          r.setEnd(node, match.index + match[0].length)
          sentences.push({ text: match[0], range: r })
        } catch (_) {}
      }
    }
  } else {
    for (let i = 0; i < node.childNodes.length; i++) {
        if ((node.childNodes[i] as HTMLElement).tagName?.toLowerCase() === 'rt') continue
        getSentencesFromNode(node.childNodes[i], sentences)
    }
  }
}

let activeSentences: {text:string, range:Range}[] = []
let currentSentenceIndex = 0

const clearHighlight = () => {
  if ('highlights' in CSS) {
    // @ts-ignore
    CSS.highlights.delete('tts-highlight')
  }
}

const highlightRange = (r: Range) => {
  if ('highlights' in CSS) {
    const highlight = new Highlight(r)
    // @ts-ignore
    CSS.highlights.set('tts-highlight', highlight)
  }
}

const playSystemTTS = (text: string) => {
  return new Promise<void>((resolve) => {
    if (!window.speechSynthesis) { resolve(); return }
    const u = new SpeechSynthesisUtterance(text)
    if (ttsVoice.value && ttsEngine.value === 'system') {
      const v = systemVoices.value.find(x => x.name === ttsVoice.value)
      if (v) u.voice = v
    }
    u.rate = ttsRate.value
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.speak(u)
  })
}

// Convert IPC buffer response to a Uint8Array regardless of deserialization format
const ipcBufferToUint8Array = (buf: any): Uint8Array | null => {
  if (buf instanceof Uint8Array || buf instanceof ArrayBuffer) {
    return new Uint8Array(buf)
  } else if (buf && typeof buf === 'object') {
    return new Uint8Array(Object.values(buf) as number[])
  }
  return null
}

// Synthesize text and return a blob URL (or null on failure)
const synthesizeToUrl = async (text: string): Promise<string | null> => {
  if (!text.trim()) return null
  try {
    const res = await (window as any).electronAPI.tts.synthesize(text, ttsVoice.value || undefined, ttsRate.value)
    if (res.success && res.audioBuffer) {
      const audioData = ipcBufferToUint8Array(res.audioBuffer)
      if (!audioData || audioData.length === 0) return null
      const blob = new Blob([audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength) as ArrayBuffer], { type: 'audio/mpeg' })
      return URL.createObjectURL(blob)
    }
  } catch (e) {
    console.error('Edge TTS synthesis error', e)
  }
  return null
}

// Start prefetching next N sentences
const prefetchAhead = (fromIndex: number, count: number = 2) => {
  if (ttsEngine.value !== 'edge') return
  for (let i = fromIndex; i < Math.min(fromIndex + count, activeSentences.length); i++) {
    if (!ttsPrefetchCache.has(i)) {
      ttsPrefetchCache.set(i, synthesizeToUrl(activeSentences[i].text))
    }
  }
}

const playEdgeTTS = async (text: string, sentenceIdx: number) => {
  if (!text.trim()) return
  try {
    // Check prefetch cache first 
    let url: string | null = null
    const cached = ttsPrefetchCache.get(sentenceIdx)
    if (cached) {
      url = await cached
      ttsPrefetchCache.delete(sentenceIdx)
    } else {
      url = await synthesizeToUrl(text)
    }
    if (!url) return

    ttsAudio = new Audio(url)
    return new Promise<void>((resolve) => {
      ttsAudio!.onended = () => { URL.revokeObjectURL(url!); ttsAudio = null; resolve() }
      ttsAudio!.onerror = () => { URL.revokeObjectURL(url!); ttsAudio = null; resolve() }
      ttsAudio!.play().catch(() => resolve())
    })
  } catch (e) {
    console.error('Edge TTS ERR', e)
  }
}

const buildSentences = () => {
  activeSentences = []
  currentSentenceIndex = 0
  ttsPrefetchCache.clear()
  if (contentRef.value) getSentencesFromNode(contentRef.value, activeSentences)
  
  if (activeSentences.length > 0) {
    // Fast forward to the visually current page
    for (let i = 0; i < activeSentences.length; i++) {
      const rect = activeSentences[i].range.getBoundingClientRect()
      if (rect.right > 20 && rect.width > 0) {
        currentSentenceIndex = i
        break
      }
    }
  }
}

const playNextSentence = async () => {
  if (!isPlayingTts) return
  if (activeSentences.length === 0 || currentSentenceIndex >= activeSentences.length) {
    slideToNextChapter()
    setTimeout(() => {
      buildSentences()
      playNextSentence()
    }, 1200)
    return
  }

  // Prefetch the next 2 sentences while we play the current one
  prefetchAhead(currentSentenceIndex + 1, 2)

  const item = activeSentences[currentSentenceIndex]
  const rect = item.range.getBoundingClientRect()
  
  // if sentence is outside bounds on the right, flip page
  const w = containerWidth.value || window.innerWidth
  if (rect.left > w - 20) {
    nextPage()
    await new Promise(res => setTimeout(res, 600))
  }
  
  if (!isPlayingTts) return

  highlightRange(item.range)
  
  const myGen = ++ttsGeneration

  if (ttsEngine.value === 'system') {
    await playSystemTTS(item.text)
  } else {
    await playEdgeTTS(item.text, currentSentenceIndex)
  }
  
  if (myGen === ttsGeneration && isPlayingTts) {
    currentSentenceIndex++
    playNextSentence()
  }
}

const startTts = () => {
  if (ttsActive.value) { stopTts(); return }
  saveTtsSettings()
  ttsActive.value = true
  isPlayingTts = true
  buildSentences()
  // Prefetch the first 2 sentences immediately
  prefetchAhead(currentSentenceIndex, 2)
  playNextSentence()
}

const stopTts = () => {
  ttsActive.value = false
  isPlayingTts = false
  if (ttsAudio) { ttsAudio.pause(); ttsAudio = null }
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  clearHighlight()
  // Clean up prefetch cache
  for (const [, p] of ttsPrefetchCache) {
    p.then(url => { if (url) URL.revokeObjectURL(url) })
  }
  ttsPrefetchCache.clear()
}

// Ensure TTS stops if menu is opened or other disruption? No, users might want to change settings while playing.
// Maybe just update CSS Highlight style so custom color applies
const injectHighlightStyles = () => {
  let styleEl = document.getElementById('tts-style') as HTMLStyleElement
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'tts-style'
    document.head.appendChild(styleEl)
  }
  styleEl.innerHTML = `::highlight(tts-highlight) { background-color: ${highlightColor.value}40; color: ${highlightColor.value}; border-radius: 4px; }`
}
watch(highlightColor, injectHighlightStyles)

// ---- Replacement rules ----
const fetchRules = async () => {
  try {
    const r = await window.electronAPI.db.query(
      'SELECT * FROM replacement_rules WHERE (scope = ? AND book_id IS NULL) OR (scope = ? AND book_id = ?) ORDER BY id',
      ['global', 'book', props.bookId]
    )
    rules.value = r as ReplacementRule[]
  } catch (e) { console.error(e) }
}

const addRule = async () => {
  if (!newPattern.value.trim()) return
  try {
    await window.electronAPI.db.query(
      'INSERT INTO replacement_rules (pattern, replacement, scope, book_id, is_regex, active) VALUES (?, ?, ?, ?, ?, 1)',
      [newPattern.value, newReplacement.value, newScope.value, newScope.value === 'book' ? props.bookId : null, newIsRegex.value ? 1 : 0]
    )
    newPattern.value = ''
    newReplacement.value = ''
    newIsRegex.value = false
    await fetchRules()
    recalc()
  } catch (e) { console.error(e) }
}

const deleteRule = async (id: number) => {
  try {
    await window.electronAPI.db.query('DELETE FROM replacement_rules WHERE id = ?', [id])
    await fetchRules()
    recalc()
  } catch (e) { console.error(e) }
}

const toggleRuleActive = async (rule: ReplacementRule) => {
  try {
    await window.electronAPI.db.query('UPDATE replacement_rules SET active = ? WHERE id = ?', [rule.active ? 0 : 1, rule.id])
    await fetchRules()
    recalc()
  } catch (e) { console.error(e) }
}

const applyReplacements = (html: string): string => {
  if (!html) return html
  let result = html
  for (const rule of rules.value) {
    if (!rule.active) continue
    try {
      if (rule.is_regex) {
        const re = new RegExp(rule.pattern, 'g')
        result = result.replace(re, rule.replacement)
      } else {
        // Plain text replacement — escape for safety and replace all
        const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        result = result.replace(new RegExp(escaped, 'g'), rule.replacement)
      }
    } catch (_) { /* skip broken regex */ }
  }
  return result
}

// ---- Search ----
const doSearch = async () => {
  const q = searchQuery.value.trim()
  if (!q) { searchResults.value = []; return }
  searching.value = true
  try {
    const results: SearchResult[] = []
    for (let i = 0; i < chapters.value.length; i++) {
      const ch = chapters.value[i]
      // Strip HTML tags for plain text search
      const plain = ch.body.replace(/<[^>]+>/g, '')
      let startIndex = 0
      while (startIndex < plain.length) {
        const idx = plain.toLowerCase().indexOf(q.toLowerCase(), startIndex)
        if (idx >= 0) {
          const start = Math.max(0, idx - 20)
          const end = Math.min(plain.length, idx + q.length + 40)
          const snippet = (start > 0 ? '...' : '') + plain.substring(start, end) + (end < plain.length ? '...' : '')
          results.push({ chapterIndex: i, chapterTitle: ch.title, snippet })
          startIndex = idx + q.length
        } else {
          break
        }
      }
    }
    searchResults.value = results
  } catch (e) { console.error(e) }
  searching.value = false
}

const jumpToSearchResult = (idx: number) => {
  goToChapter(idx, true)
}

// ---- Pagination ----
const recalc = () => { nextTick(() => { setTimeout(calculatePages, 60) }) }
const calculatePages = () => {
  if (!contentRef.value || !containerRef.value) return
  const cw = containerRef.value.clientWidth
  if (cw <= 0) return
  containerWidth.value = cw
  const pageWidth = pageMode.value === 'double' ? cw / 2 : cw
  totalPages.value = Math.max(1, Math.ceil(contentRef.value.scrollWidth / pageWidth))
  
  if (pendingWebdavPos.value >= 0) {
    const L = currentChapterData.value?.body?.length || 0
    if (L > 0) {
      currentPage.value = Math.floor((pendingWebdavPos.value / L) * totalPages.value)
    } else {
      currentPage.value = 0
    }
    pendingWebdavPos.value = -1
  }

  if (currentPage.value >= totalPages.value) currentPage.value = totalPages.value - 1
  calcPrevPages()
}
const calcPrevPages = () => {
  if (!prevContentRef.value || !prevContainerRef.value) return
  const cw = prevContainerRef.value.clientWidth
  if (cw <= 0) return
  const pageWidth = pageMode.value === 'double' ? cw / 2 : cw
  prevPageCount.value = Math.max(1, Math.ceil(prevContentRef.value.scrollWidth / pageWidth))
}

const pageOffset = computed(() => {
  const cw = containerWidth.value || 0
  const pageWidth = pageMode.value === 'double' ? cw / 2 : cw
  return `-${currentPage.value * pageWidth}px`
})
const prevPageOffset = computed(() => {
  const cw = containerWidth.value || 0
  if (cw <= 0) return '0px'
  const pageWidth = pageMode.value === 'double' ? cw / 2 : cw
  return `-${Math.max(0, prevPageCount.value - 1) * pageWidth}px`
})

let uploadTimer: any = null
const uploadProgressToWebdav = async () => {
  if (!webdavSync.value || !webdavUrl.value || !book.value) return
  if (pendingWebdavPos.value >= 0) return // Skip upload if we're evaluating cloud jump
  
  if (uploadTimer) clearTimeout(uploadTimer)
  uploadTimer = setTimeout(async () => {
    const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
    let author = book.value?.author || '未知'
    if (!author.trim()) author = '未知'
    let safeName = book.value?.title.replace(/[\\/:"*?<>|]/g, '_') || 'Unknown'
    let safeAuthor = author.replace(/[\\/:"*?<>|]/g, '_')
    const filename = `${safeName}_${safeAuthor}.json`
    
    const L = currentChapterData.value?.body?.length || 0
    const charPos = totalPages.value > 0 ? Math.floor(L * (currentPage.value / totalPages.value)) : 0

    const data = {
      author: author,
      durChapterIndex: currentChapterIndex.value,
      durChapterPos: charPos,
      durChapterTime: Date.now(),
      durChapterTitle: currentChapterData.value?.title || '',
      name: book.value?.title || 'Unknown'
    }
    let baseURL = webdavUrl.value
    if (webdavDir.value) baseURL += webdavDir.value
    window.electronAPI.webdav.request({
      url: baseURL + 'bookProgress/' + encodeURIComponent(filename),
      method: 'PUT',
      headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data, null, 2)
    }).catch(e => console.error('WebDAV upload err:', e))
  }, 2000)
}

const saveProgress = async () => {
  if (!book.value) return
  try {
    await window.electronAPI.db.query('UPDATE books SET progress_index = ?, progress_offset = ?, last_read = ? WHERE id = ?',
      [currentChapterIndex.value, currentPage.value, new Date().toISOString(), props.bookId])
    uploadProgressToWebdav()
  } catch (e) { console.error(e) }
}

// Chapter data with replacements applied
const currentChapterData = computed(() => chapters.value[currentChapterIndex.value] || null)
const prevChapterData = computed(() => { const i = currentChapterIndex.value - 1; return i >= 0 ? chapters.value[i] : null })
const nextChapterData = computed(() => { const i = currentChapterIndex.value + 1; return i < chapters.value.length ? chapters.value[i] : null })

const currentBody = computed(() => currentChapterData.value ? applyReplacements(currentChapterData.value.body) : '')
const prevBody = computed(() => prevChapterData.value ? applyReplacements(prevChapterData.value.body) : '')
const nextBody = computed(() => nextChapterData.value ? applyReplacements(nextChapterData.value.body) : '')

// ---- Carousel chapter transition ----
const slideToNextChapter = () => {
  if (flipLock || currentChapterIndex.value >= chapters.value.length - 1) return
  flipLock = true
  suppressAnim.value = true
  
  if (flipMode.value === 'cover' || flipMode.value === 'curl') {
    if (containerRef.value) snapshotHtml.value = containerRef.value.outerHTML
    sweepDir.value = 'left'
    showingCover.value = true
    requestAnimationFrame(() => {
      currentChapterIndex.value++
      currentPage.value = 0
      saveProgress()
    })
    setTimeout(() => {
      nextTick(() => { calculatePages(); suppressAnim.value = false; showingCover.value = false; flipLock = false })
    }, 450)
  } else {
    carouselSliding.value = true
    carouselPos.value = 1
    setTimeout(() => {
      carouselSliding.value = false
      currentChapterIndex.value++
      currentPage.value = 0
      carouselPos.value = 0
      saveProgress()
      nextTick(() => { requestAnimationFrame(() => { calculatePages(); requestAnimationFrame(() => { suppressAnim.value = false; flipLock = false }) }) })
    }, 380)
  }
}

const slideToPrevChapter = () => {
  if (flipLock || currentChapterIndex.value <= 0) return
  flipLock = true
  suppressAnim.value = true

  const setLastPage = () => {
    calculatePages()
    const step = (pageMode.value === 'double' && doublePageStep.value === 2) ? 2 : 1
    currentPage.value = Math.max(0, Math.floor((totalPages.value - 1) / step) * step)
    saveProgress()
  }

  if (flipMode.value === 'cover' || flipMode.value === 'curl') {
    if (containerRef.value) snapshotHtml.value = containerRef.value.outerHTML
    sweepDir.value = 'right'
    showingCover.value = true
    requestAnimationFrame(() => {
      currentChapterIndex.value--
      nextTick(setLastPage)
    })
    setTimeout(() => { suppressAnim.value = false; showingCover.value = false; flipLock = false }, 450)
  } else {
    carouselSliding.value = true
    carouselPos.value = -1
    setTimeout(() => {
      carouselSliding.value = false
      currentChapterIndex.value--
      carouselPos.value = 0
      nextTick(() => { requestAnimationFrame(() => { setLastPage(); requestAnimationFrame(() => { suppressAnim.value = false; flipLock = false }) }) })
    }, 380)
  }
}

const goToChapter = (idx: number, keepMenu = false) => {
  if (idx >= 0 && idx < chapters.value.length && idx !== currentChapterIndex.value) {
    suppressAnim.value = true
    currentChapterIndex.value = idx
    currentPage.value = 0
    saveProgress()
    nextTick(() => { requestAnimationFrame(() => { calculatePages(); requestAnimationFrame(() => { suppressAnim.value = false }) }) })
  }
  if (!keepMenu) closeAll()
}

// ---- Page navigation ----
const doPageFlip = (dir: 'left' | 'right', action: () => void) => {
  if (flipMode.value === 'cover' || flipMode.value === 'curl') {
    if (containerRef.value) snapshotHtml.value = containerRef.value.outerHTML
    sweepDir.value = dir === 'left' ? 'left' : 'right'
    showingCover.value = true
    flipLock = true
    suppressAnim.value = true
    
    // adjust timing based on flipSpeed
    let duration = 450
    if (flipSpeed.value === 'fast') duration = 250
    else if (flipSpeed.value === 'slow') duration = 700

    requestAnimationFrame(() => { action() })
    setTimeout(() => {
      showingCover.value = false
      suppressAnim.value = false
      flipLock = false
    }, duration)
  } else {
    // Slide mode: CSS transition handles it
    action()
  }
}

const nextPage = () => {
  const now = Date.now()
  if (flipLock) {
    if (now - lastFlipTime < 150) return
    flipLock = false
  }
  lastFlipTime = now
  const step = (pageMode.value === 'double' && doublePageStep.value === 2) ? 2 : 1
  if (currentPage.value < totalPages.value - step) {
    doPageFlip('left', () => { currentPage.value += step })
  } else {
    slideToNextChapter()
  }
}

const prevPage = () => {
  const now = Date.now()
  if (flipLock) {
    if (now - lastFlipTime < 150) return
    flipLock = false
  }
  lastFlipTime = now
  const step = (pageMode.value === 'double' && doublePageStep.value === 2) ? 2 : 1
  if (currentPage.value >= step) {
    doPageFlip('right', () => { currentPage.value -= step })
  } else if (currentPage.value > 0) {
    doPageFlip('right', () => { currentPage.value = 0 })
  } else {
    slideToPrevChapter()
  }
}

// ---- Interaction ----
const closeAll = () => { showMenu.value = false; showStyling.value = false; showToc.value = false; showSearch.value = false; showRules.value = false; showAutoPage.value = false; showTts.value = false }

const handleClick = (e: MouseEvent) => {
  const t = e.target as HTMLElement
  if (t.closest('.m-top') || t.closest('.m-bot') || t.closest('.m-info') ||
      t.closest('.sty-p') || t.closest('.toc-p') || t.closest('.search-p') || t.closest('.rules-p') || t.closest('.copy-modal')) return
  if (showMenu.value) { closeAll(); return }
  
  const x = e.clientX, y = e.clientY

  if (ttsActive.value) {
    let found = -1
    for (let i = 0; i < activeSentences.length; i++) {
        const rects = activeSentences[i].range.getClientRects()
        for (let r = 0; r < rects.length; r++) {
            const rect = rects[r]
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                found = i; break;
            }
        }
        if (found >= 0) break
    }
    if (found >= 0) {
        currentSentenceIndex = found
        if (ttsAudio) { ttsAudio.pause(); ttsAudio = null; }
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        playNextSentence()
        return
    }
  }

  const w = window.innerWidth, h = window.innerHeight
  const isCenterCol = x > w / 3 && x < (w / 3) * 2
  const isCenterRow = y > h / 3 && y < (h / 3) * 2

  if (isCenterCol && isCenterRow) {
    showMenu.value = true
  } else if (x < w / 3 || (isCenterCol && y < h / 3)) {
    prevPage()
  } else {
    nextPage()
  }
}

let touchStartX = 0
let touchStartY = 0
const handleTouchStart = (e: TouchEvent) => {
  if (showMenu.value) return
  touchStartX = e.changedTouches[0].screenX
  touchStartY = e.changedTouches[0].screenY
}

const handleTouchEnd = (e: TouchEvent) => {
  if (showMenu.value) return
  const endX = e.changedTouches[0].screenX
  const endY = e.changedTouches[0].screenY
  
  if (Math.abs(endX - touchStartX) > Math.abs(endY - touchStartY) * 1.5) {
    const diff = endX - touchStartX
    if (diff < -50) nextPage()
    else if (diff > 50) prevPage()
  }
}

const handleContextMenu = (e: MouseEvent) => {
  if (showMenu.value) return
  const t = e.target as HTMLElement
  const p = t.closest('p, h2, h3, div.ch-body')
  if (p && p.textContent && p.textContent.trim().length > 0) {
    selectedText.value = p.textContent.trim()
    showCopyModal.value = true
  }
}

const copyToClipboard = () => {
  navigator.clipboard.writeText(selectedText.value)
  showCopyModal.value = false
}

const handleWheel = (e: WheelEvent) => {
  if (showMenu.value) return
  if (Math.abs(e.deltaY) < 10) return
  e.preventDefault()
  if (e.deltaY > 0) nextPage()
  else prevPage()
}

const handleKeydown = (e: KeyboardEvent) => {
  const k = e.key, c = e.code
  // ESC: exit fullscreen or close menu
  if (k === 'Escape') {
    e.stopPropagation()
    e.stopImmediatePropagation()
    if (isImmersive.value) { toggleImmersiveMode(); return }
    if (showMenu.value) { closeAll(); return }
    if (ttsActive.value) { stopTts(); return } // Esc stops TTS too
    if (autoPageActive.value) { stopAutoPage(); return }
    handleGoBack()
    return
  }
  if (showMenu.value) return
  if (nextKeys.value.includes(k) || nextKeys.value.includes(c)) { e.preventDefault(); nextPage() }
  else if (prevKeys.value.includes(k) || prevKeys.value.includes(c)) { e.preventDefault(); prevPage() }
}

const toggleImmersiveMode = () => {
  isImmersive.value = !isImmersive.value
  emit('toggle-immersive', isImmersive.value)
  if (!isImmersive.value) {
    // Delay recalc after exiting fullscreen to ensure DOM layout has settled
    setTimeout(recalc, 400)
    setTimeout(recalc, 800)
  }
}
const handleGoBack = () => { saveProgress(); closeAll(); emit('go-back') }

const progressPercent = computed(() => {
  if (chapters.value.length === 0) return 0
  const cw = 100 / chapters.value.length
  const inC = totalPages.value > 0 ? ((currentPage.value + 1) / totalPages.value) * cw : cw
  return Math.min(100, Math.round(currentChapterIndex.value * cw + inC))
})

const handleProgressSlider = (e: Event) => {
  const p = parseInt((e.target as HTMLInputElement).value)
  goToChapter(Math.min(Math.floor((p / 100) * chapters.value.length), chapters.value.length - 1), true)
}

const readerBgStyle = computed(() => {
  if (!bgImage.value) return {}
  return { backgroundImage: `url('${bgImage.value}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
})

const textStyle = computed(() => ({
  fontFamily: fontFamily.value, fontSize: fontSize.value + 'px',
  lineHeight: String(lineHeight.value), letterSpacing: letterSpacing.value + 'em',
  fontWeight: String(fontWeight.value), color: fontColor.value,
  textAlign: textAlign.value as any,
}))

const carouselTransform = computed(() => `translateX(${-100 + carouselPos.value * -100}vw)`)

const openPanel = (panel: 'toc' | 'styling' | 'search' | 'rules' | 'autopage' | 'tts') => {
  showToc.value = panel === 'toc' ? !showToc.value : false
  showStyling.value = panel === 'styling' ? !showStyling.value : false
  showSearch.value = panel === 'search' ? !showSearch.value : false
  showRules.value = panel === 'rules' ? !showRules.value : false
  showAutoPage.value = panel === 'autopage' ? !showAutoPage.value : false
  showTts.value = panel === 'tts' ? !showTts.value : false
}

watch(showToc, (v) => {
  if (v) nextTick(() => {
    const el = tocListRef.value?.querySelector('.toc-active') as HTMLElement
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
  })
})

watch(currentChapterIndex, () => recalc())
watch([fontSize, lineHeight, letterSpacing, marginX, marginY, fontFamily, fontWeight], () => recalc())

// Save progress periodically
watch(currentPage, () => saveProgress())

const downloadProgressFromWebdav = async () => {
  if (!webdavSync.value || !webdavUrl.value || !book.value) return
  const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
  let author = book.value.author || '未知'
  if (!author.trim()) author = '未知'
  let safeName = book.value.title.replace(/[\\/:"*?<>|]/g, '_')
  let safeAuthor = author.replace(/[\\/:"*?<>|]/g, '_')
  const filename = `${safeName}_${safeAuthor}.json`
  
  let baseURL = webdavUrl.value
  if (webdavDir.value) baseURL += webdavDir.value

  try {
    const res = await window.electronAPI.webdav.request({
      url: baseURL + 'bookProgress/' + encodeURIComponent(filename),
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` }
    })
    if (res.status === 200 && res.data) {
      const remote = JSON.parse(res.data)
      const localTime = book.value.last_read ? new Date(book.value.last_read).getTime() : 0
      const isLocalFresh = currentChapterIndex.value === 0 && currentPage.value === 0
      if (remote.durChapterTime && (remote.durChapterTime > localTime + 5000 || isLocalFresh)) {
        if (remote.durChapterIndex >= 0 && remote.durChapterIndex < chapters.value.length) {
          pendingWebdavPos.value = remote.durChapterPos || 0
          if (remote.durChapterIndex !== currentChapterIndex.value) {
            goToChapter(remote.durChapterIndex, true)
          } else {
            recalc()
          }
        }
      }
    }
  } catch (e) { console.error('WebDAV download err:', e) }
}




const loadInitialVoices = async () => {
  try { edgeVoices.value = await (window as any).electronAPI.tts.getEdgeVoices() } catch (e) {}
  
  const setSysVoices = () => { systemVoices.value = window.speechSynthesis.getVoices() }
  if (window.speechSynthesis) {
    systemVoices.value = window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = setSysVoices
  }
}

onMounted(async () => {
  window.electronAPI.win.setControlsVisible(false)
  await loadSettings(); await fetchBook(); await fetchChapters(); await fetchRules()
  await downloadProgressFromWebdav()
  loading.value = false
  setTimeout(calculatePages, 300)
  window.addEventListener('resize', recalc)
  window.addEventListener('keydown', handleKeydown)
  loadInitialVoices()
  injectHighlightStyles()
})
onUnmounted(() => {
  stopTts()
  stopAutoPage()
  window.electronAPI.win.setControlsVisible(true)
  saveProgress()
  window.removeEventListener('resize', recalc)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="reader-root" :style="{ touchAction: showMenu ? 'auto' : 'none' }" @wheel="handleWheel" @click="handleClick" @contextmenu.prevent="handleContextMenu" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
    <!-- Separate background layer to allow blurring without blurring text -->
    <div class="fixed inset-0 pointer-events-none transition-all duration-300 transform-gpu origin-center" 
         :style="[readerBgStyle, { filter: blurAmount > 0 ? `blur(${blurAmount}px)` : 'none', transform: blurAmount > 0 ? 'scale(1.1)' : 'none' }]"
         :class="{ 'bg-[#0f172a]': !bgImage }">
    </div>
    <!-- Darken overlay, ONLY applied when blur > 0 to not ruin original image -->
    <div v-if="bgImage && blurAmount > 0" class="fixed inset-0 pointer-events-none bg-black/40"></div>

    <div v-if="loading" class="load"><div class="spinner"></div><p>正在载入...</p></div>

    <template v-else>
      <!-- Reveal animation overlay -->
      <div v-if="showingCover" class="snapshot-layer" :class="[sweepDir, flipMode === 'curl' ? 'is-curl' : '']">
        <div class="absolute inset-0 pointer-events-none transform-gpu origin-center" 
             :style="[readerBgStyle, { filter: blurAmount > 0 ? `blur(${blurAmount}px)` : 'none', transform: blurAmount > 0 ? 'scale(1.1)' : 'none' }]"
             :class="{ 'bg-[#0f172a]': !bgImage }"></div>
        <div v-if="bgImage && blurAmount > 0" class="absolute inset-0 pointer-events-none bg-black/40"></div>
        <div class="absolute inset-0" v-html="snapshotHtml"></div>
      </div>
      <div v-if="showingCover" class="sweep-line" :class="[sweepDir, flipMode === 'curl' ? 'is-curl' : '']"></div>

      <!-- Three-container carousel -->
      <div class="carousel" :class="{ sliding: carouselSliding }" :style="{ transform: carouselTransform }">
        <!-- PREV chapter (last page) -->
        <div class="slide">
          <div ref="prevContainerRef" class="pg-ctr" :style="{ padding: `${marginY}px ${marginX}px`, justifyContent: alignBottom ? 'flex-end' : 'flex-start' }">
            <div ref="prevContentRef" class="pg-ct" :style="{
              ...textStyle,
              transform: `translateX(${prevPageOffset})`,
              columnWidth: pageMode === 'double' ? `calc(50vw - ${marginX * 2}px)` : `calc(100vw - ${marginX * 2}px)`,
              columnGap: `${marginX * 2}px`, columnFill: 'auto',
              alignContent: alignBottom ? 'end' : 'start'
            }" v-if="prevChapterData">
              <h2 class="ch-title" :style="{ fontSize: (fontSize*1.4)+'px', color: fontColor }">{{ prevChapterData.title }}</h2>
              <div v-html="prevBody" class="ch-body"></div>
            </div>
          </div>
        </div>

        <!-- CURRENT chapter -->
        <div class="slide">
          <div ref="containerRef" class="pg-ctr" :style="{ padding: `${marginY}px ${marginX}px`, justifyContent: alignBottom ? 'flex-end' : 'flex-start' }">
            <div ref="contentRef" class="pg-ct" :class="{ 'pg-anim': !suppressAnim }" :style="{
              ...textStyle,
              transform: `translateX(${pageOffset})`,
              columnWidth: pageMode === 'double' ? `calc(50vw - ${marginX * 2}px)` : `calc(100vw - ${marginX * 2}px)`,
              columnGap: `${marginX * 2}px`, columnFill: 'auto',
              alignContent: alignBottom ? 'end' : 'start'
            }">
              <h2 class="ch-title" :style="{ fontSize: (fontSize*1.4)+'px', color: fontColor }">{{ currentChapterData?.title }}</h2>
              <div v-html="currentBody" class="ch-body"></div>
            </div>
          </div>
        </div>

        <!-- NEXT chapter (first page) -->
        <div class="slide">
          <div class="pg-ctr" :style="{ padding: `${marginY}px ${marginX}px` }">
            <div class="pg-ct" :style="textStyle" v-if="nextChapterData">
              <h2 class="ch-title" :style="{ fontSize: (fontSize*1.4)+'px', color: fontColor }">{{ nextChapterData.title }}</h2>
              <div v-html="nextBody" class="ch-body"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Key Hints Overlay -->
      <Transition name="fade">
        <div v-if="showKeyHints" class="absolute inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" @click.stop>
          <div class="glass-dark p-8 rounded-3xl w-full max-w-md shadow-2xl border border-white/10 animate-scale-up">
            <h3 class="text-2xl font-bold mb-6 flex items-center gap-3"><span class="text-3xl">⌨️</span> 快捷键指南</h3>
            <div class="space-y-4 mb-8">
              <div class="flex items-center justify-between p-3 glass rounded-xl">
                <span class="text-slate-300">上一页</span>
                <div class="flex gap-1">
                  <kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">←</kbd>
                  <kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">A / W</kbd>
                  <kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">PgUp</kbd>
                </div>
              </div>
              <div class="flex items-center justify-between p-3 glass rounded-xl">
                <span class="text-slate-300">下一页</span>
                <div class="flex gap-1">
                  <kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">→</kbd>
                  <kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">D / S</kbd>
                  <kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">PgDn</kbd>
                </div>
              </div>
              <div class="flex items-center justify-between p-3 glass rounded-xl">
                <span class="text-slate-300">退出全屏 / 关闭菜单</span>
                <kbd class="px-2 py-1 bg-white/10 rounded-lg shadow-sm border border-white/5 text-sm font-mono">ESC</kbd>
              </div>
              <div class="flex items-center justify-between p-3 glass rounded-xl">
                <span class="text-slate-300">鼠标操作</span>
                <span class="text-xs text-slate-400">点击中间唤出菜单，两侧翻页</span>
              </div>
            </div>
            <div class="flex gap-4">
              <button @click="disableKeyHints" class="flex-1 py-3 px-4 glass-card rounded-xl text-sm font-medium hover:bg-white/10 transition-all border border-white/5">不再提示</button>
              <button @click="closeKeyHints" class="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all">我知道了 (ESC)</button>
            </div>
          </div>
        </div>
      </Transition>

      <!-- HUD -->
      <div v-if="!showMenu" class="hud">
        <span class="hp">{{ currentPage === 0 ? book?.title : currentChapterData?.title }}</span>
        <span class="hp mono">{{ progressPercent }}%</span>
      </div>

      <!-- MENU -->
      <Transition name="menu-slide">
        <div v-if="showMenu" class="menu-ov">
          <div class="m-top" @click.stop>
            <button @click="handleGoBack" class="m-back">← 书架</button>
            <div class="m-title">{{ book?.title }}</div>
            <div class="m-acts">
              <button @click="toggleAlwaysOnTop" class="m-capsule-btn" :class="{ 'is-active': isAlwaysOnTop }">
                <div class="mc-track"><div class="mc-thumb"></div></div>
                <span>置顶</span>
              </button>
              <button @click="toggleImmersiveMode" class="m-btn">{{ isImmersive ? '⊡ 退出全屏' : '⛶ 全屏' }}</button>
              <button @click="openPanel('search')" class="m-btn" :class="{active:showSearch}">🔍 搜索</button>
              <button @click="openPanel('rules')" class="m-btn" :class="{active:showRules}">📝 替换</button>
              <button @click="openPanel('styling')" class="m-btn" :class="{active:showStyling}">Aa 排版</button>
              <button @click="openPanel('autopage')" class="m-btn shadow-sm" :class="showAutoPage || autoPageActive ? 'bg-indigo-600/80 border-indigo-500 text-white' : ''">⏱ 翻页</button>
              <button @click="openPanel('tts')" class="m-btn shadow-sm" :class="showTts || ttsActive ? 'bg-violet-600/80 border-violet-500 text-white' : ''">🎧 听书</button>
            </div>
          </div>
          <div class="m-bot" @click.stop>
            <button @click="goToChapter(currentChapterIndex-1,true)" :disabled="currentChapterIndex===0" class="m-ch">⏮ 上一章</button>
            <div class="m-prog"><input type="range" min="0" max="100" :value="progressPercent" @input="handleProgressSlider" class="m-slider"></div>
            <button @click="goToChapter(currentChapterIndex+1,true)" :disabled="currentChapterIndex>=chapters.length-1" class="m-ch">下一章 ⏭</button>
          </div>
          <div class="m-info" style="pointer-events: auto;" @click.stop>
            <div class="flex items-center justify-start">
              <button @click="openPanel('toc')" class="m-btn" :class="{active:showToc}">☰ 目录</button>
            </div>
            
            <div class="flex flex-1 items-center justify-around text-center">
              <span>第 {{ currentChapterIndex+1 }}/{{ chapters.length }} 章</span>
              <span class="truncate max-w-[180px]">「{{ currentChapterData?.title }}」</span>
              <span>第 {{ currentPage+1 }}/{{ totalPages }} 页</span>
            </div>

            <div class="flex items-center justify-end">
              <!-- Flip mode toggle -->
              <span class="flip-toggle">
                翻页:
                <button @click="setFlipMode('slide')" class="ft-btn" :class="{ftActive: flipMode==='slide'}">平移</button>
                <button @click="setFlipMode('cover')" class="ft-btn" :class="{ftActive: flipMode==='cover'}">覆盖</button>
                <button @click="setFlipMode('curl')" class="ft-btn" :class="{ftActive: flipMode==='curl'}">仿真</button>
              </span>
            </div>
          </div>

          <!-- Search panel -->
          <Transition name="sf">
            <div v-if="showSearch" class="search-p" @click.stop @wheel.stop>
              <div class="ph"><span class="pt">全文搜索</span><button @click="showSearch=false" class="px">✕</button></div>
              <div class="search-input-row">
                <input type="text" v-model="searchQuery" @keydown.enter="doSearch" placeholder="输入关键词..." class="search-input" />
                <button @click="doSearch" class="search-go" :disabled="searching">{{ searching ? '...' : '搜索' }}</button>
              </div>
              <div v-if="searchResults.length > 0" class="search-count">找到 {{ searchResults.length }} 个结果</div>
              <div v-else-if="searchQuery && !searching" class="search-count empty">未找到匹配内容</div>
              <div class="search-list">
                <button v-for="sr in searchResults" :key="sr.chapterIndex" @click="jumpToSearchResult(sr.chapterIndex)" class="search-item">
                  <span class="sr-ch">{{ sr.chapterTitle }}</span>
                  <span class="sr-snip">{{ sr.snippet }}</span>
                </button>
              </div>
            </div>
          </Transition>

          <!-- TOC -->
          <Transition name="sf">
            <div v-if="showToc" class="toc-p" @click.stop @wheel.stop>
              <div class="ph"><span class="pt">目录</span><button @click="showToc=false" class="px">✕</button></div>
              <div ref="tocListRef" class="toc-l">
                <button v-for="(ch,i) in chapters" :key="ch.id" @click="goToChapter(i,true)" class="toc-i" :class="{'toc-active':i===currentChapterIndex}">
                  <span class="ti">{{ i+1 }}</span><span class="tn">{{ ch.title }}</span>
                </button>
              </div>
            </div>
          </Transition>

          <!-- Replacement rules panel -->
          <Transition name="sf">
            <div v-if="showRules" class="rules-p" @click.stop @wheel.stop>
              <div class="ph"><span class="pt">替换规则</span><button @click="showRules=false" class="px">✕</button></div>
              <!-- Add rule form -->
              <div class="rule-form">
                <input type="text" v-model="newPattern" placeholder="查找内容..." class="rule-input" />
                <input type="text" v-model="newReplacement" placeholder="替换为..." class="rule-input" />
                <div class="rule-opts">
                  <label class="rule-scope-opt">
                    <input type="radio" value="book" v-model="newScope" /> 本书
                  </label>
                  <label class="rule-scope-opt">
                    <input type="radio" value="global" v-model="newScope" /> 全局
                  </label>
                  <label class="rule-regex-opt">
                    <input type="checkbox" v-model="newIsRegex" /> 正则
                  </label>
                  <button @click="addRule" class="rule-add-btn" :disabled="!newPattern.trim()">+ 添加</button>
                </div>
              </div>
              <!-- Rules list -->
              <div class="rules-list">
                <div v-if="rules.length === 0" class="rules-empty">暂无替换规则</div>
                <div v-for="rule in rules" :key="rule.id" class="rule-item" :class="{ inactive: !rule.active }">
                  <div class="rule-content">
                    <span class="rule-pattern">{{ rule.pattern }}</span>
                    <span class="rule-arrow">→</span>
                    <span class="rule-repl">{{ rule.replacement || '(删除)' }}</span>
                  </div>
                  <div class="rule-meta">
                    <span class="rule-badge" :class="rule.scope">{{ rule.scope === 'global' ? '全局' : '本书' }}</span>
                    <span v-if="rule.is_regex" class="rule-badge regex">正则</span>
                    <button @click="toggleRuleActive(rule)" class="rule-toggle" :title="rule.active ? '禁用' : '启用'">{{ rule.active ? '✓' : '○' }}</button>
                    <button @click="deleteRule(rule.id)" class="rule-del" title="删除">✕</button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Styling panel -->
          <Transition name="sf">
            <div v-if="showStyling" class="sty-p" @click.stop @wheel.stop>
              <div class="ph"><span class="pt">排版设置</span><button @click="showStyling=false" class="px">✕</button></div>
              <div class="sr"><label>字体</label><select v-model="fontFamily" @change="updateStyling" class="ss"><option value="system-ui">系统默认</option><option value="serif">宋体</option><option value="'Microsoft YaHei'">微软雅黑</option><option v-for="f in systemFonts" :key="f" :value="`'${f}'`">{{ f }}</option></select></div>
              <div class="sr"><label>字色</label><input type="color" v-model="fontColor" @input="updateStyling" class="sc"><input type="text" v-model="fontColor" @change="updateStyling" class="sn w72"></div>
              <div class="sr"><label>字号</label><input type="range" min="12" max="64" step="1" v-model.number="fontSize" @input="updateStyling" class="sl"><input type="number" v-model.number="fontSize" @change="updateStyling" class="sn"><span class="su">px</span></div>
              <div class="sr"><label>字重</label><input type="range" min="100" max="900" step="1" v-model.number="fontWeight" @input="updateStyling" class="sl"><input type="number" v-model.number="fontWeight" @change="updateStyling" class="sn"><small class="sw-note">*取决于字体</small></div>
              <div class="sr"><label>行间距</label><input type="range" min="1" max="4" step="0.1" v-model.number="lineHeight" @input="updateStyling" class="sl"><input type="number" v-model.number="lineHeight" step="0.1" @change="updateStyling" class="sn"></div>
              <div class="sr"><label>字间距</label><input type="range" min="-0.1" max="1" step="0.01" v-model.number="letterSpacing" @input="updateStyling" class="sl"><input type="number" v-model.number="letterSpacing" step="0.01" @change="updateStyling" class="sn"><span class="su">em</span></div>
              <div class="sr"><label>左右边距</label><input type="range" min="0" max="200" step="1" v-model.number="marginX" @input="updateStyling" class="sl"><input type="number" v-model.number="marginX" @change="updateStyling" class="sn"><span class="su">px</span></div>
              <div class="sr"><label>上下边距</label><input type="range" min="0" max="150" step="1" v-model.number="marginY" @input="updateStyling" class="sl"><input type="number" v-model.number="marginY" @change="updateStyling" class="sn"><span class="su">px</span></div>
              <div class="sr"><label>翻页底色</label><input type="color" v-model="coverColor" @input="updateStyling" class="sc"><input type="text" v-model="coverColor" @change="updateStyling" class="sn w72"><small class="sw-note">*有背景图时自动适配</small></div>
              <div class="sr"><label>背景模糊</label><input type="range" min="0" max="40" step="1" v-model.number="blurAmount" @input="updateStyling" class="sl"><input type="number" v-model.number="blurAmount" @change="updateStyling" class="sn"><span class="su">px</span></div>
              <div class="sr">
                <label>文字对齐</label>
                <div class="btn-group">
                  <button @click="textAlign='left'; updateStyling()" :class="{active: textAlign==='left'}">靠左对齐</button>
                  <button @click="textAlign='justify'; updateStyling()" :class="{active: textAlign==='justify'}">两端对齐</button>
                </div>
              </div>
              <div class="sr">
                <label>垂直对齐</label>
                <div class="btn-group">
                  <button @click="alignBottom=false; updateStyling()" :class="{active: !alignBottom}">常规（靠上）</button>
                  <button @click="alignBottom=true; updateStyling()" :class="{active: alignBottom}">靠底沉降</button>
                </div>
              </div>
              <div class="sp-divider"></div>
              <div class="sr">
                <label>视图模式</label>
                <div class="btn-group">
                  <button @click="pageMode='single'; updateStyling()" :class="{active: pageMode==='single'}">单页</button>
                  <button @click="pageMode='double'; updateStyling()" :class="{active: pageMode==='double'}">双页(横屏)</button>
                </div>
              </div>
              <div class="sr" v-if="pageMode==='double'">
                <label>翻页步长</label>
                <div class="btn-group">
                  <button @click="doublePageStep=1; updateStyling()" :class="{active: doublePageStep===1}">1页</button>
                  <button @click="doublePageStep=2; updateStyling()" :class="{active: doublePageStep===2}">2页</button>
                </div>
              </div>
              <div class="sp-divider"></div>
              <div class="sr themes-sr">
                <label>预设主题</label>
                <div class="btn-group theme-btns">
                  <button @click="applyTheme('dark')">深色</button>
                  <button @click="applyTheme('paper')">纸质/羊皮纸</button>
                  <button @click="applyTheme('green')">护眼绿</button>
                </div>
              </div>
              <div class="sr themes-sr">
                <label>保存当前</label>
                <div class="flex-row">
                  <input type="text" v-model="newThemeName" placeholder="新主题名称" class="sn flex-1" style="width: auto;">
                  <button @click="saveTheme" class="s-btn">保存</button>
                </div>
              </div>
              <div class="sr themes-sr" v-if="customThemes.length > 0">
                <label>自定义</label>
                <div class="theme-list">
                  <div v-for="t in customThemes" :key="t.id" class="theme-tag">
                    <button @click="applyThemeConfig(t)" class="theme-n">{{ t.name }}</button>
                    <button @click="deleteTheme(t.id)" class="theme-d">✕</button>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <!-- Auto-Page panel -->
          <Transition name="sf">
            <div v-if="showAutoPage" class="sty-p" @click.stop @wheel.stop>
              <div class="ph"><span class="pt">自动翻页</span><button @click="showAutoPage=false" class="px">✕</button></div>
              <div class="sr">
                <label>翻页速度</label>
                <input type="range" min="1" max="30" step="1" v-model.number="autoPageSpeed" @change="saveTtsSettings" class="sl">
                <input type="number" v-model.number="autoPageSpeed" @change="saveTtsSettings" class="sn"><span class="su">秒</span>
              </div>
              <div class="sr">
                <label>动画耗时</label>
                <div class="btn-group">
                  <button @click="setFlipSpeed('fast')" :class="{active: flipSpeed==='fast'}">偏快</button>
                  <button @click="setFlipSpeed('medium')" :class="{active: flipSpeed==='medium'}">默认</button>
                  <button @click="setFlipSpeed('slow')" :class="{active: flipSpeed==='slow'}">偏慢</button>
                </div>
              </div>
              <div class="sp-divider"></div>
              <div class="flex justify-center mt-4 mb-2">
                <button @click="toggleAutoPage" class="px-8 py-3 rounded-xl font-bold transition-all shadow-lg" :class="autoPageActive ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 border border-indigo-500/30'">
                  {{ autoPageActive ? '⏹ 停止自动翻页' : '▶ 开始自动翻页' }}
                </button>
              </div>
            </div>
          </Transition>

          <!-- TTS panel -->
          <Transition name="sf">
            <div v-if="showTts" class="sty-p" @click.stop @wheel.stop>
              <div class="ph"><span class="pt">听书设置</span><button @click="showTts=false" class="px">✕</button></div>
              <div class="sr">
                <label>选择引擎</label>
                <div class="btn-group">
                  <button @click="ttsEngine='edge'; saveTtsSettings()" :class="{active: ttsEngine==='edge'}">Edge 云端</button>
                  <button @click="ttsEngine='system'; saveTtsSettings()" :class="{active: ttsEngine==='system'}">本地系统</button>
                </div>
              </div>
              <div class="sr">
                <label>发音人</label>
                <select v-if="ttsEngine==='edge'" v-model="ttsVoice" @change="saveTtsSettings" class="ss">
                  <option value="">随机/默认 (Xiaoxiao)</option>
                  <option v-for="v in edgeVoices" :key="v.shortName" :value="v.shortName">{{ v.name }}</option>
                </select>
                <select v-else v-model="ttsVoice" @change="saveTtsSettings" class="ss">
                  <option value="">跟随系统默认</option>
                  <option v-for="v in systemVoices" :key="v.name" :value="v.name">{{ v.name }} ({{ v.lang }})</option>
                </select>
              </div>
              <div class="sr">
                <label>语速</label>
                <input type="range" min="0.5" max="2.0" step="0.1" v-model.number="ttsRate" @change="saveTtsSettings" class="sl">
                <input type="number" v-model.number="ttsRate" step="0.1" @change="saveTtsSettings" class="sn"><span class="su">x</span>
              </div>
              <div class="sr">
                <label>高亮颜色</label>
                <input type="color" v-model="highlightColor" @change="saveTtsSettings" class="sc"><input type="text" v-model="highlightColor" @change="saveTtsSettings" class="sn w72">
              </div>
              <div class="sp-divider"></div>
              <div class="flex justify-center mt-4 mb-2">
                <button @click="startTts" class="px-8 py-3 rounded-xl font-bold transition-all shadow-lg bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 hover:text-violet-300 border border-violet-500/30" v-if="!ttsActive">
                  ▶ 开始听书
                </button>
                <button @click="stopTts" class="px-8 py-3 rounded-xl font-bold transition-all shadow-lg bg-red-500/20 text-red-500 hover:bg-red-500/30" v-else>
                  ⏹ 停止听书
                </button>
              </div>
            </div>
          </Transition>

        </div>
      </Transition>

      <!-- Copy Modal -->
      <Transition name="fade">
        <div v-if="showCopyModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6" @click.stop="showCopyModal = false">
          <div class="copy-modal bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col gap-4 max-h-[80vh]" @click.stop>
            <div class="flex items-center justify-between">
              <h3 class="text-slate-200 font-bold">文字提取与复制</h3>
              <button @click="showCopyModal = false" class="text-slate-400 hover:text-white px-2">✕</button>
            </div>
            <textarea v-model="selectedText" class="w-full flex-1 min-h-[150px] bg-slate-800 text-slate-300 resize-none rounded-xl p-4 outline-none border border-slate-700/50 focus:border-blue-500" style="user-select: text;"></textarea>
            <div class="flex justify-end gap-3 mt-2">
              <button @click="showCopyModal = false" class="px-5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium transition-colors">取消</button>
              <button @click="copyToClipboard" class="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-bold shadow-lg shadow-blue-500/20 transition-colors">复制全文</button>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.reader-root { position:fixed; inset:0; overflow:hidden; user-select:none; display:flex; flex-direction:column; color:white; color-scheme:only light; }
.load { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; color:rgba(255,255,255,0.5); z-index:1; }
.spinner { width:40px; height:40px; border:2px solid rgba(59,130,246,0.2); border-top-color:#3b82f6; border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg) } }

/* Reveal Transition Overlay */
.snapshot-layer { position: absolute; inset: 0; z-index: 20; pointer-events: none; overflow: hidden; }
/* Cover mode animations */
.snapshot-layer.left:not(.is-curl) { animation: clipLeft 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.snapshot-layer.right:not(.is-curl) { animation: clipRight 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes clipLeft {
  from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  to { clip-path: polygon(0 0, 0 0, 0 100%, 0 100%); }
}
@keyframes clipRight {
  from { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  to { clip-path: polygon(100% 0, 100% 0, 100% 100%, 100% 100%); }
}

.sweep-line { position: absolute; top: 0; bottom: 0; width: 40px; z-index: 21; pointer-events: none; background: linear-gradient(to right, transparent, rgba(0,0,0,0.15), rgba(0,0,0,0.4), transparent); }
.theme-n .sweep-line { background: linear-gradient(to right, transparent, rgba(255,255,255,0.05), rgba(255,255,255,0.15), transparent); }
.sweep-line.left:not(.is-curl) { animation: sweepLeft 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.sweep-line.right:not(.is-curl) { animation: sweepRight 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes sweepLeft { from { transform: translateX(100vw); } to { transform: translateX(-40px); } }
@keyframes sweepRight { from { transform: translateX(-40px); } to { transform: translateX(100vw); } }

/* Curl mode animations */
.sweep-line.is-curl {
  width: 120px;
  background: linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 40%, transparent 100%);
  transform-origin: center;
}
.theme-n .sweep-line.is-curl {
  background: linear-gradient(to right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 40%, transparent 100%);
}

.sweep-line.is-curl.left { animation: curlSweepLeft 0.55s ease-in-out forwards; }
@keyframes curlSweepLeft {
  0% { transform: translateX(100vw) rotate(15deg) scaleX(1); opacity: 1; }
  100% { transform: translateX(-50vw) rotate(15deg) scaleX(2.5); opacity: 0; }
}

.sweep-line.is-curl.right { animation: curlSweepRight 0.55s ease-in-out forwards; background: linear-gradient(to left, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 40%, transparent 100%); }
.theme-n .sweep-line.is-curl.right { background: linear-gradient(to left, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 40%, transparent 100%); }
@keyframes curlSweepRight {
  0% { transform: translateX(-50vw) rotate(-15deg) scaleX(1); opacity: 1; }
  100% { transform: translateX(100vw) rotate(-15deg) scaleX(2.5); opacity: 0; }
}

.snapshot-layer.is-curl.left { animation: curlClipLeft 0.55s ease-in-out forwards; }
@keyframes curlClipLeft {
  0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  100% { clip-path: polygon(0 0, -20% 0, -50% 100%, 0 100%); }
}

.snapshot-layer.is-curl.right { animation: curlClipRight 0.55s ease-in-out forwards; }
@keyframes curlClipRight {
  0% { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  100% { clip-path: polygon(100% 0, 120% 0, 150% 100%, 100% 100%); }
}

/* Carousel */
.carousel { display:flex; width:300vw; height:100%; transform:translateX(-100vw); z-index:1; }
.carousel.sliding { transition: transform 0.38s cubic-bezier(0.25,0.46,0.45,0.94); }
.slide { width:100vw; height:100%; flex-shrink:0; overflow:hidden; }

.pg-ctr { width:100%; height:100%; overflow:hidden; box-sizing:border-box; }
.pg-ct { height:100%; column-fill:auto; }
.pg-ct.pg-anim { transition: transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94); }

.ch-title { font-weight:700; margin-bottom:1.5em; opacity:0.85; }
.ch-body { height:100%; }
.ch-body :deep(p) { text-indent:2em; margin-bottom:0.8em; }
.ch-body :deep(p:first-child) { text-indent:2em; }
.ch-body :deep(> *:first-child) { text-indent:2em; }

/* HUD */
.hud { position:absolute; bottom:16px; left:24px; right:24px; display:flex; justify-content:space-between; pointer-events:none; z-index:10; }
.hp { font-size:11px; font-weight:600; background:rgba(15,23,42,0.5); backdrop-filter:blur(8px); padding:4px 12px; border-radius:20px; border:1px solid rgba(255,255,255,0.06); opacity:0.7; }
.hp.mono { font-family:'Consolas',monospace; }

/* Menu */
.menu-ov { position:absolute; inset:0; z-index:50; display:flex; flex-direction:column; }
.m-top { display:flex; align-items:center; gap:12px; padding:20px 32px; height:auto; min-height:80px; background:rgba(15,23,42,0.92); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); }
.m-back { background:none; border:1px solid rgba(255,255,255,0.15); color:white; font-size:15px; font-weight:600; cursor:pointer; padding:10px 20px; border-radius:12px; transition:all .2s; white-space:nowrap; }
.m-back:hover { background:rgba(255,255,255,0.1); }
.m-title { font-weight:700; font-size:16px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:25%; opacity:0.8; }
.m-acts { flex:1; display:flex; justify-content:flex-end; align-items:center; gap:12px; }
.m-capsule-btn { display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:30px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); cursor:pointer; font-size:13px; font-weight:700; transition:all .2s; }
.m-capsule-btn:hover { background:rgba(255,255,255,0.15); color:white; }
.m-capsule-btn.is-active { background:rgba(59,130,246,0.15); border-color:#3b82f6; color:#60a5fa; }
.m-capsule-btn .mc-track { position:relative; width:28px; height:16px; border-radius:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.2); transition:all .2s; }
.m-capsule-btn.is-active .mc-track { background:#3b82f6; border-color:#3b82f6; }
.m-capsule-btn .mc-thumb { position:absolute; left:2px; top:2px; width:10px; height:10px; border-radius:50%; background:white; transition:all .2s; }
.m-capsule-btn.is-active .mc-thumb { transform:translateX(12px); }
.m-btn { padding:10px 20px; border-radius:12px; font-size:14px; font-weight:700; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:white; cursor:pointer; transition:all .2s; }
.m-btn:hover { background:rgba(59,130,246,0.2); }
.m-btn.active { background:#3b82f6; border-color:#3b82f6; box-shadow:0 4px 12px rgba(59,130,246,0.3); }
.m-bot { margin-top:auto; display:flex; align-items:center; gap:32px; padding:24px 40px; background:rgba(15,23,42,0.92); backdrop-filter:blur(20px); border-top:1px solid rgba(255,255,255,0.06); }
.m-ch { padding:12px 24px; border-radius:12px; font-size:14px; font-weight:700; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:white; cursor:pointer; white-space:nowrap; transition:all .2s; }
.m-ch:hover:not(:disabled) { background:rgba(59,130,246,0.2); }
.m-ch:disabled { opacity:0.25; cursor:default; }
.m-prog { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; }
.m-slider { width:100%; height:8px; -webkit-appearance:none; appearance:none; background:rgba(255,255,255,0.1); border-radius:4px; outline:none; cursor:pointer; }
.m-slider::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; background:white; border:3px solid #3b82f6; border-radius:50%; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
.m-pct { font-size:12px; font-family:monospace; color:rgba(255,255,255,0.5); }
.m-info { display:flex; align-items:center; padding:12px 40px 32px; font-size:13px; color:rgba(255,255,255,0.4); font-weight:600; background:rgba(15,23,42,0.92); backdrop-filter:blur(20px); gap:16px; }

/* Flip mode toggle */
.flip-toggle { display:flex; align-items:center; gap:8px; margin-left:auto; }
.ft-btn { padding:6px 16px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:transparent; color:rgba(255,255,255,0.4); font-size:12px; font-weight:700; cursor:pointer; transition:all .15s; }
.ft-btn:hover { color:rgba(255,255,255,0.7); }
.ftActive { background:#3b82f6!important; border-color:#3b82f6!important; color:white!important; }

/* Search panel */
.search-p { position:absolute; left:20px; top:60px; bottom:120px; width:360px; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; }
.search-input-row { display:flex; gap:8px; margin-bottom:12px; }
.search-input { flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:8px 14px; font-size:13px; color:white; outline:none; transition:border-color .2s; }
.search-input:focus { border-color:#3b82f6; }
.search-input::placeholder { color:rgba(255,255,255,0.3); }
.search-go { padding:8px 16px; border-radius:10px; font-size:12px; font-weight:700; background:#3b82f6; border:none; color:white; cursor:pointer; transition:all .2s; white-space:nowrap; }
.search-go:hover { background:#2563eb; }
.search-go:disabled { opacity:0.5; }
.search-count { font-size:11px; color:rgba(255,255,255,0.4); margin-bottom:8px; font-weight:600; }
.search-count.empty { color:rgba(255,255,255,0.25); }
.search-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.search-list::-webkit-scrollbar { width:4px; }
.search-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.search-item { display:flex; flex-direction:column; gap:4px; padding:10px 12px; border-radius:10px; border:none; background:transparent; color:rgba(255,255,255,0.7); font-size:12px; cursor:pointer; text-align:left; transition:all .15s; }
.search-item:hover { background:rgba(59,130,246,0.12); color:white; }
.sr-ch { font-weight:700; font-size:12px; color:#60a5fa; }
.sr-snip { font-size:11px; opacity:0.6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* TOC */
.toc-p { position:absolute; left:20px; top:60px; bottom:120px; width:300px; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; }
.toc-l { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:2px; }
.toc-l::-webkit-scrollbar { width:4px; }
.toc-l::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.toc-i { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; border:none; background:transparent; color:rgba(255,255,255,0.6); font-size:13px; cursor:pointer; text-align:left; transition:all .15s; }
.toc-i:hover { background:rgba(255,255,255,0.06); color:white; }
.toc-active { background:rgba(59,130,246,0.15)!important; color:#60a5fa!important; font-weight:700; }
.ti { font-size:10px; opacity:0.4; min-width:24px; font-family:monospace; }
.tn { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* Replacement rules panel */
.rules-p { position:absolute; right:20px; top:60px; bottom:120px; width:380px; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden; }
.rule-form { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.06); }
.rule-input { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:8px 14px; font-size:13px; color:white; outline:none; transition:border-color .2s; }
.rule-input:focus { border-color:#3b82f6; }
.rule-input::placeholder { color:rgba(255,255,255,0.3); }
.rule-opts { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.rule-scope-opt, .rule-regex-opt { font-size:12px; color:rgba(255,255,255,0.5); display:flex; align-items:center; gap:4px; cursor:pointer; }
.rule-scope-opt input, .rule-regex-opt input { accent-color:#3b82f6; }
.rule-add-btn { margin-left:auto; padding:6px 16px; border-radius:8px; font-size:12px; font-weight:700; background:#3b82f6; border:none; color:white; cursor:pointer; transition:all .2s; }
.rule-add-btn:hover { background:#2563eb; }
.rule-add-btn:disabled { opacity:0.3; cursor:default; }
.rules-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px; }
.rules-list::-webkit-scrollbar { width:4px; }
.rules-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.rules-empty { text-align:center; padding:24px; font-size:12px; color:rgba(255,255,255,0.2); }
.rule-item { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px 12px; transition:all .15s; }
.rule-item.inactive { opacity:0.4; }
.rule-content { display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; }
.rule-pattern { color:#f59e0b; font-weight:600; word-break:break-all; }
.rule-arrow { color:rgba(255,255,255,0.2); font-size:12px; flex-shrink:0; }
.rule-repl { color:#34d399; font-weight:600; word-break:break-all; }
.rule-meta { display:flex; align-items:center; gap:6px; }
.rule-badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; }
.rule-badge.global { background:rgba(139,92,246,0.15); color:#a78bfa; }
.rule-badge.book { background:rgba(59,130,246,0.15); color:#60a5fa; }
.rule-badge.regex { background:rgba(245,158,11,0.15); color:#fbbf24; }
.rule-toggle { background:none; border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.4); font-size:12px; cursor:pointer; padding:2px 8px; border-radius:6px; margin-left:auto; transition:all .15s; }
.rule-toggle:hover { color:white; border-color:rgba(255,255,255,0.3); }
.rule-del { background:none; border:none; color:rgba(239,68,68,0.5); font-size:14px; cursor:pointer; padding:2px 6px; transition:all .15s; }
.rule-del:hover { color:#ef4444; }

/* Styling */
.sty-p { position:absolute; right:20px; top:60px; bottom:120px; width:340px; overflow-y:auto; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
.sty-p::-webkit-scrollbar { width:4px; }
.sty-p::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
.sr { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.sr label { font-size:12px; font-weight:600; opacity:0.6; min-width:56px; flex-shrink:0; }
.sl { flex:1; height:4px; -webkit-appearance:none; appearance:none; background:rgba(255,255,255,0.1); border-radius:2px; outline:none; min-width:80px; }
.sl::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; background:white; border:2px solid #3b82f6; border-radius:50%; cursor:pointer; }
.sn { width:52px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:4px 6px; text-align:center; font-size:12px; font-family:monospace; color:white; outline:none; }
.sn:focus { border-color:#3b82f6; }
.sn.w72 { width:72px; }
.su { font-size:10px; opacity:0.3; font-family:monospace; min-width:20px; }
.ss { flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:8px 12px; font-size:13px; color:white; outline:none; cursor:pointer; }
.ss option { background:#0f172a; color:white; }
.sc { width:36px; height:30px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; background:transparent; cursor:pointer; padding:2px; }
.sw-note { font-size:10px; color:rgba(255,255,255,0.3); margin-left:4px; }
.sp-divider { height:1px; background:rgba(255,255,255,0.06); margin:20px 0; }
.btn-group { display:flex; gap:6px; flex:1; }
.btn-group button { flex:1; padding:6px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:white; font-size:12px; cursor:pointer; transition:all .2s; }
.btn-group button:hover { background:rgba(255,255,255,0.1); }
.btn-group button.active { background:#3b82f6; border-color:#3b82f6; font-weight:700; }
.theme-btns { flex-wrap:wrap; }
.theme-btns button { min-width:30%; }
.themes-sr { align-items:flex-start; }
.themes-sr label { margin-top:6px; }
.flex-row { display:flex; gap:8px; flex:1; }
.flex-1 { flex:1; }
.s-btn { padding:6px 12px; border-radius:8px; background:#3b82f6; border:none; color:white; font-size:12px; font-weight:700; cursor:pointer; transition:all .2s; }
.s-btn:hover { background:#2563eb; }
.theme-list { display:flex; flex-wrap:wrap; gap:8px; flex:1; }
.theme-tag { display:flex; align-items:center; background:rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); }
.theme-n { padding:4px 8px; font-size:11px; color:white; background:none; border:none; cursor:pointer; }
.theme-n:hover { background:rgba(255,255,255,0.1); }
.theme-d { padding:4px 6px; font-size:10px; color:rgba(239,68,68,0.7); background:none; border:none; border-left:1px solid rgba(255,255,255,0.1); cursor:pointer; }
.theme-d:hover { background:rgba(239,68,68,0.2); color:#ef4444; }

/* Transitions */
.fade-enter-active,.fade-leave-active { transition:opacity .25s ease; }
.fade-enter-from,.fade-leave-to { opacity:0; }
.sf-enter-active,.sf-leave-active { transition:all .3s ease; }
.sf-enter-from { opacity:0; transform:translateY(12px); }
.sf-leave-to { opacity:0; transform:translateY(12px); }

/* Menu Slide Transition */
.menu-slide-enter-active, .menu-slide-leave-active { transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-slide-enter-from, .menu-slide-leave-to { opacity: 0; }
.m-top { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-slide-enter-from .m-top, .menu-slide-leave-to .m-top { transform: translateY(-100%); }
.m-bot, .m-info { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.menu-slide-enter-from .m-bot, .menu-slide-leave-to .m-bot,
.menu-slide-enter-from .m-info, .menu-slide-leave-to .m-info { transform: translateY(100%); }
</style>
