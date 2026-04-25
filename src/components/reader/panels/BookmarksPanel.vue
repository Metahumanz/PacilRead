<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import {
  deleteBookmark,
  fetchBookmarks,
  type BookmarkRecord,
  type BookmarkTarget,
} from '../../../composables/useBookmarks'

const props = defineProps<{
  bookId: number
  refreshKey: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'jump', target: BookmarkTarget): void
}>()

const bookmarks = ref<BookmarkRecord[]>([])
const loading = ref(false)

const loadBookmarks = async () => {
  loading.value = true
  try {
    bookmarks.value = await fetchBookmarks(props.bookId)
  } finally {
    loading.value = false
  }
}

const removeBookmark = async (bookmark: BookmarkRecord) => {
  await deleteBookmark(bookmark.uuid)
  await loadBookmarks()
}

const jumpToBookmark = (bookmark: BookmarkRecord) => {
  emit('jump', {
    uuid: bookmark.uuid,
    chapterOrderIndex: bookmark.chapterOrderIndex,
    chapterOffset: bookmark.chapterOffset,
  })
}

watch(() => props.refreshKey, () => {
  loadBookmarks().catch((error) => console.error('Reload reader bookmarks failed:', error))
})

onMounted(() => {
  loadBookmarks().catch((error) => console.error('Load reader bookmarks failed:', error))
})
</script>

<template>
  <div class="bookmark-p" @click.stop @wheel.stop>
    <div class="ph">
      <span class="pt">书签列表</span>
      <button @click="$emit('close')" class="px">✕</button>
    </div>

    <div v-if="loading" class="empty">正在读取书签...</div>
    <div v-else-if="bookmarks.length === 0" class="empty">这本书还没有书签</div>

    <div v-else class="bookmark-list">
      <div v-for="bookmark in bookmarks" :key="bookmark.uuid" class="bookmark-item">
        <button class="bookmark-main" @click="jumpToBookmark(bookmark)">
          <span class="bookmark-chapter">{{ bookmark.chapterTitle || `第 ${bookmark.chapterOrderIndex + 1} 章` }}</span>
          <span class="bookmark-summary">{{ bookmark.summary || '无摘要' }}</span>
          <span class="bookmark-meta">{{ bookmark.progressPercent }}% · {{ new Date(bookmark.updatedAt).toLocaleString() }}</span>
        </button>
        <button class="bookmark-delete" title="删除书签" @click="removeBookmark(bookmark)">✕</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bookmark-p { position:absolute; left:20px; top:76px; width:360px; max-height: calc(100vh - 180px); overflow-y:auto; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:18px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); touch-action: pan-y; }
.bookmark-p::-webkit-scrollbar { width:4px; }
.bookmark-p::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.14); border-radius:2px; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
.empty { padding:28px 8px; color:rgba(255,255,255,0.45); text-align:center; font-size:13px; }
.bookmark-list { display:flex; flex-direction:column; gap:10px; }
.bookmark-item { display:flex; gap:8px; align-items:stretch; }
.bookmark-main { flex:1; min-width:0; text-align:left; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.06); color:white; border-radius:12px; padding:10px 12px; cursor:pointer; transition:all .2s; }
.bookmark-main:hover { background:rgba(59,130,246,0.18); border-color:rgba(96,165,250,0.4); }
.bookmark-chapter { display:block; font-size:13px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bookmark-summary { display:block; margin-top:6px; color:rgba(255,255,255,0.68); font-size:12px; line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.bookmark-meta { display:block; margin-top:8px; color:rgba(255,255,255,0.34); font-size:11px; }
.bookmark-delete { width:34px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); background:rgba(239,68,68,0.1); color:rgba(248,113,113,0.8); cursor:pointer; }
.bookmark-delete:hover { background:rgba(239,68,68,0.2); color:white; }
</style>
