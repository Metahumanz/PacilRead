<script setup lang="ts">
import { ref } from 'vue'
import { perfLog, perfNow } from '../../../utils/perf'
import type { BookSearchResult, ReaderChapter } from '../../../types/entities'
import { notifyError } from '../../../composables/useNotifications'

interface SearchResult extends BookSearchResult { matchIndex: number }

const props = defineProps<{
  bookId: number
  chapters: ReaderChapter[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'jump', result: BookSearchResult): void
}>()

const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)
const searchError = ref('')
let searchRunId = 0

const doSearch = async () => {
  const runId = ++searchRunId
  const q = searchQuery.value.trim()
  if (!q) { searchResults.value = []; searchError.value = ''; searching.value = false; return }
  const startedAt = perfNow()
  searching.value = true
  searchError.value = ''
  try {
    const results = await window.electronAPI.library.searchBook(props.bookId, q)
    if (runId !== searchRunId) return
    const counts = new Map<number, number>()
    searchResults.value = results.map(result => {
      const matchIndex = counts.get(result.chapterIndex) || 0
      counts.set(result.chapterIndex, matchIndex + 1)
      return { ...result, matchIndex }
    })
  } catch (e) {
    console.error(e)
    if (runId !== searchRunId) return
    searchResults.value = []
    searchError.value = '搜索失败，请检查后重试。'
    notifyError(searchError.value)
  } finally {
    if (runId === searchRunId) {
      searching.value = false
      perfLog('reader:search', startedAt, `chapters=${props.chapters.length} results=${searchResults.value.length}`)
    }
  }
}

const handleJump = (result: SearchResult) => {
  emit('jump', result)
}
</script>

<template>
  <div class="search-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">全文搜索</span><button @click="$emit('close')" class="px">✕</button></div>
    <div class="search-input-row">
      <input type="text" v-model="searchQuery" @keydown.enter="doSearch" placeholder="输入关键词..." class="search-input" />
      <button @click="doSearch" class="search-go" :disabled="searching">{{ searching ? '...' : '搜索' }}</button>
    </div>
    <div v-if="searchError && !searching" class="search-error" role="alert">
      <span>{{ searchError }}</span>
      <button type="button" @click="doSearch">重试</button>
    </div>
    <div v-else-if="searchResults.length > 0" class="search-count">找到 {{ searchResults.length }} 个结果</div>
    <div v-else-if="searchQuery.trim() && !searching" class="search-count empty">未找到匹配内容</div>
    <div class="search-list">
      <button v-for="sr in searchResults" :key="`${sr.chapterIndex}-${sr.matchIndex}`" @click="handleJump(sr)" class="search-item">
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
.search-error { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; color:#fca5a5; font-size:11px; }
.search-error button { flex-shrink:0; border:1px solid rgba(248,113,113,.35); border-radius:7px; padding:3px 9px; color:#fecaca; background:rgba(239,68,68,.12); cursor:pointer; }
.search-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.search-list::-webkit-scrollbar { width:4px; }
.search-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.search-item { display:flex; flex-direction:column; gap:4px; padding:10px 12px; border-radius:10px; border:none; background:transparent; color:rgba(255,255,255,0.7); font-size:12px; cursor:pointer; text-align:left; transition:all .15s; }
.search-item:hover { background:rgba(59,130,246,0.12); color:white; }
.sr-ch { font-weight:700; font-size:12px; color:#60a5fa; }
.sr-snip { font-size:11px; opacity:0.6; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
</style>
