import WebSocket from 'ws'
import { randomUUID } from 'crypto'

export interface EdgeVoice {
  name: string
  shortName: string
}

export const EDGE_VOICES: EdgeVoice[] = [
  { name: 'Xiaoxiao (Female - default)', shortName: 'zh-CN-XiaoxiaoNeural' },
  { name: 'Yunxi (Male - energetic)', shortName: 'zh-CN-YunxiNeural' },
  { name: 'Yunjian (Male - sports/news)', shortName: 'zh-CN-YunjianNeural' },
  { name: 'Xiaoyi (Female - cartoon)', shortName: 'zh-CN-XiaoyiNeural' },
  { name: 'Yunxia (Male - boy)', shortName: 'zh-CN-YunxiaNeural' },
  { name: 'Xiaojian (Female - calm)', shortName: 'zh-CN-XiaojianNeural' },
  { name: 'Xiaorui (Female - senior)', shortName: 'zh-CN-XiaoruiNeural' }
]

export async function synthesizeEdgeTTS(
  text: string,
  voice: string = 'zh-CN-XiaoxiaoNeural',
  rate: number = 1.0,
  pitch: string = '+0Hz'
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const wsUrl = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4'
      const ws = new WebSocket(wsUrl)
      
      const audioChunks: Buffer[] = []
      let rateStr = rate >= 1.0 ? `+${((rate - 1.0) * 100).toFixed(0)}%` : `${((rate - 1.0) * 100).toFixed(0)}%`
      if (rateStr === '+0%') rateStr = '+0.00%'

      // Timeout: reject if no response within 30s
      const timeout = setTimeout(() => {
        try { ws.close() } catch (_) {}
        reject(new Error('Edge TTS timeout'))
      }, 30000)

      ws.on('open', () => {
        // 1. send speech config
        const configMsg = `X-Timestamp:${Date.now()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataOptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
        ws.send(configMsg)
        
        // 2. send ssml
        const reqId = randomUUID().replace(/-/g, '')
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${rateStr}' pitch='${pitch}'>${text}</prosody></voice></speak>`
        const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${Date.now()}Z\r\nPath:ssml\r\n\r\n${ssml}`
        ws.send(ssmlMsg)
      })

      ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (!isBinary) {
          // Text message
          const str = data.toString('utf8')
          if (str.includes('Path:turn.end')) {
            clearTimeout(timeout)
            ws.close()
            const result = Buffer.concat(audioChunks)
            console.log(`[EdgeTTS] Done. Audio chunks: ${audioChunks.length}, total bytes: ${result.length}`)
            resolve(result)
          }
        } else {
          // Binary message — extract audio payload after the header
          const buf = Buffer.from(data as ArrayBuffer)
          if (buf.length >= 2) {
            const headerLen = buf.readUInt16BE(0)
            const payloadStart = 2 + headerLen
            if (buf.length > payloadStart) {
              audioChunks.push(buf.subarray(payloadStart))
            }
          }
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        console.error('[EdgeTTS] WebSocket error:', err)
        reject(err)
      })

      ws.on('close', () => {
        clearTimeout(timeout)
      })

    } catch (e) {
      reject(e)
    }
  })
}
