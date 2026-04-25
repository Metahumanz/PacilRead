<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  deleteBookmark,
  fetchBookmarks,
  type BookmarkRecord,
  type BookmarkTarget,
} from '../composables/useBookmarks'
import BookCover from './common/BookCover.vue'

const emit = defineEmits<{
  (e: 'open-book', bookId: number, target: BookmarkTarget): void
}>()

const bookmarks = ref<BookmarkRecord[]>([])
const loading = ref(true)
const searchQuery = ref('')

const filteredBookmarks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return bookmarks.value
  return bookmarks.value.filter((bookmark) => (
    bookmark.bookTitle.toLowerCase().includes(query) ||
    bookmark.bookAuthor.toLowerCase().includes(query) ||
    bookmark.chapterTitle.toLowerCase().includes(query) ||
    bookmark.summary.toLowerCase().includes(query)
  ))
})

const loadBookmarks = async () => {
  loading.value = true
  try {
    bookmarks.value = await fetchBookmarks()
  } finally {
    loading.value = false
  }
}

const openBookmark = (bookmark: BookmarkRecord) => {
  if (!bookmark.bookId) return
  emit('open-book', bookmark.bookId, {
    uuid: bookmark.uuid,
    chapterOrderIndex: bookmark.chapterOrderIndex,
    chapterOffset: bookmark.chapterOffset,
  })
}

const removeBookmark = async (bookmark: BookmarkRecord) => {
  await deleteBookmark(bookmark.uuid)
  await loadBookmarks()
}

const formatTime = (time: number) => new Date(time).toLocaleString()

onMounted(() => {
  loadBookmarks().catch((error) => console.error('Load bookmarks failed:', error))
})
</script>

<template>
  <div class="pt-6 pb-20">
    <div class="flex items-center justify-between gap-4 mb-8">
      <div>
        <h2 class="app-title text-[22px] font-semibold">书签</h2>
        <p class="app-muted text-[13px] mt-1">共 {{ filteredBookmarks.length }} 条阅读位置</p>
      </div>

      <div class="relative w-full max-w-[24rem]">
        <span class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索书名、章节或摘要..."
          class="app-input w-full pl-10 pr-4 py-2 text-sm"
        />
      </div>
    </div>

    <div v-if="loading" class="flex flex-col items-center justify-center py-28 gap-4">
      <div class="app-progress-ring w-10 h-10 border-4 rounded-full animate-spin"></div>
      <p class="app-muted text-sm">正在整理书签...</p>
    </div>

    <div v-else-if="filteredBookmarks.length === 0" class="app-card text-center py-24">
      <div class="text-5xl mb-5 opacity-60">🔖</div>
      <div class="app-title text-[18px] font-semibold">还没有书签</div>
      <p class="app-muted text-[13px] mt-2">在阅读器顶部菜单中可以保存当前位置。</p>
    </div>

    <div v-else class="app-card app-divide-y overflow-hidden">
      <button
        v-for="bookmark in filteredBookmarks"
        :key="bookmark.uuid"
        class="app-row w-full px-5 py-4 text-left flex items-center gap-4"
        :class="{ 'opacity-60 cursor-not-allowed': !bookmark.bookId }"
        @click="openBookmark(bookmark)"
      >
        <BookCover
          class="w-12 h-16 rounded-[var(--app-radius-input)] shrink-0 border border-[var(--app-border)]"
          :cover-path="bookmark.coverPath"
          :title="bookmark.bookTitle"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 min-w-0">
            <div class="app-title text-[14px] font-semibold truncate">{{ bookmark.bookTitle || '未命名书籍' }}</div>
            <span class="app-badge px-2 py-0.5 text-[10px] shrink-0">{{ bookmark.progressPercent }}%</span>
          </div>
          <div class="app-muted text-[12px] truncate mt-1">
            {{ bookmark.bookAuthor || '未知作者' }} · {{ bookmark.chapterTitle || `第 ${bookmark.chapterOrderIndex + 1} 章` }}
          </div>
          <div class="text-[12px] app-muted mt-2 line-clamp-2">
            {{ bookmark.summary || '无摘要' }}
          </div>
        </div>
        <div class="shrink-0 text-right hidden md:block">
          <div class="app-muted text-[11px]">{{ formatTime(bookmark.updatedAt) }}</div>
          <div v-if="!bookmark.bookId" class="text-[11px] text-[var(--app-warning)] mt-2">未绑定本地书籍</div>
        </div>
        <button
          class="app-icon-button p-2 shrink-0"
          title="删除书签"
          @click.stop="removeBookmark(bookmark)"
        >
          🗑️
        </button>
      </button>
    </div>
  </div>
</template>
