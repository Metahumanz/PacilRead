<script setup lang="ts">
import { ref } from 'vue'

interface Chapter { id: number; title: string; body: string; body_text: string; order_index: number }
interface SearchResult { chapterIndex: number; chapterTitle: string; snippet: string }

const props = defineProps<{
  chapters: Chapter[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'jump', index: number): void
}>()

const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)

const doSearch = async () => {
  const q = searchQuery.value.trim()
  if (!q) { searchResults.value = []; return }
  
  searching.value = true
  try {
    const results: SearchResult[] = []
    for (let i = 0; i < props.chapters.length; i++) {
      const plain = props.chapters[i].body_text || props.chapters[i].body.replace(/<[^>]+>/g, '')
      let startIndex = 0
      while (startIndex < plain.length) {
        const idx = plain.toLowerCase().indexOf(q.toLowerCase(), startIndex)
        if (idx >= 0) {
          const start = Math.max(0, idx - 20)
          const end = Math.min(plain.length, idx + q.length + 40)
          results.push({
            chapterIndex: i,
            chapterTitle: props.chapters[i].title,
            snippet: (start > 0 ? '...' : '') + plain.substring(start, end) + (end < plain.length ? '...' : '')
          })
          startIndex = idx + q.length
        } else break
      }
    }
    searchResults.value = results
  } catch (e) { console.error(e) }
  searching.value = false
}

const handleJump = (idx: number) => {
  emit('jump', idx)
}
</script>

<template>
  <div class="search-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">全文搜索</span><button @click="$emit('close')" class="px">✕</button></div>
    <div class="search-input-row">
      <input type="text" v-model="searchQuery" @keydown.enter="doSearch" placeholder="输入关键词..." class="search-input" />
      <button @click="doSearch" class="search-go" :disabled="searching">{{ searching ? '...' : '搜索' }}</button>
    </div>
    <div v-if="searchResults.length > 0" class="search-count">找到 {{ searchResults.length }} 个结果</div>
    <div v-else-if="searchQuery && !searching" class="search-count empty">未找到匹配内容</div>
    <div class="search-list">
      <button v-for="sr in searchResults" :key="sr.chapterIndex" @click="handleJump(sr.chapterIndex)" class="search-item">
        <span class="sr-ch">{{ sr.chapterTitle }}</span>
        <span class="sr-snip">{{ sr.snippet }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.search-p { position:absolute; left:20px; top:60px; max-height: calc(100% - 180px); width:360px; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; touch-action: pan-y; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
.search-input-row { display:flex; gap:8px; margin-bottom:12px; }
.search-input { flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:8px 14px; font-size:13px; color:white; outline:none; transition:border-color .2s; }
.search-input:focus { border-color:#3b82f6; }
.search-input::placeholder { color:rgba(255,255,255,0.3); }
.search-go { padding:8px 16px; border-radius:10px; font-size:12px; font-weight:700; background:#3b82f6; border:none; color:white; cursor:pointer; transition:all .2s; white-space:nowrap; }
.search-go:hover { background:#2563eb; }
.search-go:disabled { opacity:0.5; }
.search-count { font-size:11px; color:rgba(255,255,255,0.4); margin-bottom:8px; font-weight:600; }
.search-count.empty { color:rgba(255,255,255,0.25); }
.search-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.search-list::-webkit-scrollbar { width:4px; }
.search-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.search-item { display:flex; flex-direction:column; gap:4px; padding:10px 12px; border-radius:10px; border:none; background:transparent; color:rgba(255,255,255,0.7); font-size:12px; cursor:pointer; text-align:left; transition:all .15s; }
.search-item:hover { background:rgba(59,130,246,0.12); color:white; }
.sr-ch { font-weight:700; font-size:12px; color:#60a5fa; }
.sr-snip { font-size:11px; opacity:0.6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
