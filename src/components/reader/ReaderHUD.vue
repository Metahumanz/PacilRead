<script setup lang="ts">
defineProps<{
  topLeft: string
  topCenter: string
  topRight: string
  bottomLeft: string
  bottomCenter: string
  bottomRight: string
}>()
</script>

<template>
  <div class="hud hud-t">
    <div class="hs hs-l"><span v-if="topLeft" class="hp">{{ topLeft }}</span></div>
    <div class="hs hs-c"><span v-if="topCenter" class="hp text-center">{{ topCenter }}</span></div>
    <div class="hs hs-r"><span v-if="topRight" class="hp text-right">{{ topRight }}</span></div>
  </div>
  <div class="hud hud-b">
    <div class="hs hs-l"><span v-if="bottomLeft" class="hp">{{ bottomLeft }}</span></div>
    <div class="hs hs-c"><span v-if="bottomCenter" class="hp text-center">{{ bottomCenter }}</span></div>
    <div class="hs hs-r"><span v-if="bottomRight" class="hp text-right">{{ bottomRight }}</span></div>
  </div>
</template>

<style scoped>
.hud { position: fixed; left: 0; right: 0; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; pointer-events: none; z-index: 50; transition: opacity 0.3s; }
.hud-t { top: 0; }
.hud-b { bottom: 0; }
.hs { flex: 1; display: flex; align-items: center; }
.hs-l { justify-content: flex-start; }
.hs-c { justify-content: center; }
.hs-r { justify-content: flex-end; }
.hp { padding: 4px 12px; background: rgba(0,0,0,0.25); backdrop-filter: blur(8px); border-radius: 100px; font-size: 11px; color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.05); }
</style>
