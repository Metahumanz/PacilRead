<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettings } from '../composables/useSettings'
import { useDataStore } from '../composables/useDataStore'
import BookCover from './common/BookCover.vue'

interface BookDisplay {
  id: number
  title: string
  author: string | null
  coverFile: string | null
  sourceFile: string | null
  progressIndex: number
  progressOffset: number
  lastReadAt: number
  pinned: boolean
  currentChapterTitle: string
  chapterCount: number
}

const emit = defineEmits<{ (e: 'open-book', bookId: number): void }>()

const settings = useSettings()
const { viewMode, bookshelfShowAddEntry, saveSetting } = settings

const books = ref<BookDisplay[]>([])
const loading = ref(true)
const importing = ref(false)

const searchQuery = ref('')

const filteredBooks = computed(() => {
  if (!searchQuery.value) return books.value
  const q = searchQuery.value.toLowerCase()
  return books.value.filter(b => b.title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q)))
})

const fetchBooks = async () => {
  try {
    loading.value = true
    const dataStore = useDataStore()
    if (!dataStore.dataLoaded.value) await dataStore.loadAllData()
    books.value = dataStore.getBooksSorted().map(b => {
      const currentChapterTitle = dataStore.getCurrentChapterTitle(b.id, b.progressIndex) || b.currentChapterTitle
      return {
        id: b.id,
        title: b.title,
        author: b.author,
        coverFile: b.coverFile,
        sourceFile: b.sourceFile,
        progressIndex: b.progressIndex,
        progressOffset: b.progressOffset,
        lastReadAt: b.lastReadAt,
        pinned: b.pinned,
        currentChapterTitle,
        chapterCount: b.chapterCount,
      }
    })
  } catch (error) {
    console.error('Failed to fetch books:', error)
  } finally {
    loading.value = false
  }
}

const addBook = async () => {
  const filePath = await window.electronAPI.dialog.openFile()
  if (!filePath) return
  try {
    importing.value = true
    const result = await window.electronAPI.library.importBook(filePath)
    console.log(`Imported ${result.chapterCount} chapters`)
    // Reload from JSON files after import
    const dataStore = useDataStore()
    dataStore.dataLoaded.value = false
    await dataStore.loadAllData()
    await fetchBooks()
  } catch (error) {
    console.error('Failed to add book:', error)
    alert('导入失败: ' + (error as Error).message)
  } finally {
    importing.value = false
  }
}

const deleteBook = async (bookId: number) => {
  if (!confirm('确定要删除这本书吗？')) return
  try {
    await window.electronAPI.library.deleteBook(bookId)
    const dataStore = useDataStore()
    dataStore.dataLoaded.value = false
    await dataStore.loadAllData()
    await fetchBooks()
  } catch (error) {
    console.error('Failed to delete book:', error)
  }
}

const setCover = async (bookId: number) => {
  const filePath = await window.electronAPI.dialog.openImage()
  if (!filePath) return
  try {
    const result = await window.electronAPI.app.copyCover(filePath)
    if (!result.success) throw new Error(result.error || '复制封面失败')
    const { updateBook } = useDataStore()
    await updateBook(bookId, { coverFile: result.filename! })
    await fetchBooks()
  } catch (error) {
    console.error('Failed to set cover:', error)
    alert('设置封面失败: ' + (error as Error).message)
  }
}

const removeCover = async (bookId: number) => {
  try {
    const { updateBook } = useDataStore()
    await updateBook(bookId, { coverFile: null })
    await fetchBooks()
  } catch (error) {
    console.error('Failed to remove cover:', error)
  }
}

const togglePin = async (book: BookDisplay) => {
  try {
    const { updateBook } = useDataStore()
    await updateBook(book.id, { pinned: !book.pinned })
    await fetchBooks()
  } catch (error) {
    console.error('Failed to toggle pin:', error)
  }
}

const formatDate = (epochMs: number) => {
  if (!epochMs) return ''
  return new Date(epochMs).toLocaleDateString('zh-CN')
}

const formatChapter = (book: BookDisplay) => {
  if (!book.chapterCount) return '暂无章节'
  const chapterNumber = Math.min(Math.max(book.progressIndex + 1, 1), book.chapterCount)
  return book.currentChapterTitle
    ? `第 ${chapterNumber} 章 ${book.currentChapterTitle}`
    : `第 ${chapterNumber} / ${book.chapterCount} 章`
}

onMounted(() => fetchBooks())
</script>

<template>
  <div class="pt-6">
    <div class="flex items-center justify-between mb-8 gap-4">
      <div>
        <h2 class="app-title text-[22px] font-semibold">我的书架</h2>
        <p class="app-muted text-[13px] mt-1">共 {{ filteredBooks.length }} 本书籍</p>
      </div>

      <!-- Action Area -->
      <div class="flex flex-1 max-w-[28rem] items-center gap-3">
        <!-- Search -->
        <div class="relative flex-1">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
          <input type="text" v-model="searchQuery" placeholder="搜索书名或作者..." 
                 class="app-input w-full pl-10 pr-4 py-2 text-sm shadow-inner" />
        </div>
        
        <!-- View Toggles -->
        <div class="app-card flex items-center p-1 overflow-hidden shrink-0">
          <button @click="viewMode = 'grid'; saveSetting('viewMode', 'grid')" :class="viewMode === 'grid' ? 'app-button-primary' : ''" class="app-button p-1.5 leading-none" title="网格平铺">🔳</button>
          <button @click="viewMode = 'list'; saveSetting('viewMode', 'list')" :class="viewMode === 'list' ? 'app-button-primary' : ''" class="app-button p-1.5 leading-none" title="列表视图">☰</button>
        </div>
        
        <button v-if="bookshelfShowAddEntry" @click="addBook" :disabled="importing" class="app-button app-button-primary group px-4 py-2 shrink-0 disabled:opacity-45 disabled:hover:translate-y-0 flex justify-center items-center gap-1.5">
          <span class="text-lg leading-none">{{ importing ? '⏳' : '+' }}</span>
          <span class="text-[13px] whitespace-nowrap">{{ importing ? '导入...' : '添加' }}</span>
        </button>
      </div>
    </div>

    <!-- Empty/Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-32 gap-4">
      <div class="app-progress-ring w-10 h-10 border-4 rounded-full animate-spin"></div>
      <p class="app-muted text-sm animate-pulse">正在获取书籍...</p>
    </div>
    <div v-else-if="books.length === 0" class="app-card text-center py-28 mx-auto max-w-lg">
      <div class="text-5xl mb-6 opacity-60">📚</div>
      <p class="text-lg app-title font-medium mb-3">书架空空如也</p>
      <p class="text-[13px] app-muted mb-8">支持 TXT 和 EPUB 格式的本地解析与无缝阅读</p>
      <button v-if="bookshelfShowAddEntry" @click="addBook" class="app-button app-button-primary px-8 py-2.5 text-[14px]">开启阅读之旅</button>
    </div>
    <div v-else-if="filteredBooks.length === 0" class="text-center py-28 mx-auto max-w-lg">
      <p class="text-lg app-muted mb-3">没有搜索到与 "{{ searchQuery }}" 匹配的书籍</p>
    </div>

    <!-- GRID VIEW -->
    <div v-if="!loading && filteredBooks.length > 0 && viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 pb-10">
      <div v-for="(book, index) in filteredBooks" :key="book.id" class="relative group cursor-pointer bookshelf-card flex flex-col" 
           :style="{ animationDelay: `${index * 30}ms` }" @click="emit('open-book', book.id)">
        <div class="app-card app-card-hover aspect-[3/4.2] overflow-hidden relative"
             :class="{'ring-2 ring-[var(--app-accent)]': book.pinned}">
          <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#111111]/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none"></div>

          <div v-if="book.pinned" class="app-badge is-active absolute top-2 left-2 z-20 text-[10px] font-bold px-1.5 py-0.5">置顶</div>

          <BookCover class="w-full h-full rounded-xl bookshelf-grid-cover" :cover-path="book.coverFile" :title="book.title" />

          <div class="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-20">
            <button @click.stop="togglePin(book)" class="p-1.5 rounded-md backdrop-blur-md transition-colors border shadow-sm"
                    :class="book.pinned ? 'app-button-primary border-transparent' : 'bg-black/60 text-white/70 hover:bg-black/90 hover:text-white border-black/10 dark:border-white/10'" :title="book.pinned ? '取消置顶' : '置顶'">
              <span class="text-sm leading-none block">📌</span>
            </button>
            <button @click.stop="setCover(book.id)" class="p-1.5 bg-black/60 hover:bg-black/90 shadow-sm text-white/70 hover:text-white rounded-md backdrop-blur-md transition-colors border border-black/10 dark:border-white/10" title="设置封面">
              <span class="text-sm leading-none block">🖼️</span>
            </button>
            <button v-if="book.coverFile" @click.stop="removeCover(book.id)" class="p-1.5 bg-black/60 hover:bg-black/90 shadow-sm text-white/70 hover:text-white rounded-md backdrop-blur-md transition-colors border border-black/10 dark:border-white/10" title="取消封面">
              <span class="text-sm leading-none block">✕</span>
            </button>
            <button @click.stop="deleteBook(book.id)" class="p-1.5 bg-red-600/80 hover:bg-red-500 shadow-sm text-white rounded-md backdrop-blur-md transition-colors border border-transparent" title="删除">
              <span class="text-sm leading-none block">🗑️</span>
            </button>
          </div>
        </div>

        <div class="mt-3 px-1">
          <h3 class="font-semibold text-[14px] app-title truncate group-hover:text-[var(--app-accent)] transition-colors duration-200">{{ book.title }}</h3>
          <div class="flex items-center justify-between mt-0.5">
            <p v-if="book.author" class="text-[12px] app-muted truncate max-w-[65%]">{{ book.author }}</p>
            <p class="text-[10px] app-muted font-mono">{{ formatDate(book.lastReadAt) }}</p>
          </div>
          <p class="text-[11px] app-muted truncate mt-1">{{ formatChapter(book) }}</p>
        </div>
      </div>

      <button
        v-if="bookshelfShowAddEntry"
        @click="addBook"
        :disabled="importing"
        class="app-card app-card-hover aspect-[3/4.2] flex flex-col items-center justify-center gap-3 text-center disabled:opacity-50"
      >
        <span class="text-4xl opacity-70">{{ importing ? '⏳' : '+' }}</span>
        <span class="text-[13px] app-title font-semibold">{{ importing ? '导入中...' : '添加书籍' }}</span>
      </button>
    </div>

    <!-- LIST VIEW -->
    <div v-if="!loading && filteredBooks.length > 0 && viewMode === 'list'" class="flex flex-col gap-2 pb-10">
      <div v-for="(book, index) in filteredBooks" :key="'list-'+book.id" 
           class="bookshelf-list-row app-card app-card-hover group p-2 cursor-pointer bookshelf-card"
           :style="{ animationDelay: `${index * 20}ms` }" @click="emit('open-book', book.id)">
        <div class="bookshelf-list-cover w-12 h-16 rounded-[var(--app-radius-button)] overflow-hidden shadow relative" :class="{'ring-1 ring-[var(--app-accent)]': book.pinned}">
            <BookCover class="w-full h-full" :cover-path="book.coverFile" :title="book.title" />
            <div v-if="book.pinned" class="absolute -top-1 -right-1 z-10 text-[8px] bg-[var(--app-accent)] text-[var(--app-text-on-primary)] px-1 rounded-sm">★</div>
        </div>
        <div class="bookshelf-list-info min-w-0">
          <div class="bookshelf-list-cell bookshelf-list-title min-w-0">
              <h3 class="bookshelf-list-value bookshelf-list-name font-semibold app-title truncate group-hover:text-[var(--app-accent)] transition-colors">{{ book.title }}</h3>
          </div>
          <div class="bookshelf-list-cell bookshelf-list-author min-w-0">
              <p class="bookshelf-list-value app-muted truncate">{{ book.author || '未知作者' }}</p>
          </div>
          <div class="bookshelf-list-cell bookshelf-list-chapter min-w-0">
              <p class="bookshelf-list-value app-muted truncate">{{ formatChapter(book) }}</p>
          </div>
          <div class="bookshelf-list-cell bookshelf-list-date min-w-0">
              <p class="bookshelf-list-value font-mono app-muted truncate">{{ formatDate(book.lastReadAt) || '未读' }}</p>
          </div>
        </div>
        <div class="bookshelf-list-actions">
            <button @click.stop="togglePin(book)" class="bookshelf-list-action app-icon-button" :class="book.pinned ? 'app-accent-text' : ''" title="置顶"><span class="block leading-none">📌</span></button>
            <button @click.stop="setCover(book.id)" class="bookshelf-list-action app-icon-button" title="设置封面"><span class="block leading-none">🖼️</span></button>
            <button
              v-if="book.coverFile"
              @click.stop="removeCover(book.id)"
              class="bookshelf-list-action app-icon-button"
              title="取消封面"
            ><span class="block leading-none">✕</span></button>
            <button @click.stop="deleteBook(book.id)" class="bookshelf-list-action rounded-full text-slate-600 dark:text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-colors" title="删除"><span class="block leading-none">🗑️</span></button>
        </div>
      </div>
      <button
        v-if="bookshelfShowAddEntry"
        @click="addBook"
        :disabled="importing"
        class="app-card app-card-hover flex items-center justify-center gap-2 p-4 text-[13px] app-title font-semibold disabled:opacity-50"
      >
        <span>{{ importing ? '⏳' : '+' }}</span>
        <span>{{ importing ? '导入中...' : '添加书籍' }}</span>
      </button>
    </div>

  </div>
</template>

<style scoped>
.bookshelf-card {
  opacity: 0;
  transform: translateY(15px);
  animation: cardFadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.bookshelf-list-row {
  position: relative;
  display: grid;
  grid-template-columns: 3rem minmax(0, 1fr);
  align-items: center;
  column-gap: 1rem;
  min-height: 5rem;
}

.bookshelf-list-cover {
  align-self: center;
}

.bookshelf-list-info {
  display: grid;
  grid-template-columns:
    minmax(10rem, 1.3fr)
    minmax(7rem, 0.78fr)
    minmax(13rem, 1.45fr)
    minmax(7.5rem, 0.72fr);
  align-items: center;
  column-gap: 1rem;
}

.bookshelf-list-cell {
  min-width: 0;
}

.bookshelf-list-value {
  font-size: 14px;
  line-height: 1.42;
}

.bookshelf-list-name {
  font-size: 15px;
}

.bookshelf-list-date {
  text-align: right;
  transition: opacity var(--app-motion);
}

.bookshelf-list-actions {
  position: absolute;
  top: 50%;
  right: 0.75rem;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.375rem;
  padding: 0.25rem 0.375rem;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-pill);
  background: color-mix(in srgb, rgb(var(--app-glass-strong-rgb)) 82%, transparent);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(0.35rem);
  transition: opacity var(--app-motion), transform var(--app-motion);
  backdrop-filter: blur(14px);
}

.bookshelf-list-action {
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.bookshelf-list-row:hover .bookshelf-list-actions,
.bookshelf-list-row:focus-within .bookshelf-list-actions {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%) translateX(0);
}

.bookshelf-list-row:hover .bookshelf-list-date,
.bookshelf-list-row:focus-within .bookshelf-list-date {
  opacity: 0.2;
}

@media (max-width: 980px) {
  .bookshelf-list-row {
    align-items: start;
  }

  .bookshelf-list-info {
    grid-template-columns: minmax(0, 1fr) minmax(7rem, 0.65fr);
    row-gap: 0.45rem;
  }

  .bookshelf-list-date {
    text-align: left;
  }
}

@media (max-width: 700px) {
  .bookshelf-list-row {
    grid-template-columns: 3rem minmax(0, 1fr);
  }

  .bookshelf-list-info {
    grid-template-columns: minmax(0, 1fr);
    padding-right: 0;
  }

  .bookshelf-list-actions {
    position: static;
    grid-column: 2;
    justify-content: flex-start;
    margin-top: 0.4rem;
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }

  .bookshelf-list-row:hover .bookshelf-list-actions,
  .bookshelf-list-row:focus-within .bookshelf-list-actions {
    transform: none;
  }

  .bookshelf-list-row:hover .bookshelf-list-date,
  .bookshelf-list-row:focus-within .bookshelf-list-date {
    opacity: 1;
  }
}

@keyframes cardFadeIn {
  to { opacity: 1; transform: translateY(0); }
}
</style>
