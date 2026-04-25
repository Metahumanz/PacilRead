<script setup lang="ts">
interface Book { id: number; title: string; author: string | null }
interface Chapter { id: number; title: string }

defineProps<{
  book: Book | null
  canOpenStats: boolean
  isAlwaysOnTop: boolean
  isImmersive: boolean
  showSearch: boolean
  showRules: boolean
  showStyling: boolean
  showAutoPage: boolean
  autoPageActive: boolean
  showTts: boolean
  ttsActive: boolean
  showToc: boolean
  showBookmarks: boolean
  showReaderOptions: boolean
  currentChapterIndex: number
  chapters: Chapter[]
  currentPage: number
  totalPages: number
  sliderMax: number
  sliderValue: number
  currentChapterTitle: string
}>()

defineEmits<{
  (e: 'back'): void
  (e: 'open-book-stats'): void
  (e: 'create-bookmark'): void
  (e: 'toggle-always-on-top'): void
  (e: 'toggle-immersive'): void
  (e: 'open-panel', panel: string): void
  (e: 'go-to-chapter', index: number): void
  (e: 'slider-input', val: number): void
}>()
</script>

<template>
  <div class="menu-ov">
    <div class="m-top" @click.stop>
      <button @click="$emit('back')" class="m-back">← 书架</button>
      <button
        v-if="canOpenStats"
        @click="$emit('open-book-stats')"
        class="m-title is-link"
        title="查看这本书的阅读统计"
      >
        {{ book?.title }}
      </button>
      <div v-else class="m-title">{{ book?.title }}</div>
      <div class="m-acts">
        <button @click="$emit('toggle-always-on-top')" class="m-capsule-btn" :class="{ 'is-active': isAlwaysOnTop }">
          <div class="mc-track"><div class="mc-thumb"></div></div>
          <span>置顶</span>
        </button>
        <button @click="$emit('toggle-immersive')" class="m-btn">{{ isImmersive ? '⊡ 退出全屏' : '⛶ 全屏' }}</button>
        <button @click="$emit('open-panel', 'search')" class="m-btn" :class="{ active: showSearch }">🔍 搜索</button>
        <button @click="$emit('open-panel', 'rules')" class="m-btn" :class="{ active: showRules }">📝 替换</button>
        <button @click="$emit('open-panel', 'styling')" class="m-btn" :class="{ active: showStyling }">Aa 排版</button>
        <button @click="$emit('create-bookmark')" class="m-btn">🔖 标记</button>
        <button @click="$emit('open-panel', 'bookmarks')" class="m-btn" :class="{ active: showBookmarks }">书签</button>
        <button @click="$emit('open-panel', 'autopage')" class="m-btn shadow-sm" :class="showAutoPage || autoPageActive ? 'bg-indigo-600/80 border-indigo-500 text-white' : ''">⏱ 翻页</button>
        <button @click="$emit('open-panel', 'tts')" class="m-btn shadow-sm" :class="showTts || ttsActive ? 'bg-violet-600/80 border-violet-500 text-white' : ''">🎧 听书</button>
      </div>
    </div>

    <div class="m-bot" @click.stop>
      <button @click="$emit('go-to-chapter', currentChapterIndex - 1)" :disabled="currentChapterIndex === 0" class="m-ch">⏮ 上一章</button>
      <div class="m-prog">
        <input type="range" min="0" :max="sliderMax" :value="sliderValue" @input="(e: any) => $emit('slider-input', parseInt(e.target.value))" class="m-slider">
      </div>
      <button @click="$emit('go-to-chapter', currentChapterIndex + 1)" :disabled="currentChapterIndex >= chapters.length - 1" class="m-ch">下一章 ⏭</button>
    </div>

    <div class="m-info" style="pointer-events: auto;" @click.stop>
      <div class="flex items-center justify-start">
        <button @click="$emit('open-panel', 'toc')" class="m-btn" :class="{ active: showToc }">☰ 目录</button>
      </div>
      
      <div class="flex flex-1 items-center justify-around text-center">
        <span>第 {{ currentChapterIndex + 1 }}/{{ chapters.length }} 章</span>
        <span class="truncate max-w-[180px]">「{{ currentChapterTitle }}」</span>
        <span>第 {{ currentPage + 1 }}/{{ totalPages }} 页</span>
      </div>

      <div class="flex items-center justify-end">
        <button @click="$emit('open-panel', 'readerOptions')" class="m-btn" :class="{ active: showReaderOptions }">⚙️ 设置</button>
      </div>
    </div>
    
    <!-- Panels are injected via slots in ReaderView for easier transition management -->
    <slot></slot>
  </div>
</template>

<style scoped>
.menu-ov { position:absolute; inset:0; z-index:50; display:flex; flex-direction:column; }
.m-top { display:flex; align-items:center; gap:10px; padding:16px 24px; height:auto; min-height:64px; background:rgba(15,23,42,0.92); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); flex-wrap:wrap; }
.m-back { background:none; border:1px solid rgba(255,255,255,0.15); color:white; font-size:14px; font-weight:600; cursor:pointer; padding:8px 16px; border-radius:10px; transition:all .2s; white-space:nowrap; }
.m-back:hover { background:rgba(255,255,255,0.1); }
.m-title { font-weight:700; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:25%; opacity:0.8; min-width:0; }
.m-title.is-link { background:none; border:none; color:inherit; cursor:pointer; text-align:left; padding:0; }
.m-title.is-link:hover { color:#60a5fa; opacity:1; }
.m-acts { flex:1; display:flex; justify-content:flex-end; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
.m-capsule-btn { display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:30px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); cursor:pointer; font-size:12px; font-weight:700; transition:all .2s; }
.m-capsule-btn:hover { background:rgba(255,255,255,0.15); color:white; }
.m-capsule-btn.is-active { background:rgba(59,130,246,0.15); border-color:#3b82f6; color:#60a5fa; }
.m-capsule-btn .mc-track { position:relative; width:28px; height:16px; border-radius:10px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.2); transition:all .2s; }
.m-capsule-btn.is-active .mc-track { background:#3b82f6; border-color:#3b82f6; }
.m-capsule-btn .mc-thumb { position:absolute; left:2px; top:2px; width:10px; height:10px; border-radius:50%; background:white; transition:all .2s; }
.m-capsule-btn.is-active .mc-thumb { transform:translateX(12px); }
.m-btn { padding:8px 14px; border-radius:10px; font-size:13px; font-weight:700; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:white; cursor:pointer; transition:all .2s; white-space:nowrap; }
.m-btn:hover { background:rgba(59,130,246,0.2); }
.m-btn.active { background:#3b82f6; border-color:#3b82f6; box-shadow:0 4px 12px rgba(59,130,246,0.3); }
.m-bot { margin-top:auto; display:flex; align-items:center; gap:16px; padding:16px 24px; background:rgba(15,23,42,0.92); backdrop-filter:blur(20px); border-top:1px solid rgba(255,255,255,0.06); flex-wrap:wrap; }
.m-ch { padding:10px 18px; border-radius:10px; font-size:13px; font-weight:700; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:white; cursor:pointer; white-space:nowrap; transition:all .2s; }
.m-ch:hover:not(:disabled) { background:rgba(59,130,246,0.2); }
.m-ch:disabled { opacity:0.25; cursor:default; }
.m-prog { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; min-width:100px; }
.m-slider { width:100%; height:8px; -webkit-appearance:none; appearance:none; background:rgba(255,255,255,0.1); border-radius:4px; outline:none; cursor:pointer; }
.m-slider::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; background:white; border:3px solid #3b82f6; border-radius:50%; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.3); }
.m-info { display:flex; align-items:center; padding:10px 24px 20px; font-size:12px; color:rgba(255,255,255,0.4); font-weight:600; background:rgba(15,23,42,0.92); backdrop-filter:blur(20px); gap:12px; flex-wrap:wrap; }
</style>
