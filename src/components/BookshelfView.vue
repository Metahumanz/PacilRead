<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useSettings } from '../composables/useSettings'
import { useDataStore } from '../composables/useDataStore'
import { useSync } from '../composables/useSync'
import BookCover from './common/BookCover.vue'
import { perfLog, perfNow } from '../utils/perf'
import { matchesBookshelfFilters } from '../utils/bookshelfManagement'
import { normalizeTags, type ReadingStatus } from '../utils/bookMetadata'
import type { BatchClassificationOperation } from '../types/entities'
import { notifyError, notifySuccess } from '../composables/useNotifications'
import { getErrorMessage } from '../utils/errorMessage'

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
  tags: string[]
  series: string
  readingStatus: ReadingStatus
}

const emit = defineEmits<{ (e: 'open-book', bookId: number): void }>()

const settings = useSettings()
const {
  viewMode, bookshelfShowAddEntry, bookshelfProgressPrefetchLimit, settingsLoaded, saveSetting
} = settings
const { canDownloadProgressFromWebdav, getApplicableProgressFromWebdav } = useSync()

const books = ref<BookDisplay[]>([])
const loading = ref(true)
const importing = ref(false)
const progressSyncStatus = ref('')
const managementMode = ref(false)
const selectedBookIds = ref<Set<number>>(new Set())
const selectedTag = ref('')
const selectedSeries = ref('')
const selectedStatus = ref('')
const batchWorking = ref(false)
const showBatchClassification = ref(false)
const classificationStep = ref<'actions' | 'input' | 'status'>('actions')
const classificationAction = ref<'addTags' | 'removeTags' | 'setSeries' | null>(null)
const classificationValue = ref('')
const classificationError = ref('')

const searchQuery = ref('')
let progressPrefetchRun = 0
let progressSyncStatusTimer: number | null = null

const invalidateDataStore = () => {
  const dataStore = useDataStore()
  dataStore.dataLoaded.value = false
}

const filteredBooks = computed(() => {
  return books.value.filter(book => matchesBookshelfFilters(book, {
    query: searchQuery.value,
    tag: selectedTag.value,
    series: selectedSeries.value,
    status: selectedStatus.value,
  }))
})

const availableTags = computed(() => Array.from(new Set(books.value.flatMap(book => book.tags || []))).sort((a, b) => a.localeCompare(b, 'zh-CN')))
const availableSeries = computed(() => Array.from(new Set(books.value.map(book => book.series).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-CN')))
const hasActiveFilters = computed(() => Boolean(selectedTag.value || selectedSeries.value || selectedStatus.value))
const selectedCount = computed(() => selectedBookIds.value.size)

const bookshelfStatusText = computed(() => (
  progressSyncStatus.value || (hasActiveFilters.value
    ? `筛选结果 ${filteredBooks.value.length} 本，共 ${books.value.length} 本`
    : `共 ${filteredBooks.value.length} 本书籍`)
))

const sortBooks = (items: BookDisplay[]) => [...items].sort((a, b) => {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  if (a.lastReadAt !== b.lastReadAt) return b.lastReadAt - a.lastReadAt
  return a.title.localeCompare(b.title, 'zh-CN')
})

const clearProgressSyncStatusTimer = () => {
  if (progressSyncStatusTimer !== null) {
    window.clearTimeout(progressSyncStatusTimer)
    progressSyncStatusTimer = null
  }
}

const showProgressSyncFailure = () => {
  progressSyncStatus.value = '云端进度同步失败，已展示本地进度'
  clearProgressSyncStatusTimer()
  progressSyncStatusTimer = window.setTimeout(() => {
    progressSyncStatus.value = ''
    progressSyncStatusTimer = null
  }, 3000)
}

const prefetchBookshelfProgress = async () => {
  const run = ++progressPrefetchRun
  clearProgressSyncStatusTimer()
  if (!canDownloadProgressFromWebdav() || books.value.length === 0 || bookshelfProgressPrefetchLimit.value <= 0) {
    progressSyncStatus.value = ''
    return
  }

  const candidates = books.value
    .slice(0, bookshelfProgressPrefetchLimit.value)
    .map(book => ({ ...book }))
  let failures = 0

  for (let index = 0; index < candidates.length; index++) {
    if (run !== progressPrefetchRun) return
    progressSyncStatus.value = `正在同步云端阅读进度 ${index + 1}/${candidates.length}...`
    const book = candidates[index]

    try {
      const remote = await getApplicableProgressFromWebdav(book)
      if (!remote || run !== progressPrefetchRun) continue

      books.value = sortBooks(books.value.map(item => {
        if (item.id !== book.id) return item
        const maxProgressIndex = Math.max(0, item.chapterCount - 1)
        return {
          ...item,
          progressIndex: Math.min(Math.max(remote.durChapterIndex, 0), maxProgressIndex),
          lastReadAt: remote.durChapterTime,
          currentChapterTitle: remote.durChapterTitle || item.currentChapterTitle,
        }
      }))
    } catch (error) {
      failures++
      console.error('Failed to prefetch WebDAV progress:', error)
    }
  }

  if (run !== progressPrefetchRun) return
  if (failures > 0) {
    showProgressSyncFailure()
  } else {
    progressSyncStatus.value = ''
  }
}

const fetchBooks = async () => {
  const startedAt = perfNow()
  let fetched = false
  try {
    loading.value = true
    books.value = await window.electronAPI.library.getBookshelfBooks()
    fetched = true
  } catch (error) {
    console.error('Failed to fetch books:', error)
  } finally {
    loading.value = false
    perfLog('bookshelf:fetchBooks', startedAt, `books=${books.value.length}`)
  }
  if (fetched) void prefetchBookshelfProgress()
}

const importSelectedFile = async (filePath: string, allowDuplicate = false) => {
  const result = await window.electronAPI.library.importBook(filePath, allowDuplicate)
  if (result.status === 'duplicate') {
    const reason = result.matchType === 'exact_content' ? '内容完全相同' : '书名和作者相同'
    if (confirm(`发现重复书籍（${reason}）：《${result.title}》\n\n确定仍然导入吗？`)) {
      return importSelectedFile(filePath, true)
    }
    return false
  }
  console.log(`Imported ${result.chapterCount} chapters`)
  return true
}

const addBook = async () => {
  const filePath = await window.electronAPI.dialog.openFile()
  if (!filePath) return
  try {
    importing.value = true
    const imported = await importSelectedFile(filePath)
    if (imported) {
      invalidateDataStore()
      await fetchBooks()
    }
  } catch (error) {
    console.error('Failed to add book:', error)
    alert('导入失败: ' + (error as Error).message)
  } finally {
    importing.value = false
  }
}

const setManagementMode = (enabled: boolean) => {
  managementMode.value = enabled
  if (!enabled) {
    selectedBookIds.value = new Set()
    showBatchClassification.value = false
  }
}

const toggleBookSelection = (bookId: number) => {
  const next = new Set(selectedBookIds.value)
  if (next.has(bookId)) next.delete(bookId)
  else next.add(bookId)
  selectedBookIds.value = next
}

const handleBookClick = (bookId: number) => {
  if (managementMode.value) toggleBookSelection(bookId)
  else emit('open-book', bookId)
}

const clearFilters = () => {
  selectedTag.value = ''
  selectedSeries.value = ''
  selectedStatus.value = ''
}

const refreshAfterBatch = async () => {
  invalidateDataStore()
  await fetchBooks()
}

const openBatchClassification = () => {
  if (!selectedCount.value) return
  classificationStep.value = 'actions'
  classificationAction.value = null
  classificationValue.value = ''
  classificationError.value = ''
  showBatchClassification.value = true
}

const closeBatchClassification = () => {
  if (batchWorking.value) return
  showBatchClassification.value = false
}

const applyBatchClassification = async (operation: BatchClassificationOperation) => {
  if (!selectedCount.value) return
  try {
    batchWorking.value = true
    await window.electronAPI.library.batchClassifyBooks(Array.from(selectedBookIds.value), operation)
    await refreshAfterBatch()
    showBatchClassification.value = false
  } catch (error) {
    console.error('Batch classification failed:', error)
    classificationError.value = '分类更新失败，请重试'
    notifyError(getErrorMessage(error, '分类更新失败，请重试'))
  } finally {
    batchWorking.value = false
  }
}

const chooseClassificationAction = (action: 'addTags' | 'removeTags' | 'setSeries' | 'clearSeries' | 'setStatus') => {
  classificationError.value = ''
  if (action === 'clearSeries') {
    void applyBatchClassification({ type: 'setSeries', series: '' })
    return
  }
  if (action === 'setStatus') {
    classificationStep.value = 'status'
    return
  }
  classificationAction.value = action
  classificationValue.value = ''
  classificationStep.value = 'input'
}

const submitClassificationInput = () => {
  const action = classificationAction.value
  if (!action) return
  classificationError.value = ''
  if (action === 'setSeries') {
    void applyBatchClassification({ type: 'setSeries', series: classificationValue.value.trim() })
    return
  }
  const tags = normalizeTags(classificationValue.value)
  if (!tags.length) {
    classificationError.value = '请输入至少一个标签'
    return
  }
  void applyBatchClassification({ type: action, tags })
}

const submitClassificationStatus = (status: ReadingStatus) => {
  void applyBatchClassification({ type: 'setReadingStatus', status })
}

const batchDelete = async () => {
  if (!selectedCount.value || !confirm(`确定删除选中的 ${selectedCount.value} 本书吗？\n将同时删除章节、书签和本地文件。`)) return
  try {
    batchWorking.value = true
    const result = await window.electronAPI.library.deleteBooks(Array.from(selectedBookIds.value))
    selectedBookIds.value = new Set()
    await refreshAfterBatch()
    notifySuccess(`已删除 ${result.deleted} 本书籍`)
  } catch (error) {
    console.error('Batch delete failed:', error)
    notifyError(getErrorMessage(error, '批量删除失败，请重试'))
  } finally {
    batchWorking.value = false
  }
}

const batchExport = async () => {
  if (!selectedCount.value) return
  try {
    batchWorking.value = true
    const result = await window.electronAPI.library.exportBooks(Array.from(selectedBookIds.value))
    if (!result.canceled) {
      if (result.failed) notifyError(`导出完成：成功 ${result.success}，失败 ${result.failed}`)
      else notifySuccess(`已导出 ${result.success} 本书籍`)
    }
  } catch (error) {
    console.error('Batch export failed:', error)
    notifyError(getErrorMessage(error, '批量导出失败，请重试'))
  } finally {
    batchWorking.value = false
  }
}

const deleteBook = async (bookId: number) => {
  if (!confirm('确定要删除这本书吗？')) return
  try {
    await window.electronAPI.library.deleteBook(bookId)
    invalidateDataStore()
    await fetchBooks()
    notifySuccess('书籍已删除')
  } catch (error) {
    console.error('Failed to delete book:', error)
    notifyError(getErrorMessage(error, '删除书籍失败，请重试'))
  }
}

const setCover = async (bookId: number) => {
  const filePath = await window.electronAPI.dialog.openImage()
  if (!filePath) return
  try {
    const result = await window.electronAPI.app.copyCover(filePath)
    if (!result.success) throw new Error(result.error || '复制封面失败')
    await window.electronAPI.library.updateBook(bookId, { coverFile: result.filename! })
    invalidateDataStore()
    await fetchBooks()
  } catch (error) {
    console.error('Failed to set cover:', error)
    notifyError(getErrorMessage(error, '设置封面失败，请重试'))
  }
}

const removeCover = async (bookId: number) => {
  try {
    await window.electronAPI.library.updateBook(bookId, { coverFile: null })
    invalidateDataStore()
    await fetchBooks()
  } catch (error) {
    console.error('Failed to remove cover:', error)
    notifyError(getErrorMessage(error, '移除封面失败，请重试'))
  }
}

const togglePin = async (book: BookDisplay) => {
  try {
    await window.electronAPI.library.updateBook(book.id, { pinned: !book.pinned })
    invalidateDataStore()
    await fetchBooks()
  } catch (error) {
    console.error('Failed to toggle pin:', error)
    notifyError(getErrorMessage(error, '更新置顶状态失败，请重试'))
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
watch(settingsLoaded, (loaded) => {
  if (loaded && books.value.length > 0) void prefetchBookshelfProgress()
})
onUnmounted(() => {
  progressPrefetchRun++
  clearProgressSyncStatusTimer()
})
</script>

<template>
  <div class="pt-6">
    <div class="flex items-center justify-between mb-8 gap-4">
      <div>
        <h2 class="app-title text-[22px] font-semibold">我的书架</h2>
        <p class="app-muted text-[13px] mt-1">{{ bookshelfStatusText }}</p>
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
        
        <button @click="setManagementMode(!managementMode)" class="app-button px-4 py-2 shrink-0 text-[13px] font-semibold">
          {{ managementMode ? '完成' : '管理' }}
        </button>

        <button v-if="bookshelfShowAddEntry && !managementMode" @click="addBook" :disabled="importing" class="app-button app-button-primary group px-4 py-2 shrink-0 disabled:opacity-45 disabled:hover:translate-y-0 flex justify-center items-center gap-1.5">
          <span class="text-lg leading-none">{{ importing ? '⏳' : '+' }}</span>
          <span class="text-[13px] whitespace-nowrap">{{ importing ? '导入...' : '添加' }}</span>
        </button>
      </div>
    </div>

    <div v-if="managementMode" class="app-card mb-6 p-3 flex flex-wrap items-center gap-2">
      <select v-model="selectedTag" class="app-input px-3 py-2 text-[12px] min-w-[8rem]">
        <option value="">全部标签</option>
        <option v-for="tag in availableTags" :key="tag" :value="tag">{{ tag }}</option>
      </select>
      <select v-model="selectedSeries" class="app-input px-3 py-2 text-[12px] min-w-[8rem]">
        <option value="">全部系列</option>
        <option v-for="series in availableSeries" :key="series" :value="series">{{ series }}</option>
      </select>
      <select v-model="selectedStatus" class="app-input px-3 py-2 text-[12px] min-w-[8rem]">
        <option value="">全部状态</option>
        <option value="unread">未读</option>
        <option value="reading">阅读中</option>
        <option value="finished">已读完</option>
      </select>
      <button @click="clearFilters" :disabled="!hasActiveFilters" class="app-button px-3 py-2 text-[12px] disabled:opacity-40">清除筛选</button>
      <span class="app-muted text-[12px] ml-auto">已选 {{ selectedCount }} 本</span>
      <button @click="openBatchClassification" :disabled="!selectedCount || batchWorking" class="app-button px-3 py-2 text-[12px] disabled:opacity-40">分类</button>
      <button @click="batchExport" :disabled="!selectedCount || batchWorking" class="app-button px-3 py-2 text-[12px] disabled:opacity-40">导出</button>
      <button @click="batchDelete" :disabled="!selectedCount || batchWorking" class="app-button px-3 py-2 text-[12px] text-red-500 disabled:opacity-40">删除</button>
    </div>

    <Transition name="fade">
      <div v-if="showBatchClassification" class="classification-backdrop" @click="closeBatchClassification" @wheel.stop>
        <div class="classification-panel" role="dialog" aria-modal="true" aria-labelledby="classification-title" @click.stop>
          <div class="classification-header">
            <div>
              <h3 id="classification-title">批量分类</h3>
              <p>将应用到已选的 {{ selectedCount }} 本书</p>
            </div>
            <button class="classification-close" :disabled="batchWorking" @click="closeBatchClassification">✕</button>
          </div>

          <div v-if="classificationStep === 'actions'" class="classification-actions">
            <button @click="chooseClassificationAction('addTags')">添加标签</button>
            <button @click="chooseClassificationAction('removeTags')">移除标签</button>
            <button @click="chooseClassificationAction('setSeries')">设置系列</button>
            <button @click="chooseClassificationAction('clearSeries')">清除系列</button>
            <button @click="chooseClassificationAction('setStatus')">设置阅读状态</button>
          </div>

          <div v-else-if="classificationStep === 'input'" class="classification-form">
            <label>{{ classificationAction === 'setSeries' ? '系列名称' : '标签，用逗号分隔' }}</label>
            <input
              v-model="classificationValue"
              class="app-input"
              autofocus
              :placeholder="classificationAction === 'setSeries' ? '输入系列名称' : '例如：科幻, 长篇'"
              @keydown.enter="submitClassificationInput"
            />
            <p v-if="classificationError" class="classification-error">{{ classificationError }}</p>
            <div class="classification-footer">
              <button class="app-button" :disabled="batchWorking" @click="classificationStep = 'actions'">返回</button>
              <button class="app-button app-button-primary" :disabled="batchWorking" @click="submitClassificationInput">{{ batchWorking ? '处理中…' : '确定' }}</button>
            </div>
          </div>

          <div v-else class="classification-form">
            <label>阅读状态</label>
            <div class="classification-statuses">
              <button :disabled="batchWorking" @click="submitClassificationStatus('unread')">未读</button>
              <button :disabled="batchWorking" @click="submitClassificationStatus('reading')">阅读中</button>
              <button :disabled="batchWorking" @click="submitClassificationStatus('finished')">已读完</button>
            </div>
            <p v-if="classificationError" class="classification-error">{{ classificationError }}</p>
            <div class="classification-footer">
              <button class="app-button" :disabled="batchWorking" @click="classificationStep = 'actions'">返回</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

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
      <p class="text-lg app-muted mb-3">没有找到匹配的书籍</p>
    </div>

    <!-- GRID VIEW -->
    <div v-if="!loading && filteredBooks.length > 0 && viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 pb-10">
      <div v-for="(book, index) in filteredBooks" :key="book.id" class="relative group cursor-pointer bookshelf-card flex flex-col"
           :style="{ animationDelay: `${index * 30}ms` }" @click="handleBookClick(book.id)">
        <div class="app-card app-card-hover aspect-[3/4.2] overflow-hidden relative"
             :class="{'ring-2 ring-[var(--app-accent)]': book.pinned || selectedBookIds.has(book.id), 'bookshelf-selected': selectedBookIds.has(book.id)}">
          <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#111111]/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none"></div>

          <div v-if="book.pinned" class="app-badge is-active absolute top-2 left-2 z-20 text-[10px] font-bold px-1.5 py-0.5">置顶</div>

          <BookCover class="w-full h-full rounded-xl bookshelf-grid-cover" :cover-path="book.coverFile" :title="book.title" />

          <div v-if="!managementMode" class="absolute top-2 right-2 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-20">
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
        v-if="bookshelfShowAddEntry && !managementMode"
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
           :class="{ 'bookshelf-selected': selectedBookIds.has(book.id) }"
           :style="{ animationDelay: `${index * 20}ms` }" @click="handleBookClick(book.id)">
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
        <div v-if="!managementMode" class="bookshelf-list-actions">
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
        v-if="bookshelfShowAddEntry && !managementMode"
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

.bookshelf-selected {
  border-color: var(--app-accent) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 58%, transparent),
    0 14px 34px color-mix(in srgb, var(--app-accent) 16%, transparent) !important;
}

.classification-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--app-scrim);
}

.classification-panel {
  width: min(420px, 100%);
  padding: 20px;
  color: var(--app-text);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-dialog);
  box-shadow: var(--app-shadow-hover);
}

.classification-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.classification-header h3 { font-size: 17px; font-weight: 750; }
.classification-header p { margin-top: 3px; color: var(--app-text-muted); font-size: 12px; }
.classification-close { border: 0; background: transparent; color: var(--app-text-muted); cursor: pointer; }
.classification-actions { display: grid; gap: 7px; }
.classification-actions button,.classification-statuses button {
  min-height: 42px;
  padding: 9px 12px;
  color: var(--app-text);
  background: var(--app-surface-secondary);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-button);
  cursor: pointer;
  text-align: left;
}
.classification-actions button:hover,.classification-statuses button:hover { border-color: var(--app-accent); background: var(--app-accent-soft); }
.classification-form { display: grid; gap: 12px; }
.classification-form>label { color: var(--app-text-secondary); font-size: 12px; font-weight: 700; }
.classification-form .app-input { width: 100%; padding: 10px 12px; }
.classification-statuses { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
.classification-statuses button { text-align: center; }
.classification-error { color: var(--app-danger); font-size: 12px; }
.classification-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

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
