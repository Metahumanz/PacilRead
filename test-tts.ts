import { synthesizeEdgeTTS } from './electron/tts';
import fs from 'fs';

async function main() {
  try {
    const audio = await synthesizeEdgeTTS('这里是测试语音识别的文字。', 'zh-CN-XiaoxiaoNeural');
    console.log('Audio length:', audio.length);
    if (audio.length > 0) {
      fs.writeFileSync('test.mp3', audio);
      console.log('Saved to test.mp3');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
main();
