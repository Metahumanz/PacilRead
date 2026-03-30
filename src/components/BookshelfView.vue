<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface Book {
  id: number
  title: string
  author: string | null
  cover_path: string | null
  path: string
  progress_index: number
  progress_offset: number
  last_read: string
  pinned: number
}

const emit = defineEmits<{ (e: 'open-book', bookId: number): void }>()

const books = ref<Book[]>([])
const loading = ref(true)
const importing = ref(false)

const searchQuery = ref('')
const viewMode = ref<'grid' | 'list' | 'icon'>('grid') // 网格 | 列表 | 图标

const filteredBooks = computed(() => {
  if (!searchQuery.value) return books.value
  const q = searchQuery.value.toLowerCase()
  return books.value.filter(b => b.title.toLowerCase().includes(q) || (b.author && b.author.toLowerCase().includes(q)))
})

const fetchBooks = async () => {
  try {
    loading.value = true
    const result = await window.electronAPI.db.query('SELECT * FROM books ORDER BY pinned DESC, last_read DESC')
    books.value = result as Book[]
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
    await window.electronAPI.db.query('DELETE FROM replacement_rules WHERE book_id = ?', [bookId])
    await window.electronAPI.db.query('DELETE FROM chapters WHERE book_id = ?', [bookId])
    await window.electronAPI.db.query('DELETE FROM books WHERE id = ?', [bookId])
    await fetchBooks()
  } catch (error) {
    console.error('Failed to delete book:', error)
  }
}

const setCover = async (bookId: number) => {
  const filePath = await window.electronAPI.dialog.openImage()
  if (!filePath) return
  const fileUrl = 'file:///' + filePath.replace(/\\/g, '/')
  try {
    await window.electronAPI.db.query('UPDATE books SET cover_path = ? WHERE id = ?', [fileUrl, bookId])
    await fetchBooks()
  } catch (error) {
    console.error('Failed to set cover:', error)
  }
}

const removeCover = async (bookId: number) => {
  try {
    await window.electronAPI.db.query('UPDATE books SET cover_path = NULL WHERE id = ?', [bookId])
    await fetchBooks()
  } catch (error) {
    console.error('Failed to remove cover:', error)
  }
}

const togglePin = async (book: Book) => {
  const newVal = book.pinned ? 0 : 1
  try {
    await window.electronAPI.db.query('UPDATE books SET pinned = ? WHERE id = ?', [newVal, book.id])
    await fetchBooks()
  } catch (error) {
    console.error('Failed to toggle pin:', error)
  }
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('zh-CN')
}

onMounted(() => fetchBooks())
</script>

<template>
  <div class="pt-6">
    <div class="flex items-center justify-between mb-8 gap-4">
      <div>
        <h2 class="text-[22px] font-semibold text-slate-800 dark:text-white/90 tracking-wide">我的书架</h2>
        <p class="text-slate-500 dark:text-white/50 text-[13px] mt-1">共 {{ filteredBooks.length }} 本书籍</p>
      </div>

      <!-- Action Area -->
      <div class="flex flex-1 max-w-[28rem] items-center gap-3">
        <!-- Search -->
        <div class="relative flex-1">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
          <input type="text" v-model="searchQuery" placeholder="搜索书名或作者..." 
                 class="w-full bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-[#005fb8] focus:bg-black/10 dark:bg-black/40 transition-colors shadow-inner" />
        </div>
        
        <!-- View Toggles -->
        <div class="flex items-center bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5 rounded-lg p-1 overflow-hidden shrink-0">
          <button @click="viewMode = 'grid'" :class="viewMode === 'grid' ? 'bg-[#005fb8] shadow-sm text-white' : 'hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-white/60'" class="p-1.5 rounded-md transition-all leading-none" title="网格平铺">🔳</button>
          <button @click="viewMode = 'list'" :class="viewMode === 'list' ? 'bg-[#005fb8] shadow-sm text-white' : 'hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-white/60'" class="p-1.5 rounded-md transition-all leading-none" title="列表视图">☰</button>
          <button @click="viewMode = 'icon'" :class="viewMode === 'icon' ? 'bg-[#005fb8] shadow-sm text-white' : 'hover:bg-black/5 dark:hover:bg-white/10 text-slate-600 dark:text-white/60'" class="p-1.5 rounded-md transition-all leading-none" title="图标视图">▦</button>
        </div>
        
        <button @click="addBook" :disabled="importing" class="group px-4 py-2 shrink-0 bg-[#005fb8] hover:bg-[#005fb8]/90 hover:-translate-y-0.5 hover:shadow-lg disabled:bg-black/5 dark:bg-white/5 disabled:hover:translate-y-0 disabled:text-slate-400 dark:text-white/30 rounded-lg transition-all flex justify-center items-center gap-1.5 font-medium border border-[#005fb8]/50 shadow-sm">
          <span class="text-lg leading-none">{{ importing ? '⏳' : '+' }}</span>
          <span class="text-[13px] whitespace-nowrap">{{ importing ? '导入...' : '添加' }}</span>
        </button>
      </div>
    </div>

    <!-- Empty/Loading State -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-32 gap-4">
      <div class="w-10 h-10 border-4 border-[#005fb8]/30 border-t-[#005fb8] rounded-full animate-spin"></div>
      <p class="text-slate-500 dark:text-white/50 text-sm animate-pulse">正在获取书籍...</p>
    </div>
    <div v-else-if="books.length === 0" class="text-center py-28 bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/5 mx-auto max-w-lg shadow-sm">
      <div class="text-5xl mb-6 opacity-60">📚</div>
      <p class="text-lg text-slate-700 dark:text-white/80 font-medium mb-3">书架空空如也</p>
      <p class="text-[13px] text-slate-400 dark:text-white/40 mb-8">支持 TXT 和 EPUB 格式的本地解析与无缝阅读</p>
      <button @click="addBook" class="px-8 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/5 dark:bg-white/10 rounded-md transition-colors border border-black/10 dark:border-white/10 text-[14px] font-medium hover:-translate-y-0.5 hover:shadow-lg">开启阅读之旅</button>
    </div>
    <div v-else-if="filteredBooks.length === 0" class="text-center py-28 mx-auto max-w-lg">
      <p class="text-lg text-slate-500 dark:text-white/50 mb-3">没有搜索到与 "{{ searchQuery }}" 匹配的书籍</p>
    </div>

    <!-- GRID VIEW -->
    <div v-if="!loading && filteredBooks.length > 0 && viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 pb-10">
      <div v-for="(book, index) in filteredBooks" :key="book.id" class="relative group cursor-pointer bookshelf-card flex flex-col" 
           :style="{ animationDelay: `${index * 30}ms` }" @click="emit('open-book', book.id)">
        <div class="aspect-[3/4.2] bg-white dark:bg-[#2d2d2d] rounded-xl overflow-hidden relative shadow-md hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 border border-black/5 dark:border-white/[0.04] hover:border-white/[0.15]"
             :class="{'ring-2 ring-[#005fb8] shadow-[#005fb8]/20': book.pinned}">
          <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#111111]/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none"></div>

          <!-- Pin badge -->
          <div v-if="book.pinned" class="absolute top-2 left-2 z-20 text-white text-[10px] font-bold bg-[#005fb8]/90 backdrop-blur-md rounded px-1.5 py-0.5 border border-[#005fb8]">置顶</div>

          <img v-if="book.cover_path" :src="book.cover_path" class="w-full h-full object-cover rounded-xl" alt="封面" @error="(e: Event) => (e.target as HTMLImageElement).style.display='none'" />
          <div v-else class="h-full w-full flex items-center justify-center opacity-70">
            <span class="text-5xl group-hover:scale-105 transition-transform duration-500">📖</span>
          </div>

          <!-- Actions -->
          <div class="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-20">
            <button @click.stop="togglePin(book)" class="p-1.5 rounded-md backdrop-blur-md transition-colors border shadow-sm"
                    :class="book.pinned ? 'bg-[#005fb8]/80 text-white border-transparent' : 'bg-black/60 text-white/70 hover:bg-black/90 hover:text-white border-black/10 dark:border-white/10'" :title="book.pinned ? '取消置顶' : '置顶'">
              <span class="text-sm leading-none block">📌</span>
            </button>
            <button @click.stop="setCover(book.id)" class="p-1.5 bg-black/60 hover:bg-black/90 shadow-sm text-white/70 hover:text-white rounded-md backdrop-blur-md transition-colors border border-black/10 dark:border-white/10" title="设置封面">
              <span class="text-sm leading-none block">🖼️</span>
            </button>
            <button v-if="book.cover_path" @click.stop="removeCover(book.id)" class="p-1.5 bg-black/60 hover:bg-black/90 shadow-sm text-white/70 hover:text-white rounded-md backdrop-blur-md transition-colors border border-black/10 dark:border-white/10" title="取消封面">
              <span class="text-sm leading-none block">✕</span>
            </button>
            <button @click.stop="deleteBook(book.id)" class="p-1.5 bg-red-600/80 hover:bg-red-500 shadow-sm text-white rounded-md backdrop-blur-md transition-colors border border-transparent" title="删除">
              <span class="text-sm leading-none block">🗑️</span>
            </button>
          </div>
        </div>

        <div class="mt-3 px-1">
          <h3 class="font-semibold text-[14px] text-slate-800 dark:text-white/90 truncate group-hover:text-[#005fb8] transition-colors duration-200">{{ book.title }}</h3>
          <div class="flex items-center justify-between mt-0.5">
            <p v-if="book.author" class="text-[12px] text-slate-500 dark:text-white/50 truncate max-w-[65%]">{{ book.author }}</p>
            <p class="text-[10px] text-slate-400 dark:text-white/30 font-mono">{{ formatDate(book.last_read) }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- LIST VIEW -->
    <div v-if="!loading && filteredBooks.length > 0 && viewMode === 'list'" class="flex flex-col gap-2 pb-10">
      <div v-for="(book, index) in filteredBooks" :key="'list-'+book.id" 
           class="group flex items-center bg-white dark:bg-[#2d2d2d] hover:bg-white/80 dark:hover:bg-[#323232] border border-black/5 dark:border-white/[0.04] hover:border-white/[0.15] rounded-lg p-2 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md hover:-translate-y-0.5 bookshelf-card"
           :style="{ animationDelay: `${index * 20}ms` }" @click="emit('open-book', book.id)">
        <div class="w-12 h-16 shrink-0 bg-[#222] rounded overflow-hidden shadow relative" :class="{'ring-1 ring-[#005fb8]': book.pinned}">
            <img v-if="book.cover_path" :src="book.cover_path" class="w-full h-full object-cover" />
            <div v-else class="h-full w-full flex items-center justify-center text-xl opacity-60">📖</div>
            <div v-if="book.pinned" class="absolute -top-1 -right-1 z-10 text-[8px] bg-[#005fb8] text-white px-1 rounded-sm">★</div>
        </div>
        <div class="flex-1 min-w-0 ml-4">
            <h3 class="font-semibold text-[15px] text-slate-800 dark:text-white/90 truncate group-hover:text-[#005fb8] transition-colors">{{ book.title }}</h3>
            <p class="text-[13px] text-slate-500 dark:text-white/50 truncate mt-0.5">{{ book.author || '未知作者' }}</p>
        </div>
        <div class="shrink-0 text-right px-4 hidden md:block">
            <p class="text-[12px] text-slate-400 dark:text-white/40 mb-1">上次阅读</p>
            <p class="text-[12px] font-mono text-slate-600 dark:text-white/60">{{ formatDate(book.last_read) }}</p>
        </div>
        <div class="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click.stop="togglePin(book)" class="p-2 rounded hover:bg-black/5 dark:bg-white/10 transition-colors" :class="book.pinned ? 'text-[#005fb8]' : 'text-slate-600 dark:text-white/60 hover:text-white'" title="置顶"><span class="block leading-none">📌</span></button>
            <button @click.stop="deleteBook(book.id)" class="p-2 rounded hover:bg-red-500/20 text-slate-600 dark:text-white/60 hover:text-red-400 transition-colors" title="删除"><span class="block leading-none">🗑️</span></button>
        </div>
      </div>
    </div>

    <!-- ICON VIEW -->
    <div v-if="!loading && filteredBooks.length > 0 && viewMode === 'icon'" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-6 pb-10">
      <div v-for="(book, index) in filteredBooks" :key="'icon-'+book.id" class="relative group cursor-pointer bookshelf-card flex flex-col justify-end" 
           :style="{ animationDelay: `${index * 15}ms` }" @click="emit('open-book', book.id)" :title="book.title">
        <div class="aspect-[3/4.2] bg-white dark:bg-[#2d2d2d] rounded-lg overflow-hidden relative shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-black/5 dark:border-white/[0.04] hover:border-white/[0.2]"
             :class="{'ring-2 ring-[#005fb8] shadow-[#005fb8]/20': book.pinned}">
            <div class="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-transparent opacity-60 z-10 pointer-events-none"></div>

            <div v-if="book.pinned" class="absolute top-1 left-1 z-20 text-[#005fb8] text-xs">★</div>

            <img v-if="book.cover_path" :src="book.cover_path" class="w-full h-full object-cover" />
            <div v-else class="h-full w-full flex items-center justify-center bg-[#222]">
                <span class="text-3xl opacity-40">📖</span>
            </div>

            <div class="absolute bottom-0 left-0 right-0 p-2 z-20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-black/80 backdrop-blur-sm">
                <button @click.stop="deleteBook(book.id)" class="w-full py-1 text-xs text-red-400 hover:text-white hover:bg-red-500 rounded transition-colors border border-transparent hover:border-red-400/50">删除本书</button>
            </div>
        </div>
      </div>
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
