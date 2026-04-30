<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'

const props = defineProps<{
  coverPath?: string | null
  title?: string | null
  alt?: string
}>()

const imageFailed = ref(false)
const coversBaseUrl = ref('')

onMounted(async () => {
  try {
    const userData = await window.electronAPI.app.getPath('userData')
    coversBaseUrl.value = 'file:///' + userData.replace(/\\/g, '/') + '/covers/'
  } catch {}
})

const resolvedCoverSrc = computed(() => {
  const cp = props.coverPath
  if (!cp) return null
  // Already a file:/// URL — use as-is
  if (cp.startsWith('file:///')) return cp
  if (cp.startsWith('file://')) return cp
  // Extract filename from any path (Windows, Unix, Android, etc.)
  const filename = cp.replace(/\\/g, '/').split('/').pop() || cp
  if (!filename) return null
  if (coversBaseUrl.value) return coversBaseUrl.value + filename
  return cp
})

const initials = computed(() => {
  const title = (props.title || '').trim()
  if (!title) return '书'
  return title.slice(0, 2)
})

watch(() => props.coverPath, () => {
  imageFailed.value = false
})
</script>

<template>
  <div class="app-book-cover overflow-hidden relative flex items-center justify-center">
    <img
      v-if="resolvedCoverSrc && !imageFailed"
      :src="resolvedCoverSrc"
      class="w-full h-full object-cover"
      :alt="alt || title || '封面'"
      @error="imageFailed = true"
    />
    <div v-else class="book-cover-fallback">
      {{ initials }}
    </div>
  </div>
</template>

<style scoped>
.book-cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  color: var(--app-text-on-primary);
  font-size: clamp(1rem, 14%, 2.75rem);
  font-weight: 800;
  letter-spacing: 0;
  text-align: center;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--app-accent-hover) 85%, #111 15%), var(--app-accent));
}
</style>
