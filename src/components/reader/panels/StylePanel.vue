<script setup lang="ts">
import { useSettings } from '../../../composables/useSettings'
import { useTheme } from '../../../composables/useTheme'
import { onBeforeUnmount } from 'vue'

const emit = defineEmits<{ (e: 'close'): void }>()
const { effectivePageMode, doublePageAvailable } = defineProps<{
  effectivePageMode: 'single' | 'double'
  doublePageAvailable: boolean
}>()

const settings = useSettings()
const {
  fontSize, lineHeight, letterSpacing, fontWeight, marginX, marginTop, marginBottom,
  fontFamily, fontColor, coverColor, textAlign,
  pageMode, doublePageStep, blurAmount, chapterTitleDisplay,
  customThemes, systemFonts, saveAllStyling, pIndent, pSpacing
} = settings

const theme = useTheme({
  onStyleChanged: async () => {
    await flushStylingSave()
  }
})
const { newThemeName, applyThemeConfig, applyTheme, saveTheme, deleteTheme } = theme

let stylingSaveTimer: ReturnType<typeof setTimeout> | null = null

const flushStylingSave = async () => {
  if (stylingSaveTimer) clearTimeout(stylingSaveTimer)
  stylingSaveTimer = null
  await saveAllStyling()
}

const scheduleStylingSave = () => {
  if (stylingSaveTimer) clearTimeout(stylingSaveTimer)
  stylingSaveTimer = setTimeout(() => { stylingSaveTimer = null; void saveAllStyling() }, 350)
}

const closePanel = async () => {
  await flushStylingSave()
  emit('close')
}

const selectPageMode = async (mode: 'single' | 'double') => {
  if (mode === 'double' && !doublePageAvailable) return
  pageMode.value = mode
  await flushStylingSave()
}

onBeforeUnmount(() => { if (stylingSaveTimer) void flushStylingSave() })
</script>

<template>
  <div class="sty-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">排版设置</span><button @click="closePanel" class="px">✕</button></div>
    
    <div class="sr">
      <label>字体</label>
      <select v-model="fontFamily" @change="flushStylingSave" class="ss">
        <option value="system-ui">系统默认</option>
        <option value="serif">宋体</option>
        <option value="'Microsoft YaHei'">微软雅黑</option>
        <option v-for="f in systemFonts" :key="f" :value="`'${f}'`">{{ f }}</option>
      </select>
    </div>

    <div class="sr">
      <label>字色</label>
      <input type="color" v-model="fontColor" @input="scheduleStylingSave" @change="flushStylingSave" class="sc">
      <input type="text" v-model="fontColor" @change="flushStylingSave" class="sn w72">
    </div>

    <div class="sr">
      <label>字号</label>
      <input type="range" min="12" max="64" step="1" v-model.number="fontSize" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="fontSize" @change="flushStylingSave" class="sn"><span class="su">px</span>
    </div>

    <div class="sr">
      <label>字重</label>
      <input type="range" min="100" max="900" step="1" v-model.number="fontWeight" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="fontWeight" @change="flushStylingSave" class="sn"><small class="sw-note">*取决于字体</small>
    </div>

    <div class="sr">
      <label>行间距</label>
      <input type="range" min="1" max="4" step="0.1" v-model.number="lineHeight" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="lineHeight" step="0.1" @change="flushStylingSave" class="sn">
    </div>

    <div class="sr">
      <label>字间距</label>
      <input type="range" min="-0.1" max="1" step="0.01" v-model.number="letterSpacing" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="letterSpacing" step="0.01" @change="flushStylingSave" class="sn"><span class="su">em</span>
    </div>

    <div class="sr">
      <label>左右边距</label>
      <input type="range" min="0" max="200" step="1" v-model.number="marginX" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="marginX" @change="flushStylingSave" class="sn"><span class="su">px</span>
    </div>

    <div class="sr">
      <label>首行缩进</label>
      <input type="range" min="0" max="4" step="0.5" v-model.number="pIndent" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="pIndent" step="0.5" @change="flushStylingSave" class="sn"><span class="su">em</span>
    </div>

    <div class="sr">
      <label>段落间距</label>
      <input type="range" min="0" max="3" step="0.1" v-model.number="pSpacing" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="pSpacing" step="0.1" @change="flushStylingSave" class="sn"><span class="su">em</span>
    </div>

    <div class="sr">
      <label>上边距</label>
      <input type="range" min="0" max="150" step="1" v-model.number="marginTop" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="marginTop" @change="flushStylingSave" class="sn"><span class="su">px</span>
    </div>

    <div class="sr">
      <label>下边距</label>
      <input type="range" min="0" max="150" step="1" v-model.number="marginBottom" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="marginBottom" @change="flushStylingSave" class="sn"><span class="su">px</span>
    </div>

    <div class="sr">
      <label>翻页底色</label>
      <input type="color" v-model="coverColor" @input="scheduleStylingSave" @change="flushStylingSave" class="sc">
      <input type="text" v-model="coverColor" @change="flushStylingSave" class="sn w72">
      <small class="sw-note">*有背景图时自动适配</small>
    </div>

    <div class="sr">
      <label>背景模糊</label>
      <input type="range" min="0" max="40" step="1" v-model.number="blurAmount" @input="scheduleStylingSave" @change="flushStylingSave" class="sl">
      <input type="number" v-model.number="blurAmount" @change="flushStylingSave" class="sn"><span class="su">px</span>
    </div>

    <div class="sr">
      <label>文字对齐</label>
      <div class="btn-group">
        <button @click="textAlign='left'; flushStylingSave()" :class="{active: textAlign==='left'}">靠左对齐</button>
        <button @click="textAlign='justify'; flushStylingSave()" :class="{active: textAlign==='justify'}">两端对齐</button>
      </div>
    </div>

    <div class="sr">
      <label>章节标题</label>
      <div class="btn-group">
        <button @click="chapterTitleDisplay='left'; flushStylingSave()" :class="{active: chapterTitleDisplay==='left'}">靠左</button>
        <button @click="chapterTitleDisplay='center'; flushStylingSave()" :class="{active: chapterTitleDisplay==='center'}">居中</button>
        <button @click="chapterTitleDisplay='none'; flushStylingSave()" :class="{active: chapterTitleDisplay==='none'}">隐藏</button>
      </div>
    </div>

    <div class="sp-divider"></div>

    <div class="sr">
      <label>视图模式</label>
      <div class="btn-group">
        <button @click="selectPageMode('single')" :class="{active: effectivePageMode==='single'}">单页</button>
        <button @click="selectPageMode('double')" :disabled="!doublePageAvailable" :class="{active: effectivePageMode==='double'}" :title="doublePageAvailable ? '' : '双页仅在横屏时可用'">双页(横屏)</button>
      </div>
    </div>

    <p v-if="!doublePageAvailable" class="orientation-note">当前为竖屏，已自动使用单页；恢复横屏后会按原偏好显示。</p>

    <div class="sr" v-if="effectivePageMode==='double'">
      <label>翻页步长</label>
      <div class="btn-group">
        <button @click="doublePageStep=1; flushStylingSave()" :class="{active: doublePageStep===1}">1页</button>
        <button @click="doublePageStep=2; flushStylingSave()" :class="{active: doublePageStep===2}">2页</button>
      </div>
    </div>

    <div class="sp-divider"></div>

    <div class="sr themes-sr">
      <label>预设主题</label>
      <div class="btn-group theme-btns">
        <button @click="applyTheme('dark')">深色</button>
        <button @click="applyTheme('paper')">纸控</button>
        <button @click="applyTheme('green')">护眼</button>
      </div>
    </div>

    <div class="sr themes-sr">
      <label>保存当前</label>
      <div class="flex-row">
        <input type="text" v-model="newThemeName" placeholder="新主题名称" class="sn flex-1" style="width: auto;">
        <button @click="saveTheme" class="s-btn">保存</button>
      </div>
    </div>

    <div class="sr themes-sr" v-if="customThemes.length > 0">
      <label>自定义</label>
      <div class="theme-list">
        <div v-for="t in customThemes" :key="t.id" class="theme-tag">
          <button @click="applyThemeConfig(t)" class="theme-n">{{ t.name }}</button>
          <button @click="deleteTheme(t.id)" class="theme-d">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sty-p { position:absolute; right:20px; top:60px; max-height: calc(100% - 180px); width:340px; overflow-y:auto; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); touch-action: pan-y; -webkit-overflow-scrolling: touch; }
.sty-p::-webkit-scrollbar { width:4px; }
.sty-p::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
.sr { display:flex; align-items:center; gap:10px; margin-bottom:16px; flex-wrap:wrap; }
.sr label { font-size:12px; font-weight:600; opacity:0.6; min-width:56px; flex-shrink:0; }
.sl { flex:1; height:4px; -webkit-appearance:none; appearance:none; background:rgba(255,255,255,0.1); border-radius:2px; outline:none; min-width:80px; }
.sl::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; background:white; border:2px solid #3b82f6; border-radius:50%; cursor:pointer; }
.sn { width:52px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:4px 6px; text-align:center; font-size:12px; font-family:monospace; color:white; outline:none; }
.sn:focus { border-color:#3b82f6; }
.sn.w72 { width:72px; }
.su { font-size:10px; opacity:0.3; font-family:monospace; min-width:20px; }
.ss { flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:8px 12px; font-size:13px; color:white; outline:none; cursor:pointer; }
.ss option { background:#0f172a; color:white; }
.sc { width:36px; height:30px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; background:transparent; cursor:pointer; padding:2px; }
.sw-note { font-size:10px; color:rgba(255,255,255,0.3); margin-left:4px; }
.sp-divider { height:1px; background:rgba(255,255,255,0.06); margin:20px 0; }
.btn-group { display:flex; gap:6px; flex:1; }
.btn-group button { flex:1; padding:6px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); color:white; font-size:12px; cursor:pointer; transition:all .2s; }
.btn-group button:hover { background:rgba(255,255,255,0.1); }
.btn-group button.active { background:#3b82f6; border-color:#3b82f6; font-weight:700; }
.btn-group button:disabled { opacity:.35; cursor:not-allowed; }
.orientation-note { margin:-7px 0 16px 66px; color:rgba(255,255,255,.42); font-size:10px; line-height:1.5; }
.theme-btns { flex-wrap:wrap; }
.theme-btns button { min-width:30%; }
.themes-sr { align-items:flex-start; }
.themes-sr label { margin-top:6px; }
.flex-row { display:flex; gap:8px; flex:1; }
.flex-1 { flex:1; }
.s-btn { padding:6px 12px; border-radius:8px; background:#3b82f6; border:none; color:white; font-size:12px; font-weight:700; cursor:pointer; transition:all .2s; }
.s-btn:hover { background:#2563eb; }
.theme-list { display:flex; flex-wrap:wrap; gap:8px; flex:1; }
.theme-tag { display:flex; align-items:center; background:rgba(255,255,255,0.08); border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); }
.theme-n { padding:4px 8px; font-size:11px; color:white; background:none; border:none; cursor:pointer; }
.theme-n:hover { background:rgba(255,255,255,0.1); }
.theme-d { padding:4px 6px; font-size:10px; color:rgba(239,68,68,0.7); background:none; border:none; border-left:1px solid rgba(255,255,255,0.1); cursor:pointer; }
.theme-d:hover { background:rgba(239,68,68,0.2); color:#ef4444; }
</style>
