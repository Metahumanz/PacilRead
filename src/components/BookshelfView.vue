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
    books.value = dataStore.getBooksSorted().map(b => ({
      id: b.id,
      title: b.title,
      author: b.author,
      coverFile: b.coverFile,
      sourceFile: b.sourceFile,
      progressIndex: b.progressIndex,
      progressOffset: b.progressOffset,
      lastReadAt: b.lastReadAt,
      pinned: b.pinned,
      currentChapterTitle: b.currentChapterTitle,
      chapterCount: b.chapterCount,
    }))
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
    const result = await window.electronAPI.db.importBook(filePath)
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
    await window.electronAPI.db.deleteBook(bookId)
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
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || null
  try {
    const { updateBook } = useDataStore()
    await updateBook(bookId, { coverFile: fileName })
    // The actual file copying happens in the importBook handler
    await fetchBooks()
  } catch (error) {
    console.error('Failed to set cover:', error)
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
  return book.currentChapterTitle || `第 ${book.progressIndex + 1} 章`
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
          <button @click="viewMode = 'icon'; saveSetting('viewMode', 'icon')" :class="viewMode === 'icon' ? 'app-button-primary' : ''" class="app-button p-1.5 leading-none" title="图标视图">▦</button>
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

          <!-- Pin badge -->
          <div v-if="book.pinned" class="app-badge is-active absolute top-2 left-2 z-20 text-[10px] font-bold px-1.5 py-0.5">置顶</div>

          <BookCover class="w-full h-full rounded-xl" :cover-path="book.coverFile" :title="book.title" />

          <!-- Actions -->
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
           class="app-card app-card-hover group flex items-center p-2 cursor-pointer bookshelf-card"
           :style="{ animationDelay: `${index * 20}ms` }" @click="emit('open-book', book.id)">
        <div class="w-12 h-16 shrink-0 rounded-[var(--app-radius-button)] overflow-hidden shadow relative" :class="{'ring-1 ring-[var(--app-accent)]': book.pinned}">
            <BookCover class="w-full h-full" :cover-path="book.coverFile" :title="book.title" />
            <div v-if="book.pinned" class="absolute -top-1 -right-1 z-10 text-[8px] bg-[var(--app-accent)] text-[var(--app-text-on-primary)] px-1 rounded-sm">★</div>
        </div>
        <div class="flex-1 min-w-0 ml-4">
            <h3 class="font-semibold text-[15px] app-title truncate group-hover:text-[var(--app-accent)] transition-colors">{{ book.title }}</h3>
            <p class="text-[13px] app-muted truncate mt-0.5">{{ book.author || '未知作者' }}</p>
            <p class="text-[12px] app-muted truncate mt-0.5">{{ formatChapter(book) }}</p>
        </div>
        <div class="shrink-0 text-right px-4 hidden md:block">
            <p class="text-[12px] app-muted mb-1">上次阅读</p>
            <p class="text-[12px] font-mono app-muted">{{ formatDate(book.lastReadAt) }}</p>
        </div>
        <div class="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click.stop="togglePin(book)" class="app-icon-button p-2" :class="book.pinned ? 'app-accent-text' : ''" title="置顶"><span class="block leading-none">📌</span></button>
            <button @click.stop="deleteBook(book.id)" class="p-2 rounded hover:bg-red-500/20 text-slate-600 dark:text-white/60 hover:text-red-400 transition-colors" title="删除"><span class="block leading-none">🗑️</span></button>
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

    <!-- ICON VIEW -->
    <div v-if="!loading && filteredBooks.length > 0 && viewMode === 'icon'" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-6 pb-10">
      <div v-for="(book, index) in filteredBooks" :key="'icon-'+book.id" class="relative group cursor-pointer bookshelf-card flex flex-col justify-end" 
           :style="{ animationDelay: `${index * 15}ms` }" @click="emit('open-book', book.id)" :title="book.title">
        <div class="app-card app-card-hover aspect-[3/4.2] overflow-hidden relative"
             :class="{'ring-2 ring-[var(--app-accent)]': book.pinned}">
            <div class="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent opacity-60 z-10 pointer-events-none"></div>

            <div v-if="book.pinned" class="absolute top-1 left-1 z-20 text-[var(--app-accent)] text-xs">★</div>

            <BookCover class="w-full h-full" :cover-path="book.coverFile" :title="book.title" />

            <div class="absolute bottom-0 left-0 right-0 p-2 z-20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-black/80 backdrop-blur-sm">
                <button @click.stop="deleteBook(book.id)" class="w-full py-1 text-xs text-red-400 hover:text-white hover:bg-red-500 rounded transition-colors border border-transparent hover:border-red-400/50">删除本书</button>
            </div>
        </div>
      </div>
      <button
        v-if="bookshelfShowAddEntry"
        @click="addBook"
        :disabled="importing"
        class="app-card app-card-hover aspect-[3/4.2] flex flex-col items-center justify-center gap-2 disabled:opacity-50"
      >
        <span class="text-3xl opacity-70">{{ importing ? '⏳' : '+' }}</span>
        <span class="text-[12px] app-title font-semibold">添加</span>
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
@keyframes cardFadeIn {
  to { opacity: 1; transform: translateY(0); }
}
</style>
