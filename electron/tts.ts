import WebSocket from 'ws'
import { randomUUID, createHash, randomBytes } from 'crypto'

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

// Constants matching edge-tts Python library (rany2/edge-tts)
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0]
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`
const WIN_EPOCH = 11644473600
const S_TO_NS = 1e9

/**
 * Generate Sec-MS-GEC token matching the edge-tts Python DRM implementation.
 * Algorithm:
 *   1. Get current Unix timestamp
 *   2. Add Windows epoch offset (11644473600 seconds)
 *   3. Round down to nearest 5 minutes (300 seconds)
 *   4. Convert to 100-nanosecond intervals (Windows file time)
 *   5. Concatenate with trusted client token
 *   6. SHA256 hash -> uppercase hex
 */
function generateSecMsGec(): string {
  let ticks = Date.now() / 1000 // Unix timestamp in seconds
  ticks += WIN_EPOCH             // Convert to Windows file time epoch
  ticks -= ticks % 300           // Round down to nearest 5 minutes
  ticks *= S_TO_NS / 100         // Convert to 100-nanosecond intervals
  const strToHash = `${Math.floor(ticks)}${TRUSTED_CLIENT_TOKEN}`
  return createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase()
}

/**
 * Generate a random MUID (matching edge-tts DRM.generate_muid)
 */
function generateMuid(): string {
  return randomBytes(16).toString('hex').toUpperCase()
}

export async function synthesizeEdgeTTS(
  text: string,
  voice: string = 'zh-CN-XiaoxiaoNeural',
  rate: number = 1.0,
  pitch: string = '+0Hz'
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const connId = randomUUID().replace(/-/g, '')
      const gecToken = generateSecMsGec()
      const muid = generateMuid()
      
      const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${gecToken}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
      
      console.log(`[EdgeTTS] Connecting... GEC=${gecToken.substring(0, 12)}...`)
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'Pragma': 'no-cache',
          'Cache-Control': 'no-cache',
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cookie': `muid=${muid};`,
        },
        perMessageDeflate: true,
      })
      
      const audioChunks: Buffer[] = []
      let rateStr = rate >= 1.0 ? `+${((rate - 1.0) * 100).toFixed(0)}%` : `${((rate - 1.0) * 100).toFixed(0)}%`
      if (rateStr === '+0%') rateStr = '+0.00%'

      // Timeout: reject if no response within 30s
      const timeout = setTimeout(() => {
        try { ws.close() } catch (_) {}
        reject(new Error('Edge TTS timeout'))
      }, 30000)

      ws.on('open', () => {
        console.log('[EdgeTTS] WebSocket connected')
        // 1. send speech config
        const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
        ws.send(configMsg)
        
        // 2. send ssml
        const reqId = randomUUID().replace(/-/g, '')
        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${rateStr}' pitch='${pitch}'>${text}</prosody></voice></speak>`
        const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`
        ws.send(ssmlMsg)
      })

      ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (!isBinary) {
          const str = data.toString('utf8')
          if (str.includes('Path:turn.end')) {
            clearTimeout(timeout)
            ws.close()
            const result = Buffer.concat(audioChunks)
            console.log(`[EdgeTTS] Done. Audio chunks: ${audioChunks.length}, total bytes: ${result.length}`)
            resolve(result)
          }
        } else {
          // Binary message — extract audio payload after the 2-byte header length
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
        console.error('[EdgeTTS] WebSocket error:', err.message)
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

export async function synthesizeMimoStreaming(
  text: string,
  apiKey: string,
  onChunk: (chunk: Buffer) => void,
  onDone: () => void,
  onError: (err: any) => void,
  signal?: AbortSignal
) {
  try {
    const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'mimo-v2-tts',
        messages: [{ role: 'assistant', content: text }],
        audio: { format: 'pcm16', voice: 'mimo_default' },
        stream: true
      }),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`MiMo API Error (${response.status}): ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is empty');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.substring(6));
            const audioDataB64 = json.choices?.[0]?.delta?.audio?.data;
            if (audioDataB64) {
              const audioBuffer = Buffer.from(audioDataB64, 'base64');
              onChunk(audioBuffer);
            }
          } catch (e) {
            console.error('Error parsing MiMo SSE line:', e);
          }
        }
      }
    }
    onDone();
  } catch (err) {
    if ((err as any).name === 'AbortError') {
       console.log('[MiMo] Request aborted');
    } else {
       onError(err);
    }
  }
}
