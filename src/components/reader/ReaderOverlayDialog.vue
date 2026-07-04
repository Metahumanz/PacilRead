<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  open: boolean
  kind: 'small' | 'large'
  origin?: string
}>(), {
  origin: 'center center',
})

defineEmits<{
  (e: 'close'): void
}>()

const transitionName = computed(() => props.kind === 'small' ? 'reader-small-pop' : 'reader-large-pop')
</script>

<template>
  <Transition :name="transitionName" appear>
    <div
      v-if="open"
      class="reader-overlay"
      :class="`is-${kind}`"
      @wheel.stop
      @contextmenu.stop
    >
      <button class="reader-overlay-backdrop" type="button" aria-label="关闭" @click="$emit('close')"></button>
      <section
        class="reader-overlay-card"
        :class="`is-${kind}`"
        :style="{ transformOrigin: origin }"
        role="dialog"
        aria-modal="true"
        @click.stop
        @wheel.stop
        @contextmenu.stop
      >
        <slot></slot>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.reader-overlay {
  position: fixed;
  inset: 0;
  z-index: 96;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--app-text, #f8fafc);
  pointer-events: auto;
}

.reader-overlay-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  cursor: default;
}

.reader-overlay-card {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: #f8fafc;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  box-shadow: 0 24px 76px rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
}

.reader-overlay-card.is-small {
  width: min(420px, calc(100vw - 32px));
  max-height: min(78vh, 640px);
}

.reader-overlay-card.is-large {
  width: min(920px, max(50vw, 620px));
  height: min(88vh, 820px);
  display: flex;
  flex-direction: column;
}

.reader-overlay-card :deep(.search-p),
.reader-overlay-card :deep(.toc-p),
.reader-overlay-card :deep(.bookmark-p),
.reader-overlay-card :deep(.rules-p),
.reader-overlay-card :deep(.reader-options-p),
.reader-overlay-card :deep(.sty-p) {
  position: static;
  inset: auto;
  width: 100%;
  max-width: none;
  max-height: none;
  min-height: 0;
  box-sizing: border-box;
  z-index: auto;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.reader-overlay-card.is-large :deep(.search-p),
.reader-overlay-card.is-large :deep(.toc-p),
.reader-overlay-card.is-large :deep(.bookmark-p),
.reader-overlay-card.is-large :deep(.rules-p),
.reader-overlay-card.is-large :deep(.reader-options-p),
.reader-overlay-card.is-large :deep(.sty-p) {
  height: 100%;
  overflow: hidden;
}

.reader-overlay-card.is-large :deep(.sty-p),
.reader-overlay-card.is-large :deep(.reader-options-p),
.reader-overlay-card.is-large :deep(.bookmark-p) {
  overflow-y: auto;
}

.reader-overlay-card.is-small :deep(.sty-p) {
  max-height: min(78vh, 640px);
  overflow-y: auto;
}

.reader-small-pop-enter-active,
.reader-small-pop-leave-active,
.reader-large-pop-enter-active,
.reader-large-pop-leave-active {
  transition: opacity 180ms ease;
}

.reader-small-pop-enter-active .reader-overlay-card {
  transition: opacity 170ms cubic-bezier(.16, 1, .3, 1), transform 170ms cubic-bezier(.16, 1, .3, 1);
}

.reader-small-pop-leave-active .reader-overlay-card {
  transition: opacity 120ms ease, transform 120ms ease;
}

.reader-small-pop-enter-from,
.reader-small-pop-leave-to,
.reader-large-pop-enter-from,
.reader-large-pop-leave-to {
  opacity: 0;
}

.reader-small-pop-enter-from .reader-overlay-card,
.reader-small-pop-leave-to .reader-overlay-card {
  opacity: 0;
  transform: scale(0.96);
}

.reader-large-pop-enter-active .reader-overlay-card {
  transition: opacity 240ms cubic-bezier(.16, 1, .3, 1), transform 240ms cubic-bezier(.16, 1, .3, 1);
}

.reader-large-pop-leave-active .reader-overlay-card {
  transition: opacity 170ms ease, transform 170ms ease;
}

.reader-large-pop-enter-from .reader-overlay-card,
.reader-large-pop-leave-to .reader-overlay-card {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

@media (orientation: portrait), (max-width: 760px) {
  .reader-overlay.is-large {
    align-items: flex-end;
    padding: 0;
  }

  .reader-overlay-card.is-large {
    width: 100vw;
    height: 100dvh;
    max-height: none;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: 18px 18px 0 0;
  }

  .reader-large-pop-enter-from .reader-overlay-card,
  .reader-large-pop-leave-to .reader-overlay-card {
    transform: translateY(34px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reader-small-pop-enter-active,
  .reader-small-pop-leave-active,
  .reader-large-pop-enter-active,
  .reader-large-pop-leave-active,
  .reader-small-pop-enter-active .reader-overlay-card,
  .reader-small-pop-leave-active .reader-overlay-card,
  .reader-large-pop-enter-active .reader-overlay-card,
  .reader-large-pop-leave-active .reader-overlay-card {
    transition-duration: 80ms;
  }

  .reader-small-pop-enter-from .reader-overlay-card,
  .reader-small-pop-leave-to .reader-overlay-card,
  .reader-large-pop-enter-from .reader-overlay-card,
  .reader-large-pop-leave-to .reader-overlay-card {
    transform: none;
  }
}
</style>
