<script setup lang="ts">
import { useSettings } from '../../../composables/useSettings'
import { MIMO_TTS_VOICES } from '../../../data/mimoTts'

defineProps<{
  ttsActive: boolean
  edgeVoices: any[]
  systemVoices: any[]
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'start'): void
  (e: 'stop'): void
}>()

const settings = useSettings()
const { ttsEngine, ttsVoice, ttsRate, highlightColor, ttsMiMoVoice, saveTtsSettings } = settings
</script>

<template>
  <div class="sty-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">听书设置</span><button @click="$emit('close')" class="px">✕</button></div>
    <div class="sr">
      <label>选择引擎</label>
      <div class="btn-group">
        <button @click="ttsEngine='edge'; saveTtsSettings()" :class="{active: ttsEngine==='edge'}">Edge 云端</button>
        <button @click="ttsEngine='system'; saveTtsSettings()" :class="{active: ttsEngine==='system'}">本地系统</button>
        <button @click="ttsEngine='mimo'; saveTtsSettings()" :class="{active: ttsEngine==='mimo'}">小米 MiMo</button>
      </div>
    </div>
    <div class="sr">
      <label>发音人</label>
      <select v-if="ttsEngine==='edge'" v-model="ttsVoice" @change="saveTtsSettings" class="ss">
        <option value="">随机/默认 (Xiaoxiao)</option>
        <option v-for="v in edgeVoices" :key="v.shortName" :value="v.shortName">{{ v.name }}</option>
      </select>
      <select v-else-if="ttsEngine==='system'" v-model="ttsVoice" @change="saveTtsSettings" class="ss">
        <option value="">跟随系统默认</option>
        <option v-for="v in systemVoices" :key="v.name" :value="v.name">{{ v.name }} ({{ v.lang }})</option>
      </select>
      <select v-else v-model="ttsMiMoVoice" @change="saveTtsSettings" class="ss">
        <option v-for="v in MIMO_TTS_VOICES" :key="v.id" :value="v.id">{{ v.name }} ({{ v.gender }})</option>
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
      <button @click="$emit('start')" class="px-8 py-3 rounded-xl font-bold transition-all shadow-lg bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 hover:text-violet-300 border border-violet-500/30" v-if="!ttsActive">
        ▶ 开始听书
      </button>
      <button @click="$emit('stop')" class="px-8 py-3 rounded-xl font-bold transition-all shadow-lg bg-red-500/20 text-red-500 hover:bg-red-500/30" v-else>
        ⏹ 停止听书
      </button>
    </div>
  </div>
</template>

<style scoped>
.sty-p { position:absolute; right:20px; top:60px; max-height: calc(100% - 180px); width:340px; overflow-y:auto; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); touch-action: pan-y; -webkit-overflow-scrolling: touch; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
.sr { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.sr label { font-size:12px; font-weight:600; opacity:0.6; min-width:56px; flex-shrink:0; }
.sl { flex:1; height:4px; -webkit-appearance:none; appearance:none; background:rgba(255,255,255,0.1); border-radius:2px; outline:none; min-width:80px; }
.sl::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; background:white; border:2px solid #3b82f6; border-radius:50%; cursor:pointer; }
.sn { width:52px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:4px 6px; text-align:center; font-size:12px; font-family:monospace; color:white; outline:none; }
.su { font-size:10px; opacity:0.3; font-family:monospace; min-width:20px; }
.ss { flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:8px 12px; font-size:13px; color:white; outline:none; cursor:pointer; }
.sc { width:36px; height:30px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; background:transparent; cursor:pointer; padding:2px; }
.ss-info { flex:1; padding:8px 12px; font-size:12px; color:rgba(255,255,255,0.4); font-style:italic; }
.sp-divider { height:1px; background:rgba(255,255,255,0.06); margin:20px 0; }
.btn-group { display:flex; gap:6px; flex:1; }
.btn-group button { flex:1; padding:6px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:white; font-size:12px; cursor:pointer; transition:all .2s; }
.btn-group button:hover { background:rgba(255,255,255,0.1); }
.btn-group button.active { background:#3b82f6; border-color:#3b82f6; font-weight:700; }
</style>
