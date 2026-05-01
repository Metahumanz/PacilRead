<script setup lang="ts">
import { ref, watch } from 'vue'
import { useSettings } from '../../../composables/useSettings'
import { useDataStore } from '../../../composables/useDataStore'

interface Book { id: number; title: string; author: string | null }

const props = defineProps<{
  book: Book | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update-book', data: { title: string; author: string }): void
}>()

const settings = useSettings()
const {
  sliderMode, flipMode, saveSetting, saveAllStyling,
  readerAutoNightEnabled, readerAutoNightCustomPolicy,
  hudTopLeft, hudTopCenter, hudTopRight,
  hudBottomLeft, hudBottomCenter, hudBottomRight
} = settings

// Book info editing
const editTitle = ref('')
const editAuthor = ref('')
let saveTimer: any = null

// Init from props
watch(() => props.book, (b) => {
  if (b) {
    editTitle.value = b.title || ''
    editAuthor.value = b.author || ''
  }
}, { immediate: true })

const saveBookInfo = () => {
  if (!props.book) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const title = editTitle.value.trim() || '未命名'
    const author = editAuthor.value.trim()
    try {
      const { updateBook } = useDataStore()
      await updateBook(props.book!.id, { title, author: author || null })
      emit('update-book', { title, author })
    } catch (e) {
      console.error('Save book info failed:', e)
    }
  }, 600)
}

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

const saveAutoNight = () => {
  saveSetting('reader_auto_night_enabled', readerAutoNightEnabled.value ? 'true' : 'false')
  saveSetting('reader_auto_night_custom_policy', readerAutoNightCustomPolicy.value)
}
</script>

<template>
  <div class="reader-options-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">阅读选项</span><button @click="$emit('close')" class="px">✕</button></div>

    <!-- Book info editing -->
    <div class="book-info-section">
      <div class="info-row">
        <label>书名</label>
        <input v-model="editTitle" @input="saveBookInfo" class="info-input" placeholder="输入书名" />
      </div>
      <div class="info-row">
        <label>作者</label>
        <input v-model="editAuthor" @input="saveBookInfo" class="info-input" placeholder="输入作者名" />
      </div>
    </div>

    <div class="sp-divider"></div>
    
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

    <div class="sr">
      <label>自动夜间</label>
      <div class="btn-group">
        <button @click="readerAutoNightEnabled=false; saveAutoNight()" :class="{active: !readerAutoNightEnabled}">关闭</button>
        <button @click="readerAutoNightEnabled=true; saveAutoNight()" :class="{active: readerAutoNightEnabled}">跟随系统</button>
      </div>
    </div>

    <div class="sr" v-if="readerAutoNightEnabled">
      <label>夜间策略</label>
      <div class="btn-group">
        <button @click="readerAutoNightCustomPolicy='preserve'; saveAutoNight()" :class="{active: readerAutoNightCustomPolicy==='preserve'}">保留主题</button>
        <button @click="readerAutoNightCustomPolicy='override'; saveAutoNight()" :class="{active: readerAutoNightCustomPolicy==='override'}">夜色覆盖</button>
      </div>
    </div>

    <div class="sp-divider"></div>

    <!-- HUD Settings (always shown) -->
    <div class="hud-section-title">HUD 显示</div>
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
</template>

<style scoped>
.reader-options-p { position:absolute; right:20px; bottom:80px; width:300px; max-height: calc(100vh - 200px); overflow-y: auto; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.15); border-radius:16px; padding:20px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; }
.reader-options-p::-webkit-scrollbar { width: 4px; }
.reader-options-p::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
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
.sp-divider { height:1px; background:rgba(255,255,255,0.06); margin:12px 0; }

.book-info-section { display: flex; flex-direction: column; gap: 10px; }
.info-row { display: flex; align-items: center; gap: 10px; }
.info-row label { font-size: 12px; font-weight: 600; opacity: 0.6; min-width: 32px; flex-shrink: 0; }
.info-input { flex: 1; height: 32px; font-size: 13px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; padding: 0 10px; outline: none; transition: border-color 0.2s; }
.info-input:focus { border-color: #3b82f6; }
.info-input::placeholder { color: rgba(255,255,255,0.25); }

.hud-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.4; margin-bottom: 10px; }
.hud-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.hud-item { display: flex; flex-direction: column; gap: 4px; }
.hud-item label { font-size: 11px; opacity: 0.6; padding-left: 4px; }
.hud-item .ss { width: 100%; height: 32px; font-size: 12px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:white; padding:0 8px; outline:none; }
</style>
