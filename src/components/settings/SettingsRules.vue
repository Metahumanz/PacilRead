<script setup lang="ts">
import { ref } from 'vue'
import type { ReplacementRuleView } from '../../types/entities'

const {
  rules,
  getBookTitle,
  deleteRule,
  toggleRuleActive
} = defineProps<{
  rules: ReplacementRuleView[]
  getBookTitle: (id: number | null) => string
  deleteRule: (id: number) => void
  toggleRuleActive: (rule: ReplacementRuleView) => void
}>()

const ruleFilter = ref<'all' | 'global' | 'book'>('all')

const filteredRules = () => {
  if (ruleFilter.value === 'all') return rules
  if (ruleFilter.value === 'global') return rules.filter(r => r.scope === 'global')
  return rules.filter(r => r.scope === 'book')
}
</script>

<template>
  <div class="mb-8">
    <h3 class="app-section-label text-[14px] mb-3 px-1">内容处理 (正则过滤)</h3>
    <div class="app-card app-card-hover overflow-hidden">
      <div class="app-divider p-4 border-b">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[13px] app-muted">在阅读界面中添加用于文字净化的替换规则，在此处可以浏览并控制全部规则启用状态。</p>
          <div class="app-card flex p-0.5">
            <button @click="ruleFilter='all'" class="app-chip px-3 py-1 text-[11px] font-medium transition-colors" :class="{ 'is-active': ruleFilter==='all' }">全部</button>
            <button @click="ruleFilter='global'" class="app-chip px-3 py-1 text-[11px] font-medium transition-colors" :class="{ 'is-active': ruleFilter==='global' }">全局级</button>
            <button @click="ruleFilter='book'" class="app-chip px-3 py-1 text-[11px] font-medium transition-colors" :class="{ 'is-active': ruleFilter==='book' }">单书级</button>
          </div>
        </div>
      </div>
      
      <div v-if="filteredRules().length === 0" class="py-12 flex flex-col items-center justify-center">
        <span class="text-3xl opacity-30 mb-2">📝</span>
        <p class="text-[12px] app-muted">空无一物，规则大本营闲置中</p>
      </div>

      <div v-else class="app-divide-y">
        <div v-for="rule in filteredRules()" :key="rule.id" class="app-row p-3 mx-2 my-2 rounded-[var(--app-radius-input)] border border-transparent flex items-center justify-between group transition-colors" :class="rule.active ? '' : 'opacity-50'">
          <div class="flex-1 min-w-0 pr-4">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="text-amber-300 font-mono text-[12px] bg-amber-900/20 px-1.5 py-0.5 rounded break-all">{{ rule.pattern }}</span>
              <span class="app-muted text-xs">→</span>
              <span class="text-emerald-300 font-mono text-[12px] bg-emerald-900/20 px-1.5 py-0.5 rounded break-all">{{ rule.replacement || '(删除)' }}</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="app-badge text-[10px] font-bold px-1.5 py-[1px]">{{ rule.scope === 'global' ? '全局模式' : '专属模式' }}</span>
              <span v-if="rule.scope === 'book' && rule.bookId" class="text-[10px] app-muted max-w-[120px] truncate">#{{ getBookTitle(rule.bookId) }}</span>
              <span v-if="rule.regex" class="app-badge text-[10px] uppercase font-bold px-1.5 py-[1px]">Regex</span>
            </div>
          </div>
          
          <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click="toggleRuleActive(rule)" class="app-button px-2.5 py-1 text-[11px]">{{ rule.active ? '冻结' : '唤醒' }}</button>
            <button @click="deleteRule(rule.id)" class="app-button app-button-danger px-2.5 py-1 text-[11px]">废弃</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
