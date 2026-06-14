<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface SnapshotManifest {
  id: string
  reason: string
  createdAt: number
  entityCounts: Record<string, number>
  chapterTextFiles: number
  sizeBytes: number
}

const snapshots = ref<SnapshotManifest[]>([])
const loading = ref(false)
const busy = ref(false)
const message = ref('')

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '—'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

const formatTime = (value: number) => {
  if (!value) return '—'
  return new Date(value).toLocaleString('zh-CN')
}

const refreshSnapshots = async () => {
  loading.value = true
  try {
    snapshots.value = await window.electronAPI.snapshot.list()
  } finally {
    loading.value = false
  }
}

const createSnapshot = async () => {
  busy.value = true
  message.value = ''
  try {
    await window.electronAPI.snapshot.create('手动创建')
    await refreshSnapshots()
    message.value = '恢复点已创建'
  } catch (error: any) {
    message.value = `创建失败：${error?.message || String(error)}`
  } finally {
    busy.value = false
  }
}

const restoreSnapshot = async (snapshot: SnapshotManifest) => {
  if (!confirm(`确定恢复到 ${formatTime(snapshot.createdAt)} 的数据吗？当前状态会先自动保存为新的恢复点。`)) return
  busy.value = true
  message.value = ''
  try {
    await window.electronAPI.snapshot.restore(snapshot.id)
    await refreshSnapshots()
    message.value = '已恢复，请重新进入相关页面查看最新数据'
  } catch (error: any) {
    message.value = `恢复失败：${error?.message || String(error)}`
  } finally {
    busy.value = false
  }
}

const deleteSnapshot = async (snapshot: SnapshotManifest) => {
  if (!confirm(`删除恢复点 ${formatTime(snapshot.createdAt)}？`)) return
  busy.value = true
  message.value = ''
  try {
    await window.electronAPI.snapshot.delete(snapshot.id)
    await refreshSnapshots()
    message.value = '恢复点已删除'
  } catch (error: any) {
    message.value = `删除失败：${error?.message || String(error)}`
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  refreshSnapshots().catch((error) => {
    message.value = `读取恢复点失败：${error?.message || String(error)}`
  })
})
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">本地恢复点</h3>
    <div class="app-card app-card-hover p-4">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div>
          <div class="text-[14px] font-medium app-title">自动快照与恢复</div>
          <div class="text-[12px] app-muted mt-1">每日启动、WebDAV 恢复、删除书籍和批量编辑前都会保留本地恢复点。</div>
        </div>
        <button
          @click="createSnapshot"
          :disabled="busy"
          class="app-button app-button-primary px-4 py-2 text-[13px] disabled:opacity-50"
        >
          创建恢复点
        </button>
      </div>

      <div v-if="message" class="mb-3 text-[12px] app-muted">{{ message }}</div>
      <div v-if="loading" class="py-8 text-center app-muted text-[13px]">正在读取恢复点...</div>
      <div v-else-if="snapshots.length === 0" class="py-8 text-center app-muted text-[13px]">暂无恢复点</div>
      <div v-else class="space-y-2">
        <div
          v-for="snapshot in snapshots"
          :key="snapshot.id"
          class="app-row rounded-[var(--app-radius-input)] border border-[var(--app-border)] p-3 flex items-center gap-3"
        >
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[13px] font-semibold app-title">{{ snapshot.reason }}</span>
              <span class="app-badge text-[10px] px-2 py-0.5">{{ formatBytes(snapshot.sizeBytes) }}</span>
            </div>
            <div class="text-[11px] app-muted mt-1 truncate">
              {{ formatTime(snapshot.createdAt) }} · 书籍 {{ snapshot.entityCounts.books || 0 }} · 章节 {{ snapshot.entityCounts.chapters || 0 }} · 统计 {{ snapshot.entityCounts.readingStats || 0 }} · 正文文件 {{ snapshot.chapterTextFiles }}
            </div>
          </div>
          <button
            @click="restoreSnapshot(snapshot)"
            :disabled="busy"
            class="app-button px-3 py-1.5 text-[12px] disabled:opacity-50"
          >
            恢复
          </button>
          <button
            @click="deleteSnapshot(snapshot)"
            :disabled="busy"
            class="app-button app-button-danger px-3 py-1.5 text-[12px] disabled:opacity-50"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
