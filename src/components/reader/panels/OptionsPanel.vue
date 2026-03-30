<script setup lang="ts">
import { ref } from 'vue'
import { useSettings } from '../../../composables/useSettings'

defineEmits<{
  (e: 'close'): void
}>()

const settings = useSettings()
const {
  sliderMode, flipMode, saveSetting, saveAllStyling,
  hudTopLeft, hudTopCenter, hudTopRight,
  hudBottomLeft, hudBottomCenter, hudBottomRight
} = settings

const showHudSettings = ref(false)

const hudOptions = [
  { value: 'none', label: '隐藏' },
  { value: 'bookTitle', label: '书名' },
  { value: 'chapterTitle', label: '章节名' },
  { value: 'titleOrChapter', label: '书名/章节名' },
  { value: 'currentTime', label: '现在时间' },
  { value: 'batteryLevel', label: '系统电量' },
  { value: 'chapterPage', label: '本章页数' },
  { value: 'bookProgress', label: '全书进度' },
  { value: 'pageAndProgress', label: '页数及进度' },
  { value: 'timeAndBattery', label: '时间及电量' },
]

const setFlipMode = (mode: 'slide' | 'cover' | 'curl') => {
  flipMode.value = mode
  saveSetting('reader_flipMode', mode)
}
</script>

<template>
  <div class="reader-options-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">阅读选项</span><button @click="$emit('close')" class="px">✕</button></div>
    
    <div class="sr">
      <label>进度调节</label>
      <div class="btn-group">
        <button @click="sliderMode='book'" :class="{active: sliderMode==='book'}">全书章节</button>
        <button @click="sliderMode='chapter'" :class="{active: sliderMode==='chapter'}">本章页数</button>
      </div>
    </div>

    <div class="sr">
      <label>翻页效果</label>
      <div class="btn-group">
        <button @click="setFlipMode('slide')" :class="{active: flipMode==='slide'}">平移</button>
        <button @click="setFlipMode('cover')" :class="{active: flipMode==='cover'}">覆盖</button>
        <button @click="setFlipMode('curl')" :class="{active: flipMode==='curl'}">仿真</button>
      </div>
    </div>

    <div class="sp-divider"></div>

    <div class="flex justify-center mt-4">
      <button @click="showHudSettings = !showHudSettings" class="px-8 py-3 rounded-xl font-bold transition-all shadow-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30">
        {{ showHudSettings ? '✕ 关闭 HUD 设置' : '⚙️ HUD 显示设置' }}
      </button>
    </div>

    <!-- Nested HUD Settings -->
    <Transition name="sf">
      <div v-if="showHudSettings" class="mt-6 pt-6 border-t border-white/5">
        <div class="hud-grid">
          <div class="hud-item">
            <label>左上</label>
            <select v-model="hudTopLeft" @change="saveAllStyling()" class="ss">
              <option v-for="opt in hudOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="hud-item">
            <label>中上</label>
            <select v-model="hudTopCenter" @change="saveAllStyling()" class="ss">
              <option v-for="opt in hudOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="hud-item">
            <label>右上</label>
            <select v-model="hudTopRight" @change="saveAllStyling()" class="ss">
              <option v-for="opt in hudOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="hud-item">
            <label>左下</label>
            <select v-model="hudBottomLeft" @change="saveAllStyling()" class="ss">
              <option v-for="opt in hudOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="hud-item">
            <label>中下</label>
            <select v-model="hudBottomCenter" @change="saveAllStyling()" class="ss">
              <option v-for="opt in hudOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
          <div class="hud-item">
            <label>右下</label>
            <select v-model="hudBottomRight" @change="saveAllStyling()" class="ss">
              <option v-for="opt in hudOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.reader-options-p { position:absolute; right:20px; bottom:80px; width:300px; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.15); border-radius:16px; padding:20px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
.sr { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.sr label { font-size:12px; font-weight:600; opacity:0.6; min-width:56px; flex-shrink:0; }
.btn-group { display:flex; gap:6px; flex:1; }
.btn-group button { flex:1; padding:6px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:white; font-size:12px; cursor:pointer; transition:all .2s; }
.btn-group button:hover { background:rgba(255,255,255,0.1); }
.btn-group button.active { background:#3b82f6; border-color:#3b82f6; font-weight:700; }
.sp-divider { height:1px; background:rgba(255,255,255,0.06); margin:20px 0; }
.hud-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
.hud-item { display: flex; flex-direction: column; gap: 4px; }
.hud-item label { font-size: 11px; opacity: 0.6; padding-left: 4px; }
.hud-item .ss { width: 100%; height: 32px; font-size: 12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white; padding:0 8px; outline:none; }
.sf-enter-active,.sf-leave-active { transition:all .3s ease; }
.sf-enter-from { opacity:0; transform:translateY(12px); }
.sf-leave-to { opacity:0; transform:translateY(12px); }
</style>
