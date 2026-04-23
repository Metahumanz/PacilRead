export const MIMO_TTS_DEFAULT_VOICE = '冰糖'

export const MIMO_TTS_VOICES = [
  { id: '冰糖', name: '冰糖', gender: '女声' },
  { id: '茉莉', name: '茉莉', gender: '女声' },
  { id: '苏打', name: '苏打', gender: '男声' },
  { id: '白桦', name: '白桦', gender: '男声' },
] as const

const MIMO_TTS_VOICE_IDS = new Set<string>(MIMO_TTS_VOICES.map((voice) => voice.id))

export function isMimoTtsVoiceId(value: string): boolean {
  return MIMO_TTS_VOICE_IDS.has(value)
}
