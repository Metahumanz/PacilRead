<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useSettings } from '../../composables/useSettings'

const { saveMiMoKey } = defineProps<{
  saveMiMoKey: () => void | Promise<void>
}>()

const settings = useSettings()
const { ttsEngine, ttsVoice, ttsRate, ttsMiMoApiKey, ttsMiMoVoice, saveTtsSettings } = settings

const TEST_TEXT = '这是一段测试文本朗读。祝你阅读愉快。'

const isTesting = ref(false)
const testStatus = ref('')

let testAudio: HTMLAudioElement | null = null
let testAudioUrl: string | null = null
let testAudioCtx: AudioContext | null = null
let nextChunkTime = 0
let offMimoChunk: (() => void) | null = null
let offMimoDone: (() => void) | null = null
let offMimoError: (() => void) | null = null
const mimoSources: AudioBufferSourceNode[] = []

const ipcBufferToUint8Array = (buf: any): Uint8Array | null => {
  if (buf instanceof Uint8Array || buf instanceof ArrayBuffer) {
    return new Uint8Array(buf)
  }
  if (buf && typeof buf === 'object') {
    return new Uint8Array(Object.values(buf) as number[])
  }
  return null
}

const cleanupTestPlayback = (stopMimo = true) => {
  if (testAudio) {
    testAudio.pause()
    testAudio = null
  }
  if (testAudioUrl) {
    URL.revokeObjectURL(testAudioUrl)
    testAudioUrl = null
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  if (stopMimo) window.electronAPI.tts.stopMimo().catch(() => {})
  if (offMimoChunk) offMimoChunk()
  if (offMimoDone) offMimoDone()
  if (offMimoError) offMimoError()
  offMimoChunk = null
  offMimoDone = null
  offMimoError = null
  while (mimoSources.length > 0) {
    const source = mimoSources.pop()
    try { source?.stop() } catch (_) {}
    try { source?.disconnect() } catch (_) {}
  }
}

const finishTest = (message: string) => {
  isTesting.value = false
  testStatus.value = message
}

const playSystemTest = () => {
  return new Promise<void>((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('当前环境不支持系统朗读'))
      return
    }
    const utterance = new SpeechSynthesisUtterance(TEST_TEXT)
    if (ttsVoice.value) {
      const voice = window.speechSynthesis.getVoices().find((item) => item.name === ttsVoice.value)
      if (voice) utterance.voice = voice
    }
    utterance.rate = ttsRate.value
    utterance.onend = () => resolve()
    utterance.onerror = () => reject(new Error('系统朗读失败'))
    window.speechSynthesis.speak(utterance)
  })
}

const playEdgeTest = async () => {
  const res = await window.electronAPI.tts.synthesize(TEST_TEXT, ttsVoice.value || undefined, ttsRate.value)
  if (!res.success || !res.audioBuffer) {
    throw new Error(res.error || 'Edge 朗读合成失败')
  }

  const audioData = ipcBufferToUint8Array(res.audioBuffer)
  if (!audioData || audioData.length === 0) throw new Error('Edge 朗读返回空音频')

  const blob = new Blob([audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength) as ArrayBuffer], { type: 'audio/mpeg' })
  testAudioUrl = URL.createObjectURL(blob)
  testAudio = new Audio(testAudioUrl)

  await new Promise<void>((resolve, reject) => {
    if (!testAudio) {
      reject(new Error('音频初始化失败'))
      return
    }
    testAudio.onended = () => resolve()
    testAudio.onerror = () => reject(new Error('音频播放失败'))
    testAudio.play().catch(reject)
  })
}

const playMimoTest = async () => {
  const apiKey = ttsMiMoApiKey.value.trim()
  if (!apiKey) {
    testStatus.value = '请先填写 MiMo API Key'
    return
  }

  if (!testAudioCtx) testAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (testAudioCtx.state === 'suspended') await testAudioCtx.resume()
  nextChunkTime = testAudioCtx.currentTime

  await new Promise<void>((resolve, reject) => {
    offMimoChunk = window.electronAPI.tts.onMimoChunk((uint8: Uint8Array) => {
      if (!testAudioCtx || !isTesting.value) return

      const pcm16 = new Int16Array(uint8.buffer, uint8.byteOffset, uint8.byteLength / 2)
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768
      }

      const audioBuffer = testAudioCtx.createBuffer(1, float32.length, 24000)
      audioBuffer.copyToChannel(float32, 0)

      const source = testAudioCtx.createBufferSource()
      source.buffer = audioBuffer
      source.playbackRate.value = ttsRate.value
      source.connect(testAudioCtx.destination)
      mimoSources.push(source)

      const startTime = Math.max(testAudioCtx.currentTime, nextChunkTime)
      source.start(startTime)
      nextChunkTime = startTime + (audioBuffer.duration / ttsRate.value)
    })

    offMimoDone = window.electronAPI.tts.onMimoDone(() => {
      if (!testAudioCtx) {
        resolve()
        return
      }
      const waitTime = (nextChunkTime - testAudioCtx.currentTime) * 1000
      setTimeout(resolve, Math.max(0, waitTime))
    })

    offMimoError = window.electronAPI.tts.onMimoError((err: string) => {
      reject(new Error(err))
    })

    window.electronAPI.tts.startMimo(TEST_TEXT, apiKey, ttsMiMoVoice.value).catch(reject)
  })
}

const testTts = async () => {
  cleanupTestPlayback()
  isTesting.value = true
  testStatus.value = '测试朗读中...'

  ttsMiMoApiKey.value = ttsMiMoApiKey.value.trim()
  await saveMiMoKey()
  saveTtsSettings()

  if (ttsEngine.value === 'mimo' && !ttsMiMoApiKey.value) {
    finishTest('请先填写 MiMo API Key')
    cleanupTestPlayback(false)
    return
  }

  try {
    if (ttsEngine.value === 'system') await playSystemTest()
    else if (ttsEngine.value === 'edge') await playEdgeTest()
    else await playMimoTest()

    if (isTesting.value) finishTest('测试朗读完成')
  } catch (error) {
    finishTest(`测试朗读失败：${error instanceof Error ? error.message : String(error)}`)
  } finally {
    cleanupTestPlayback(false)
    if (isTesting.value) isTesting.value = false
  }
}

onUnmounted(() => {
  cleanupTestPlayback()
  if (testAudioCtx) {
    testAudioCtx.close().catch(() => {})
    testAudioCtx = null
  }
})
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">语音朗读</h3>
    <div class="app-card app-card-hover app-divide-y">
      <div class="p-4 app-row">
        <div class="flex items-start gap-4">
          <span class="text-xl opacity-80 mt-0.5">🎙️</span>
          <div class="flex-1">
            <div class="text-[14px] font-medium app-title">朗读设置</div>
            <div class="text-[12px] app-muted mt-0.5 mb-3">选择默认朗读引擎，并用短文本快速测试当前朗读效果</div>
            <div class="app-card app-card-strong p-4 space-y-3">
              <div>
                <label class="block text-[11px] app-muted mb-1">朗读引擎</label>
                <select v-model="ttsEngine" @change="saveTtsSettings" class="app-select w-full px-3 py-1.5 text-[12px]">
                  <option value="edge">Edge 云端</option>
                  <option value="system">本地系统</option>
                  <option value="mimo">小米 MiMo</option>
                </select>
              </div>
              <label class="block text-[11px] app-muted mb-1">API Key</label>
              <div class="flex gap-2">
                <input type="password" v-model="ttsMiMoApiKey" @change="saveMiMoKey" placeholder="在此输入您的 API Key..." class="app-input flex-1 px-3 py-1.5 text-[12px]" />
                <a href="https://platform.xiaomimimo.com/#/console/api-keys" target="_blank" class="app-button px-3 py-1.5 text-[11px] flex items-center">获取 Key</a>
              </div>
              <div class="flex flex-wrap items-center gap-3 pt-1">
                <button
                  @click="testTts"
                  :disabled="isTesting"
                  class="app-button app-button-primary px-4 py-1.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ isTesting ? '测试中...' : '测试朗读' }}
                </button>
                <span v-if="testStatus" class="text-[12px] app-muted">{{ testStatus }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
