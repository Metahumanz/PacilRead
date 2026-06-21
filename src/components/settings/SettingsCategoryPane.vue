<script setup lang="ts">
import type { Component } from 'vue'
import AsyncComponentHost from '../common/AsyncComponentHost.vue'

interface SettingsPaneItem {
  key: string
  loader: () => Promise<{ default: Component }>
  props?: Record<string, unknown>
}

defineProps<{ items: SettingsPaneItem[] }>()
</script>

<template>
  <div>
    <AsyncComponentHost
      v-for="item in items"
      :key="item.key"
      :loader="item.loader"
      :component-props="item.props"
    />
  </div>
</template>
