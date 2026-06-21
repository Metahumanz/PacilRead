<script setup lang="ts">
import { useNotifications } from '../../composables/useNotifications'

const { notifications, dismissNotification } = useNotifications()
</script>

<template>
  <div class="toast-host" aria-label="通知">
    <TransitionGroup name="toast">
      <div
        v-for="item in notifications"
        :key="item.id"
        class="toast-item"
        :class="`toast-${item.type}`"
        :role="item.type === 'error' ? 'alert' : 'status'"
        :aria-live="item.type === 'error' ? 'assertive' : 'polite'"
      >
        <span class="toast-mark" aria-hidden="true">{{ item.type === 'success' ? '✓' : item.type === 'error' ? '!' : '•' }}</span>
        <span class="toast-message">{{ item.message }}</span>
        <button class="toast-close" type="button" aria-label="关闭通知" @click="dismissNotification(item.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host { position: fixed; z-index: 10000; top: 18px; right: 18px; display: grid; gap: 10px; width: min(380px, calc(100vw - 32px)); pointer-events: none; }
.toast-item { display: grid; grid-template-columns: 22px 1fr auto; align-items: start; gap: 10px; padding: 12px 12px 12px 14px; border: 1px solid var(--app-border); border-radius: 12px; color: var(--app-text); background: color-mix(in srgb, var(--app-surface) 94%, transparent); box-shadow: 0 12px 34px rgba(0, 0, 0, .18); backdrop-filter: blur(14px); pointer-events: auto; }
.toast-mark { display: grid; place-items: center; width: 21px; height: 21px; border-radius: 50%; font-weight: 700; }
.toast-success .toast-mark { color: #087a45; background: rgba(34, 197, 94, .16); }
.toast-error .toast-mark { color: #c13232; background: rgba(239, 68, 68, .16); }
.toast-warning .toast-mark { color: #a65d00; background: rgba(245, 158, 11, .18); }
.toast-message { font-size: 13px; line-height: 1.55; overflow-wrap: anywhere; }
.toast-close { border: 0; padding: 0 2px; color: var(--app-text-muted); background: transparent; font-size: 20px; line-height: 1; cursor: pointer; }
.toast-enter-active, .toast-leave-active { transition: opacity .18s ease, transform .18s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
@media (max-width: 520px) { .toast-host { top: 12px; right: 12px; width: calc(100vw - 24px); } }
</style>
