import { ref, watch, type Ref } from 'vue'

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
  nextPage: () => void
  slideToNextChapter: () => void
}) {
  const ttsActive = ref(false)
  let isPlayingTts = false
  let ttsAudio: HTMLAudioElement | null = null
  let ttsGeneration = 0
  const ttsPrefetchCache = new Map<number, Promise<string | null>>()

  const edgeVoices = ref<any[]>([])
  const systemVoices = ref<SpeechSynthesisVoice[]>([])

  let audioCtx: AudioContext | null = null
  let nextChunkTime = 0

  let activeSentences: SentenceItem[] = []
  let currentSentenceIndex = 0

  // ---- Sentence extraction ----
  const getSentencesFromNode = (node: Node, sentences: SentenceItem[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || ''
      const regex = /[^ \n\t。！？.!?,，;；、]+[。！？.!?,，;；、]*/g
      let match
      while ((match = regex.exec(text)) !== null) {
        if (match[0].trim().length > 0) {
          const r = new Range()
          try {
            r.setStart(node, match.index)
            r.setEnd(node, match.index + match[0].length)
            sentences.push({ text: match[0], range: r })
          } catch (_) { }
        }
      }
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if ((node.childNodes[i] as HTMLElement).tagName?.toLowerCase() === 'rt') continue
        getSentencesFromNode(node.childNodes[i], sentences)
      }
    }
  }

  // ---- Highlight ----
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

  const injectHighlightStyles = () => {
    let styleEl = document.getElementById('tts-style') as HTMLStyleElement
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'tts-style'
      document.head.appendChild(styleEl)
    }
    styleEl.innerHTML = `::highlight(tts-highlight) { background-color: ${opts.highlightColor.value}40; color: ${opts.highlightColor.value}; border-radius: 4px; }`
  }

  watch(() => opts.highlightColor.value, injectHighlightStyles)

  // ---- IPC buffer conversion ----
  const ipcBufferToUint8Array = (buf: any): Uint8Array | null => {
    if (buf instanceof Uint8Array || buf instanceof ArrayBuffer) {
      return new Uint8Array(buf)
    } else if (buf && typeof buf === 'object') {
      return new Uint8Array(Object.values(buf) as number[])
    }
    return null
  }

  // ---- Synthesize ----
  const synthesizeToUrl = async (text: string): Promise<string | null> => {
    if (!text.trim()) return null
    try {
      const res = await (window as any).electronAPI.tts.synthesize(text, opts.ttsVoice.value || undefined, opts.ttsRate.value)
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

  const prefetchAhead = (fromIndex: number, count: number = 2) => {
    if (opts.ttsEngine.value !== 'edge') return
    for (let i = fromIndex; i < Math.min(fromIndex + count, activeSentences.length); i++) {
      if (!ttsPrefetchCache.has(i)) {
        ttsPrefetchCache.set(i, synthesizeToUrl(activeSentences[i].text))
      }
    }
  }

  // ---- Playback ----
  const playSystemTTS = (text: string) => {
    return new Promise<void>((resolve) => {
      if (!window.speechSynthesis) { resolve(); return }
      const u = new SpeechSynthesisUtterance(text)
      if (opts.ttsVoice.value && opts.ttsEngine.value === 'system') {
        const v = systemVoices.value.find(x => x.name === opts.ttsVoice.value)
        if (v) u.voice = v
      }
      u.rate = opts.ttsRate.value
      u.onend = () => resolve()
      u.onerror = () => resolve()
      window.speechSynthesis.speak(u)
    })
  }

  const playEdgeTTS = async (text: string, sentenceIdx: number) => {
    if (!text.trim()) return
    try {
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

  const playMimoTTS = async (sentences: SentenceItem[]) => {
    if (sentences.length === 0) return
    const originalText = sentences.map(s => s.text).join('')
    if (!originalText.trim()) return
    if (!opts.ttsMiMoApiKey.value) return 

    return new Promise<void>((resolve, reject) => {
      if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      if (audioCtx.state === 'suspended') audioCtx.resume()

      let playbackStartedAt = 0
      nextChunkTime = audioCtx.currentTime

      let offChunk: () => void
      let offDone: () => void
      let offError: () => void
      const highlightTimers: any[] = []

      const cleanup = () => {
        if (offChunk) offChunk()
        if (offDone) offDone()
        if (offError) offError()
        highlightTimers.forEach(t => clearTimeout(t))
      }

      offChunk = (window as any).electronAPI.tts.onMimoChunk((uint8: Uint8Array) => {
        if (!isPlayingTts || !audioCtx) return

        const pcm16 = new Int16Array(uint8.buffer, uint8.byteOffset, uint8.byteLength / 2)
        const float32 = new Float32Array(pcm16.length)
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 32768
        }

        const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000)
        audioBuffer.copyToChannel(float32, 0)

        const source = audioCtx.createBufferSource()
        source.buffer = audioBuffer
        source.playbackRate.value = opts.ttsRate.value
        source.connect(audioCtx.destination)

        const startTime = Math.max(audioCtx.currentTime, nextChunkTime)
        if (playbackStartedAt === 0) playbackStartedAt = startTime
        source.start(startTime)
        nextChunkTime = startTime + (audioBuffer.duration / opts.ttsRate.value)
      })

      offDone = (window as any).electronAPI.tts.onMimoDone(() => {
        if (!audioCtx) { cleanup(); resolve(); return }
        const totalDuration = nextChunkTime - playbackStartedAt
        if (totalDuration > 0) {
          const totalLength = originalText.length
          let cumulativeLength = 0
          
          for (let i = 1; i < sentences.length; i++) {
            cumulativeLength += sentences[i - 1].text.length
            const delay = (cumulativeLength / totalLength) * totalDuration * 1000
            const timer = setTimeout(() => {
              if (isPlayingTts) {
                highlightRange(sentences[i].range)
              }
            }, delay)
            highlightTimers.push(timer)
          }
        }

        const waitTime = (nextChunkTime - audioCtx.currentTime) * 1000
        setTimeout(() => {
          cleanup()
          resolve()
        }, Math.max(0, waitTime))
      })

      offError = (window as any).electronAPI.tts.onMimoError((err: string) => {
        cleanup()
        reject(new Error(err))
      })

      const cleanedText = originalText.replace(/[\(\)\[\]（））【】]/g, '"')
      ;(window as any).electronAPI.tts.startMimo(cleanedText, opts.ttsMiMoApiKey.value, opts.ttsMiMoVoice.value)
    })
  }

  const buildSentences = () => {
    activeSentences = []
    currentSentenceIndex = 0
    ttsPrefetchCache.clear()
    if (opts.contentRef.value) getSentencesFromNode(opts.contentRef.value, activeSentences)

    if (activeSentences.length > 0) {
      for (let i = 0; i < activeSentences.length; i++) {
        const rect = activeSentences[i].range.getBoundingClientRect()
        if (rect.right > 20 && rect.width > 0) {
          currentSentenceIndex = i
          break
        }
      }
    }
  }

  const isFullSentenceEnd = (text: string) => /.*[。！？!?]$/.test(text.trim())

  const playNextSentence = async () => {
    if (!isPlayingTts) return
    if (activeSentences.length === 0 || currentSentenceIndex >= activeSentences.length) {
      opts.slideToNextChapter()
      setTimeout(() => {
        buildSentences()
        playNextSentence()
      }, opts.flipDurationMs.value * 2)
      return
    }

    prefetchAhead(currentSentenceIndex + 1, 2)

    const item = activeSentences[currentSentenceIndex]
    const rect = item.range.getBoundingClientRect()

    const w = opts.containerWidth.value || window.innerWidth
    if (rect.left > w - 20) {
      opts.nextPage()
      await new Promise(res => setTimeout(res, opts.flipDurationMs.value + 50))
    }

    if (!isPlayingTts) return

    highlightRange(item.range)

    const myGen = ++ttsGeneration

    if (opts.ttsEngine.value === 'system') {
      await playSystemTTS(item.text)
      if (myGen === ttsGeneration && isPlayingTts) {
        currentSentenceIndex++
        playNextSentence()
      }
    } else if (opts.ttsEngine.value === 'edge') {
      await playEdgeTTS(item.text, currentSentenceIndex)
      if (myGen === ttsGeneration && isPlayingTts) {
        currentSentenceIndex++
        playNextSentence()
      }
    } else if (opts.ttsEngine.value === 'mimo') {
      const group: SentenceItem[] = [activeSentences[currentSentenceIndex]]
      let nextIdx = currentSentenceIndex + 1
      while (nextIdx < activeSentences.length) {
        if (isFullSentenceEnd(activeSentences[nextIdx - 1].text)) break
        group.push(activeSentences[nextIdx])
        nextIdx++
      }
      
      await playMimoTTS(group)
      
      if (myGen === ttsGeneration && isPlayingTts) {
        currentSentenceIndex += group.length
        playNextSentence()
      }
    }
  }

  // ---- Public API ----
  const startTts = () => {
    if (ttsActive.value) { stopTts(); return }
    if (opts.ttsEngine.value === 'mimo' && !opts.ttsMiMoApiKey.value) {
      return 'MIMO_KEY_MISSING'
    }
    ttsActive.value = true
    isPlayingTts = true
    buildSentences()
    prefetchAhead(currentSentenceIndex, 2)
    playNextSentence()
  }

  const stopTts = () => {
    ttsActive.value = false
    isPlayingTts = false
    if (ttsAudio) { ttsAudio.pause(); ttsAudio = null }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (opts.ttsEngine.value === 'mimo') {
      ; (window as any).electronAPI.tts.stopMimo()
    }
    clearHighlight()
    for (const [, p] of ttsPrefetchCache) {
      p.then(url => { if (url) URL.revokeObjectURL(url) })
    }
    ttsPrefetchCache.clear()
  }

  const handleTtsClick = (x: number, y: number): boolean => {
    if (!ttsActive.value) return false
    let found = -1
    for (let i = 0; i < activeSentences.length; i++) {
      const rects = activeSentences[i].range.getClientRects()
      for (let r = 0; r < rects.length; r++) {
        const rect = rects[r]
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          found = i; break
        }
      }
      if (found >= 0) break
    }
    if (found >= 0) {
      currentSentenceIndex = found
      if (ttsAudio) { ttsAudio.pause(); ttsAudio = null }
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      playNextSentence()
      return true
    }
    return false
  }

  const loadVoices = async () => {
    try { edgeVoices.value = await (window as any).electronAPI.tts.getEdgeVoices() } catch (e) { }

    const setSysVoices = () => { systemVoices.value = window.speechSynthesis.getVoices() }
    if (window.speechSynthesis) {
      systemVoices.value = window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = setSysVoices
    }
  }

  return {
    ttsActive,
    edgeVoices,
    systemVoices,
    startTts,
    stopTts,
    handleTtsClick,
    loadVoices,
    injectHighlightStyles,
    buildSentences,
  }
}
