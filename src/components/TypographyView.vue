<script setup lang="ts">
import { ref } from 'vue'
import { useSettings } from '../composables/useSettings'
import { useTheme } from '../composables/useTheme'

const settings = useSettings()
const {
  fontSize, lineHeight, letterSpacing, fontWeight, marginX, marginY,
  fontFamily, fontColor, coverColor, bgImage, blurAmount,
  textAlign, alignBottom, pageMode, doublePageStep,
  flipMode, pIndent, pSpacing, chapterTitleDisplay,
  customThemes, saveAllStyling, saveSetting
} = settings

const {
  newThemeName, applyThemeConfig, saveTheme, deleteTheme, readerBgStyle
} = useTheme({ onStyleChanged: () => { saveAllStyling() } })

const bgPreview = ref(bgImage.value)

const browseImage = async () => {
  const p = await window.electronAPI.dialog.openImage()
  if (p) {
    const url = 'file:///' + p.replace(/\\/g, '/')
    bgImage.value = url
    bgPreview.value = url
    saveSetting('bgImage', url)
  }
}

const applyBgImage = async () => {
  let v = bgImage.value.trim()
  if (v && !v.startsWith('file://') && !v.startsWith('http')) {
    v = 'file:///' + v.replace(/\\/g, '/')
  }
  bgImage.value = v
  bgPreview.value = v
  await saveSetting('bgImage', v)
}

const clearBgImage = async () => {
  bgImage.value = ''
  bgPreview.value = ''
  await saveSetting('bgImage', '')
}
</script>

<template>
  <div class="pt-2 pb-20">
    <div class="mb-10 px-1">
      <h2 class="app-title text-[22px] font-semibold">排版与预览</h2>
      <p class="app-muted text-[13px] mt-1">全局控制阅读引擎的文字排版、视觉主题与页面布局</p>
    </div>

    <!-- Preview Box -->
    <div class="mb-8">
      <h3 class="app-section-label text-[14px] mb-3 px-1">阅读引擎实时效果映射</h3>
          <div class="app-card p-10 overflow-hidden relative"
               :style="readerBgStyle">
         <div class="absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-[2px]" v-if="bgPreview && blurAmount > 0"></div>
         <div class="relative z-10 prose mx-auto break-words"
              :style="({ 
                fontSize: fontSize + 'px', 
                lineHeight: Number(lineHeight),
                letterSpacing: letterSpacing + 'em',
                fontWeight: Number(fontWeight),
                fontFamily: fontFamily,
                color: fontColor,
                textAlign: textAlign,
                textIndent: pIndent + 'em',
                columnCount: pageMode === 'double' ? 2 : 1,
                columnGap: pageMode === 'double' ? '3rem' : 'normal'
              } as any)">
            <h1 v-if="chapterTitleDisplay !== 'none'" class="font-bold mb-10 opacity-70" :style="{ fontSize: (fontSize * 1.4) + 'px', color: fontColor, textAlign: chapterTitleDisplay }">第一章 深渊的呼唤</h1>
            <p :style="{ marginBottom: pSpacing + 'em' }">随着一阵白光闪过，这片死寂的空间里突然多出了几分鲜活的生气。他睁开眼睛，环顾四周，这不仅仅是单纯视觉的反馈，那股厚重潮湿的空气顺着鼻腔直达肺部。</p>
            <p :style="{ marginBottom: pSpacing + 'em' }">"就是这里了吗？"他低声喃喃自语，目光落在了远处那座隐约可见的轮廓上。那是一座高塔，直入云霄，仿佛要刺破这令人窒息的天穹。</p>
            <p :style="{ marginBottom: pSpacing + 'em' }">排版，是电子阅读体验的至高灵魂。优秀的字阶、充裕的行高以及恰到好处的缩进，能够最大程度地降低读者的视觉疲劳。</p>
         </div>
      </div>
    </div>

    <!-- 背景壁纸 -->
    <div class="mb-8">
      <h3 class="app-section-label text-[14px] mb-3 px-1">阅读背景壁纸</h3>
      <div class="app-card p-4">
        <div class="flex gap-2 mb-3">
          <input type="text" v-model="bgImage" placeholder="在此键入图片绝对路径..." class="app-input flex-1 px-3 py-1.5 text-[13px]" />
          <button @click="browseImage" class="app-button px-4 py-1.5 text-[13px]">📂 浏览</button>
          <button @click="applyBgImage" class="app-button app-button-primary px-4 py-1.5 text-[13px]">应用</button>
          <button v-if="bgImage" @click="clearBgImage" class="app-button app-button-danger px-4 py-1.5 text-[13px]">清除</button>
        </div>
        <div v-if="bgPreview" class="relative w-full max-w-sm h-32 rounded-[var(--app-radius-input)] overflow-hidden border border-[var(--app-border)]">
          <img :src="bgPreview" class="w-full h-full object-cover" alt="背景预览" @error="bgPreview = ''" />
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div class="mb-8">
      <h3 class="app-section-label text-[14px] mb-3 px-1">文字排版参数</h3>
      <div class="app-card app-divide-y">
         
         <!-- Font Size -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">A</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>全局正文字号 (Font Size)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ fontSize }}px</span>
              </div>
              <input type="range" v-model.number="fontSize" min="12" max="64" step="1" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Font Weight -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">B</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>字重 (Font Weight)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ fontWeight }}</span>
              </div>
              <input type="range" v-model.number="fontWeight" min="100" max="900" step="1" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Line Height -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">↕</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>行间距 (Line Height)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ Number(lineHeight).toFixed(1) }}</span>
              </div>
              <input type="range" v-model.number="lineHeight" min="1.0" max="4.0" step="0.1" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Letter Spacing -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">↔</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>字间距 (Letter Spacing)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ Number(letterSpacing).toFixed(2) }}em</span>
              </div>
              <input type="range" v-model.number="letterSpacing" min="-0.1" max="1" step="0.01" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Paragraph Indent -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">⇥</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>首行缩进 (Indent)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ pIndent }}em</span>
              </div>
              <input type="range" v-model.number="pIndent" min="0" max="4" step="0.5" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Paragraph Spacing -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">⤓</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>段落间距 (Spacing)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ Number(pSpacing).toFixed(1) }}em</span>
              </div>
              <input type="range" v-model.number="pSpacing" min="0" max="3" step="0.1" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Margin X -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">⇔</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>左右边距 (Horizontal Margin)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ marginX }}px</span>
              </div>
              <input type="range" v-model.number="marginX" min="0" max="200" step="1" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Margin Y -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">⇕</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>上下边距 (Vertical Margin)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ marginY }}px</span>
              </div>
              <input type="range" v-model.number="marginY" min="0" max="150" step="1" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

         <!-- Blur -->
         <div class="p-4 app-row">
          <div class="flex items-start gap-4">
            <span class="text-xl opacity-80 mt-0.5">🔅</span>
            <div class="flex-1 w-full max-w-md">
              <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex justify-between">
                <span>背景模糊 (Blur)</span>
                <span class="text-emerald-500 dark:text-emerald-400 font-mono">{{ blurAmount }}px</span>
              </div>
              <input type="range" v-model.number="blurAmount" min="0" max="40" step="1" @change="saveAllStyling" class="w-full mt-3 h-1.5 bg-black/10 dark:bg-black/40 rounded-full appearance-none cursor-pointer accent-[#005fb8]" />
            </div>
          </div>
         </div>

      </div>
    </div>

    <!-- Color & Alignment -->
    <div class="mb-8">
      <h3 class="app-section-label text-[14px] mb-3 px-1">颜色与对齐</h3>
      <div class="app-card app-divide-y">

         <!-- Font Color -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">🎨</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">字体颜色</div>
            <input type="color" v-model="fontColor" @input="saveAllStyling" class="w-8 h-8 rounded cursor-pointer border-0" />
            <input type="text" v-model="fontColor" @change="saveAllStyling" class="w-20 bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-2 py-1 text-[12px] font-mono text-slate-800 dark:text-white/90 outline-none" />
          </div>
         </div>

         <!-- Cover Color -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">🖌️</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">翻页底色</div>
            <input type="color" v-model="coverColor" @input="saveAllStyling" class="w-8 h-8 rounded cursor-pointer border-0" />
            <input type="text" v-model="coverColor" @change="saveAllStyling" class="w-20 bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-2 py-1 text-[12px] font-mono text-slate-800 dark:text-white/90 outline-none" />
          </div>
         </div>

         <!-- Text Align -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">📐</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">文字对齐</div>
            <div class="flex gap-2">
              <button @click="textAlign='left'; saveAllStyling()" :class="textAlign==='left' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">靠左</button>
              <button @click="textAlign='justify'; saveAllStyling()" :class="textAlign==='justify' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">两端</button>
            </div>
          </div>
         </div>

         <!-- Chapter Title Align -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">🔖</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">章节标题</div>
            <div class="flex gap-2">
              <button @click="chapterTitleDisplay='left'; saveAllStyling()" :class="chapterTitleDisplay==='left' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">靠左</button>
              <button @click="chapterTitleDisplay='center'; saveAllStyling()" :class="chapterTitleDisplay==='center' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">居中</button>
              <button @click="chapterTitleDisplay='none'; saveAllStyling()" :class="chapterTitleDisplay==='none' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">隐藏</button>
            </div>
          </div>
         </div>

         <!-- Vertical Align -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">⬇️</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">垂直对齐</div>
            <div class="flex gap-2">
              <button @click="alignBottom=false; saveAllStyling()" :class="!alignBottom ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">靠上</button>
              <button @click="alignBottom=true; saveAllStyling()" :class="alignBottom ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">靠底</button>
            </div>
          </div>
         </div>

      </div>
    </div>

    <!-- Page Layout -->
    <div class="mb-8">
      <h3 class="app-section-label text-[14px] mb-3 px-1">页面布局</h3>
      <div class="app-card app-divide-y">

         <!-- Page Mode -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">📖</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">视图模式</div>
            <div class="flex gap-2">
              <button @click="pageMode='single'; saveAllStyling()" :class="pageMode==='single' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">单页</button>
              <button @click="pageMode='double'; saveAllStyling()" :class="pageMode==='double' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">双页(横屏)</button>
            </div>
          </div>
         </div>

         <!-- Flip Mode -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">📄</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">翻页效果</div>
            <div class="flex gap-2">
              <button @click="flipMode='slide'; saveAllStyling()" :class="flipMode==='slide' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">平移</button>
              <button @click="flipMode='cover'; saveAllStyling()" :class="flipMode==='cover' ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">覆盖</button>
            </div>
          </div>
         </div>

         <!-- Double Page Step -->
         <div v-if="pageMode==='double'" class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">📑</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">翻页步长</div>
            <div class="flex gap-2">
              <button @click="doublePageStep=1; saveAllStyling()" :class="doublePageStep===1 ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">1页</button>
              <button @click="doublePageStep=2; saveAllStyling()" :class="doublePageStep===2 ? 'bg-[#005fb8] text-white border-[#005fb8]' : 'bg-black/5 dark:bg-black/20 text-slate-800 dark:text-white/90 border-black/5 dark:border-white/5'" class="px-4 py-1.5 rounded-md text-[13px] font-medium border transition-colors">2页</button>
            </div>
          </div>
         </div>

      </div>
    </div>

    <!-- 自定义主题 -->
    <div class="mb-8">
      <h3 class="app-section-label text-[14px] mb-3 px-1">自定义主题</h3>
      <div class="app-card app-divide-y">

         <!-- Save current -->
         <div class="p-4 app-row">
          <div class="flex items-center gap-4">
            <span class="text-xl opacity-80">💾</span>
            <div class="text-[14px] font-medium text-slate-800 dark:text-white/90 flex-1">保存当前配置为主题</div>
          </div>
          <div class="flex gap-2 mt-3 ml-9">
            <input type="text" v-model="newThemeName" placeholder="输入主题名称..." class="flex-1 bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-3 py-1.5 text-[13px] focus:border-[#005fb8] outline-none transition-colors text-slate-800 dark:text-white/90" />
            <button @click="saveTheme" :disabled="!newThemeName.trim()" class="px-4 py-1.5 bg-[#005fb8] hover:bg-[#005fb8]/90 text-white rounded-md text-[13px] transition-colors font-medium disabled:opacity-30 disabled:cursor-default">保存</button>
          </div>
         </div>

         <!-- Saved themes list -->
         <div v-if="customThemes.length > 0" class="p-4">
          <div class="text-[13px] text-slate-500 dark:text-white/50 mb-3">已保存的主题</div>
          <div class="flex flex-wrap gap-2">
            <div v-for="t in customThemes" :key="t.id" class="flex items-center bg-black/5 dark:bg-black/20 rounded-lg overflow-hidden border border-black/5 dark:border-white/[0.06] transition-all hover:border-[#005fb8]/30">
              <button @click="applyThemeConfig(t)" class="px-3 py-1.5 text-[13px] font-medium text-slate-700 dark:text-white/80 hover:text-[#005fb8] dark:hover:text-[#60cdff] transition-colors">{{ t.name }}</button>
              <button @click="deleteTheme(t.id)" class="px-2 py-1.5 text-[12px] text-red-400/60 hover:text-red-500 hover:bg-red-500/10 border-l border-black/5 dark:border-white/[0.06] transition-colors">✕</button>
            </div>
          </div>
         </div>

      </div>
    </div>

  </div>
</template>
