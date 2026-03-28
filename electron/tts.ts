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
      
      const audioData: Buffer[] = []
      let rateStr = rate >= 1.0 ? `+${((rate - 1.0) * 100).toFixed(0)}%` : `${((rate - 1.0) * 100).toFixed(0)}%`
      if (rateStr === '+0%') rateStr = '+0.00%'

      ws.on('open', () => {
        // 1. send speech config
        const configTimestamp = new Date().getTime()
        const configMsg = `X-Timestamp:${configTimestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataOptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
        ws.send(configMsg)
        
        // 2. send ssml
        const reqId = randomUUID().replace(/-/g, '')
        const ssmlTimestamp = new Date().getTime()
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${rateStr}' pitch='${pitch}'>${text}</prosody></voice></speak>`
        const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ssmlTimestamp}Z\r\nPath:ssml\r\n\r\n${ssml}`
        ws.send(ssmlMsg)
      })

      ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (!isBinary) {
          const str = data.toString()
          if (str.includes('Path:turn.end')) {
            ws.close()
            resolve(Buffer.concat(audioData))
          }
        } else if (Buffer.isBuffer(data)) {
          // Parse binary payload
          const buf = Buffer.from(data)
          if (buf.length >= 2) {
            const headerLen = buf.readUInt16BE(0)
            if (buf.length > 2 + headerLen) {
              const payload = buf.subarray(2 + headerLen)
              audioData.push(payload)
            }
          }
        }
      })

      ws.on('error', (err) => {
        reject(err)
      })

    } catch (e) {
      reject(e)
    }
  })
}
