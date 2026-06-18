import { computed, ref, watch, type Ref } from 'vue'
import { ttsDeadlineFrom, ttsRemaining } from '../utils/ttsSleepTimer'

declare class Highlight { constructor(...ranges: Range[]) }

interface SentenceItem { text: string; range: Range }

export function useTTS(opts: {
  contentRef: Ref<HTMLElement | null>
  containerWidth: Ref<number>
  ttsEngine: Ref<'system' | 'edge' | 'mimo'>
  ttsVoice: Ref<string>
  ttsRate: Ref<number>
  highlightColor: Ref<string>
  flipDurationMs: Ref<number>
  ttsMiMoApiKey: Ref<string>
  ttsMiMoVoice: Ref<string>
  bookTitle: Ref<string>
  chapterTitle: Ref<string>
  nextPage: () => boolean | void
  slideToNextChapter: () => boolean | void
  getFollowingSentenceText?: () => string | null
}) {
  const ttsActive = ref(false)
  const ttsPaused = ref(false)
  const ttsState = computed<'playing' | 'paused' | 'stopped'>(() => (
    !ttsActive.value ? 'stopped' : ttsPaused.value ? 'paused' : 'playing'
  ))
  const sleepRemainingMs = ref(0)
  let isPlayingTts = false
  let ttsAudio: HTMLAudioElement | null = null
  let mimoSource: AudioBufferSourceNode | null = null
  let audioCtx: AudioContext | null = null
  let ttsGeneration = 0
  let activeSentences: SentenceItem[] = []
  let currentSentenceIndex = 0
  let sleepDeadline = 0
  let sleepTimeout: number | null = null
  let sleepTicker: number | null = null

  const edgeCache = new Map<string, Promise<string | null>>()
  const mimoCache = new Map<string, Promise<Uint8Array | null>>()
  const systemCache = new Map<string, SpeechSynthesisUtterance>()
  const edgeVoices = ref<any[]>([])
  const systemVoices = ref<SpeechSynthesisVoice[]>([])

  const sentenceTexts = (text: string): string[] => text.match(/[^ \n\t。！？.!?,，;；、]+[。！？.!?,，;；、]*/g)?.filter(Boolean) || []

  const getSentencesFromNode = (node: Node, sentences: SentenceItem[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || ''
      const regex = /[^ \n\t。！？.!?,，;；、]+[。！？.!?,，;；、]*/g
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        if (!match[0].trim()) continue
        const range = new Range()
        try {
          range.setStart(node, match.index)
          range.setEnd(node, match.index + match[0].length)
          sentences.push({ text: match[0], range })
        } catch {}
      }
      return
    }
    for (const child of Array.from(node.childNodes)) {
      if ((child as HTMLElement).tagName?.toLocaleLowerCase() !== 'rt') getSentencesFromNode(child, sentences)
    }
  }

  const clearHighlight = () => {
    if ('highlights' in CSS) {
      // @ts-ignore Chromium CSS Highlight API
      CSS.highlights.delete('tts-highlight')
    }
  }

  const highlightRange = (range: Range) => {
    if ('highlights' in CSS) {
      // @ts-ignore Chromium CSS Highlight API
      CSS.highlights.set('tts-highlight', new Highlight(range))
    }
  }

  const injectHighlightStyles = () => {
    let style = document.getElementById('tts-style') as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = 'tts-style'
      document.head.appendChild(style)
    }
    style.innerHTML = `::highlight(tts-highlight) { background-color: ${opts.highlightColor.value}40; color: ${opts.highlightColor.value}; border-radius: 4px; }`
  }
  watch(() => opts.highlightColor.value, injectHighlightStyles)

  const ipcBytes = (value: unknown): Uint8Array | null => {
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (value && typeof value === 'object') return new Uint8Array(Object.values(value) as number[])
    return null
  }

  const cacheKey = (engine: string, text: string) => [
    engine,
    engine === 'mimo' ? opts.ttsMiMoVoice.value : opts.ttsVoice.value,
    opts.ttsRate.value,
    text,
  ].join('\u0000')

  const synthesizeEdgeUrl = async (text: string): Promise<string | null> => {
    try {
      const response = await window.electronAPI.tts.synthesize(text, opts.ttsVoice.value || undefined, opts.ttsRate.value)
      const bytes = response.success ? ipcBytes(response.audioBuffer) : null
      if (!bytes?.length) return null
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      return URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }))
    } catch (error) {
      console.error('Edge TTS synthesis error', error)
      return null
    }
  }

  const synthesizeMimoPcm = async (text: string): Promise<Uint8Array | null> => {
    try {
      const response = await window.electronAPI.tts.synthesizeMimo(text, opts.ttsMiMoApiKey.value, opts.ttsMiMoVoice.value)
      return response.success ? ipcBytes(response.audioBuffer) : null
    } catch (error) {
      console.error('MiMo TTS synthesis error', error)
      return null
    }
  }

  const createSystemUtterance = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = systemVoices.value.find(item => item.name === opts.ttsVoice.value)
    if (voice) utterance.voice = voice
    utterance.rate = opts.ttsRate.value
    return utterance
  }

  const prefetchText = (text: string | null | undefined) => {
    const value = text?.trim()
    if (!value) return
    if (opts.ttsEngine.value === 'system') {
      const key = cacheKey('system', value)
      if (!systemCache.has(key)) systemCache.set(key, createSystemUtterance(value))
    } else if (opts.ttsEngine.value === 'edge') {
      const key = cacheKey('edge', value)
      if (!edgeCache.has(key)) edgeCache.set(key, synthesizeEdgeUrl(value))
    } else if (opts.ttsEngine.value === 'mimo' && opts.ttsMiMoApiKey.value) {
      const key = cacheKey('mimo', value)
      if (!mimoCache.has(key)) mimoCache.set(key, synthesizeMimoPcm(value))
    }
  }

  const nextText = () => activeSentences[currentSentenceIndex + 1]?.text
    || sentenceTexts(opts.getFollowingSentenceText?.() || '')[0]
    || null

  const playSystem = (text: string) => new Promise<void>(resolve => {
    if (!window.speechSynthesis) { resolve(); return }
    const key = cacheKey('system', text)
    const utterance = systemCache.get(key) || createSystemUtterance(text)
    systemCache.delete(key)
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })

  const playEdge = async (text: string) => {
    const key = cacheKey('edge', text)
    const promise = edgeCache.get(key) || synthesizeEdgeUrl(text)
    edgeCache.delete(key)
    const url = await promise
    if (!url || !isPlayingTts) return
    ttsAudio = new Audio(url)
    await new Promise<void>(resolve => {
      const done = () => {
        URL.revokeObjectURL(url)
        ttsAudio = null
        resolve()
      }
      ttsAudio!.onended = done
      ttsAudio!.onerror = done
      void ttsAudio!.play().catch(done)
    })
  }

  const playMimo = async (text: string) => {
    const key = cacheKey('mimo', text)
    const promise = mimoCache.get(key) || synthesizeMimoPcm(text)
    mimoCache.delete(key)
    const bytes = await promise
    if (!bytes?.length || !isPlayingTts) return
    if (!audioCtx) audioCtx = new AudioContext()
    if (audioCtx.state === 'suspended' && !ttsPaused.value) await audioCtx.resume()
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2))
    const floats = new Float32Array(pcm.length)
    for (let index = 0; index < pcm.length; index++) floats[index] = pcm[index] / 32768
    const buffer = audioCtx.createBuffer(1, floats.length, 24000)
    buffer.copyToChannel(floats, 0)
    mimoSource = audioCtx.createBufferSource()
    mimoSource.buffer = buffer
    mimoSource.playbackRate.value = opts.ttsRate.value
    mimoSource.connect(audioCtx.destination)
    await new Promise<void>(resolve => {
      mimoSource!.onended = () => { mimoSource = null; resolve() }
      mimoSource!.start()
    })
  }

  const buildSentences = () => {
    activeSentences = []
    currentSentenceIndex = 0
    if (opts.contentRef.value) getSentencesFromNode(opts.contentRef.value, activeSentences)
    const visible = activeSentences.findIndex(item => {
      const rect = item.range.getBoundingClientRect()
      return rect.right > 20 && rect.width > 0
    })
    if (visible >= 0) currentSentenceIndex = visible
  }

  const updateMediaSession = () => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = ttsActive.value
      ? new MediaMetadata({ title: opts.bookTitle.value || 'PacilRead 听书', artist: opts.chapterTitle.value, album: 'PacilRead' })
      : null
    navigator.mediaSession.playbackState = !ttsActive.value ? 'none' : ttsPaused.value ? 'paused' : 'playing'
  }

  const clearSleepTimer = () => {
    if (sleepTimeout !== null) window.clearTimeout(sleepTimeout)
    if (sleepTicker !== null) window.clearInterval(sleepTicker)
    sleepTimeout = null
    sleepTicker = null
    sleepDeadline = 0
    sleepRemainingMs.value = 0
  }

  const stopTts = () => {
    ttsGeneration++
    ttsActive.value = false
    ttsPaused.value = false
    isPlayingTts = false
    if (ttsAudio) { ttsAudio.pause(); ttsAudio = null }
    if (mimoSource) { try { mimoSource.stop() } catch {}; mimoSource = null }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    void window.electronAPI.tts.stopMimo()
    clearHighlight()
    clearSleepTimer()
    for (const promise of edgeCache.values()) void promise.then(url => { if (url) URL.revokeObjectURL(url) })
    edgeCache.clear()
    mimoCache.clear()
    systemCache.clear()
    updateMediaSession()
  }

  const setSleepTimer = (durationMs: number) => {
    if (sleepTimeout !== null) window.clearTimeout(sleepTimeout)
    if (sleepTicker !== null) window.clearInterval(sleepTicker)
    sleepTimeout = null
    sleepTicker = null
    const duration = Math.max(0, Math.floor(durationMs || 0))
    sleepDeadline = ttsDeadlineFrom(performance.now(), duration)
    sleepRemainingMs.value = duration
    if (!duration || !ttsActive.value) return
    sleepTimeout = window.setTimeout(stopTts, duration)
    sleepTicker = window.setInterval(() => {
      sleepRemainingMs.value = ttsRemaining(performance.now(), sleepDeadline)
    }, 1000)
  }

  const playNextSentence = async () => {
    const generation = ttsGeneration
    if (!isPlayingTts || ttsPaused.value) return
    if (!activeSentences.length || currentSentenceIndex >= activeSentences.length) {
      const turned = opts.nextPage()
      if (turned === false) opts.slideToNextChapter()
      window.setTimeout(() => {
        if (!isPlayingTts || generation !== ttsGeneration) return
        buildSentences()
        void playNextSentence()
      }, opts.flipDurationMs.value * 2)
      return
    }

    const item = activeSentences[currentSentenceIndex]
    prefetchText(nextText())
    const rect = item.range.getBoundingClientRect()
    const width = opts.containerWidth.value || window.innerWidth
    if (rect.left > width - 20) {
      opts.nextPage()
      await new Promise(resolve => window.setTimeout(resolve, opts.flipDurationMs.value + 50))
    }
    if (!isPlayingTts || ttsPaused.value || generation !== ttsGeneration) return
    highlightRange(item.range)
    if (opts.ttsEngine.value === 'system') await playSystem(item.text)
    else if (opts.ttsEngine.value === 'edge') await playEdge(item.text)
    else await playMimo(item.text)
    if (isPlayingTts && !ttsPaused.value && generation === ttsGeneration) {
      currentSentenceIndex++
      void playNextSentence()
    }
  }

  const pauseTts = () => {
    if (!ttsActive.value || ttsPaused.value) return
    ttsPaused.value = true
    if (ttsAudio) ttsAudio.pause()
    if (window.speechSynthesis) window.speechSynthesis.pause()
    if (audioCtx?.state === 'running') void audioCtx.suspend()
    updateMediaSession()
  }

  const resumeTts = () => {
    if (!ttsActive.value || !ttsPaused.value) return
    ttsPaused.value = false
    if (ttsAudio) void ttsAudio.play()
    if (window.speechSynthesis) window.speechSynthesis.resume()
    if (audioCtx?.state === 'suspended') void audioCtx.resume()
    updateMediaSession()
    if (!ttsAudio && !window.speechSynthesis.speaking && !mimoSource) void playNextSentence()
  }

  const configureMediaSession = () => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', resumeTts)
    navigator.mediaSession.setActionHandler('pause', pauseTts)
    navigator.mediaSession.setActionHandler('stop', stopTts)
  }

  const startTts = (sleepDurationMs = 0) => {
    if (ttsActive.value) { stopTts(); return }
    if (opts.ttsEngine.value === 'mimo' && !opts.ttsMiMoApiKey.value) return 'MIMO_KEY_MISSING'
    ttsGeneration++
    ttsActive.value = true
    ttsPaused.value = false
    isPlayingTts = true
    buildSentences()
    prefetchText(activeSentences[currentSentenceIndex + 1]?.text || nextText())
    setSleepTimer(sleepDurationMs)
    configureMediaSession()
    updateMediaSession()
    void playNextSentence()
  }

  const handleTtsClick = (x: number, y: number): boolean => {
    if (!ttsActive.value) return false
    const found = activeSentences.findIndex(item => Array.from(item.range.getClientRects()).some(rect => (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    )))
    if (found < 0) return false
    ttsGeneration++
    currentSentenceIndex = found
    if (ttsAudio) { ttsAudio.pause(); ttsAudio = null }
    if (mimoSource) { try { mimoSource.stop() } catch {}; mimoSource = null }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    void playNextSentence()
    return true
  }

  const loadVoices = async () => {
    try { edgeVoices.value = await window.electronAPI.tts.getEdgeVoices() } catch {}
    const loadSystem = () => { systemVoices.value = window.speechSynthesis?.getVoices() || [] }
    loadSystem()
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadSystem
  }

  watch([opts.bookTitle, opts.chapterTitle], updateMediaSession)

  return {
    ttsActive,
    ttsPaused,
    ttsState,
    sleepRemainingMs,
    edgeVoices,
    systemVoices,
    startTts,
    stopTts,
    pauseTts,
    resumeTts,
    setSleepTimer,
    handleTtsClick,
    loadVoices,
    injectHighlightStyles,
    buildSentences,
  }
}
