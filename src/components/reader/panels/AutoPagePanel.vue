<script setup lang="ts">
import { useSettings } from '../../../composables/useSettings'

defineProps<{
  autoPageActive: boolean
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'toggle'): void
}>()

const settings = useSettings()
const { autoPageSpeed, flipSpeed, saveTtsSettings, saveSetting } = settings

const setFlipSpeed = (speed: 'fast' | 'medium' | 'slow') => {
  flipSpeed.value = speed
  saveSetting('reader_flipSpeed', speed)
}
</script>

<template>
  <div class="sty-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">自动翻页</span><button @click="$emit('close')" class="px">✕</button></div>
    <div class="sr">
      <label>翻页速度</label>
      <input type="range" min="1" max="30" step="1" v-model.number="autoPageSpeed" @change="saveTtsSettings" class="sl">
      <input type="number" v-model.number="autoPageSpeed" @change="saveTtsSettings" class="sn"><span class="su">秒</span>
    </div>
    <div class="sr">
      <label>动画耗时</label>
      <div class="btn-group">
        <button @click="setFlipSpeed('fast')" :class="{ active: flipSpeed === 'fast' }">偏快</button>
        <button @click="setFlipSpeed('medium')" :class="{ active: flipSpeed === 'medium' }">默认</button>
        <button @click="setFlipSpeed('slow')" :class="{ active: flipSpeed === 'slow' }">偏慢</button>
      </div>
    </div>
    <div class="flex justify-center mt-4">
      <button @click="$emit('toggle')" class="px-8 py-3 rounded-xl font-bold transition-all shadow-lg" :class="autoPageActive ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 border border-indigo-500/30'">
        {{ autoPageActive ? '⏹ 停止自动翻页' : '▶ 开始自动翻页' }}
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
.btn-group { display:flex; gap:6px; flex:1; }
.btn-group button { flex:1; padding:6px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:white; font-size:12px; cursor:pointer; transition:all .2s; }
.btn-group button:hover { background:rgba(255,255,255,0.1); }
.btn-group button.active { background:#3b82f6; border-color:#3b82f6; font-weight:700; }
</style>
