<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'

interface Chapter { id: number; title: string; order_index: number }

const props = defineProps<{
  chapters: Chapter[]
  currentChapterIndex: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'jump', index: number): void
}>()

const tocListRef = ref<HTMLElement | null>(null)

const scrollToActive = () => {
  nextTick(() => {
    const el = tocListRef.value?.querySelector('.toc-active') as HTMLElement
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior })
  })
}

onMounted(scrollToActive)
watch(() => props.currentChapterIndex, scrollToActive)

const handleJump = (index: number) => {
  emit('jump', index)
}
</script>

<template>
  <div class="toc-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">目录</span><button @click="$emit('close')" class="px">✕</button></div>
    <div ref="tocListRef" class="toc-l">
      <button v-for="(ch, i) in chapters" :key="ch.id" @click="handleJump(i)" class="toc-i" :class="{ 'toc-active': i === currentChapterIndex }">
        <span class="ti">{{ i + 1 }}</span><span class="tn">{{ ch.title }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toc-p { position:absolute; left:20px; top:60px; max-height: calc(100% - 180px); width:300px; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; touch-action: pan-y; }
.toc-l { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:2px; -webkit-overflow-scrolling: touch; }
.toc-l::-webkit-scrollbar { width:4px; }
.toc-l::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.toc-i { display:flex; align-items:center; gap:10px; padding:8px 12px; border-radius:8px; border:none; background:transparent; color:rgba(255,255,255,0.6); font-size:13px; cursor:pointer; text-align:left; transition:all .15s; }
.toc-i:hover { background:rgba(255,255,255,0.06); color:white; }
.toc-active { background:rgba(59,130,246,0.15)!important; color:#60a5fa!important; font-weight:700; }
.ti { font-size:10px; opacity:0.4; min-width:24px; font-family:monospace; }
.tn { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
</style>
