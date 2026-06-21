<script setup lang="ts">
import { markRaw, shallowRef, watch, type Component } from 'vue'

const props = defineProps<{
  loader: () => Promise<{ default: Component }>
  componentProps?: Record<string, unknown>
}>()

const resolvedComponent = shallowRef<Component | null>(null)
const loading = shallowRef(true)
const loadError = shallowRef('')
let loadRun = 0

const load = async () => {
  const run = ++loadRun
  loading.value = true
  loadError.value = ''
  try {
    const module = await props.loader()
    if (run === loadRun) resolvedComponent.value = markRaw(module.default)
  } catch (error) {
    console.error('Async settings section failed to load:', error)
    if (run === loadRun) loadError.value = '该设置区块加载失败。'
  } finally {
    if (run === loadRun) loading.value = false
  }
}

watch(() => props.loader, load, { immediate: true })
</script>

<template>
  <div v-if="loading" class="async-placeholder" aria-busy="true" aria-label="正在加载设置">
    <span></span><span></span><span></span>
  </div>
  <div v-else-if="loadError" class="app-card async-error" role="alert">
    <p>{{ loadError }}</p>
    <button type="button" class="app-button app-button-primary" @click="load">重试</button>
  </div>
  <component :is="resolvedComponent" v-else-if="resolvedComponent" v-bind="componentProps" />
</template>

<style scoped>
.async-placeholder { display:grid; gap:12px; padding:18px 4px 34px; }
.async-placeholder span { display:block; height:54px; border-radius:12px; background:linear-gradient(90deg, var(--app-surface) 25%, var(--app-surface-secondary) 50%, var(--app-surface) 75%); background-size:200% 100%; animation:async-shimmer 1.2s infinite; }
.async-placeholder span:first-child { width:34%; height:18px; }
.async-error { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px; font-size:13px; color:var(--app-danger); }
@keyframes async-shimmer { to { background-position:-200% 0; } }
</style>
