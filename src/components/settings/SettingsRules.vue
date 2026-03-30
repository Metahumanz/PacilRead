<script setup lang="ts">
import { ref } from 'vue'

interface ReplacementRule { id: number; pattern: string; replacement: string; scope: string; book_id: number | null; is_regex: number; active: number }

const {
  rules,
  getBookTitle,
  deleteRule,
  toggleRuleActive
} = defineProps<{
  rules: ReplacementRule[]
  getBookTitle: (id: number | null) => string
  deleteRule: (id: number) => void
  toggleRuleActive: (rule: ReplacementRule) => void
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
    <h3 class="text-[14px] font-semibold text-slate-700 dark:text-white/80 mb-3 px-1">内容处理 (正则过滤)</h3>
    <div class="bg-white dark:bg-[#2d2d2d] rounded-xl border border-black/5 dark:border-white/[0.06] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-400 overflow-hidden">
      <div class="p-4 border-b border-black/5 dark:border-white/[0.04]">
        <div class="flex items-center justify-between mb-3">
          <p class="text-[13px] text-slate-600 dark:text-white/60">在阅读界面中添加用于文字净化的替换规则，在此处可以浏览并控制全部规则启用状态。</p>
          <div class="flex bg-black/5 dark:bg-black/20 rounded-md p-0.5 border border-black/5 dark:border-white/5">
            <button @click="ruleFilter='all'" class="px-3 py-1 rounded text-[11px] font-medium transition-colors" :class="ruleFilter==='all' ? 'bg-black/5 dark:bg-white/10 text-white shadow-sm' : 'text-slate-500 dark:text-white/50 hover:text-white'">全部</button>
            <button @click="ruleFilter='global'" class="px-3 py-1 rounded text-[11px] font-medium transition-colors" :class="ruleFilter==='global' ? 'bg-black/5 dark:bg-white/10 text-white shadow-sm' : 'text-slate-500 dark:text-white/50 hover:text-white'">全局级</button>
            <button @click="ruleFilter='book'" class="px-3 py-1 rounded text-[11px] font-medium transition-colors" :class="ruleFilter==='book' ? 'bg-black/5 dark:bg-white/10 text-white shadow-sm' : 'text-slate-500 dark:text-white/50 hover:text-white'">单书级</button>
          </div>
        </div>
      </div>
      
      <div v-if="filteredRules().length === 0" class="py-12 flex flex-col items-center justify-center bg-black/10">
        <span class="text-3xl opacity-30 mb-2">📝</span>
        <p class="text-[12px] text-slate-400 dark:text-white/40">空无一物，规则大本营闲置中</p>
      </div>

      <div v-else class="divide-y divide-white/[0.04] bg-black/10">
        <div v-for="rule in filteredRules()" :key="rule.id" class="p-3 mx-2 my-2 rounded-lg border border-transparent hover:border-black/5 dark:border-white/5 hover:bg-white/[0.02] flex items-center justify-between group transition-colors" :class="rule.active ? '' : 'opacity-50'">
          <div class="flex-1 min-w-0 pr-4">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span class="text-amber-300 font-mono text-[12px] bg-amber-900/20 px-1.5 py-0.5 rounded break-all">{{ rule.pattern }}</span>
              <span class="text-slate-400 dark:text-white/30 text-xs">→</span>
              <span class="text-emerald-300 font-mono text-[12px] bg-emerald-900/20 px-1.5 py-0.5 rounded break-all">{{ rule.replacement || '(删除)' }}</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-[10px] font-bold px-1.5 py-[1px] rounded" :class="rule.scope === 'global' ? 'bg-purple-500/10 text-purple-400' : 'bg-sky-500/10 text-sky-400'">{{ rule.scope === 'global' ? '全局模式' : '专属模式' }}</span>
              <span v-if="rule.scope === 'book' && rule.book_id" class="text-[10px] text-slate-400 dark:text-white/40 max-w-[120px] truncate">#{{ getBookTitle(rule.book_id) }}</span>
              <span v-if="rule.is_regex" class="text-[10px] uppercase font-bold text-amber-400/80 px-1.5 py-[1px] bg-amber-500/10 rounded">Regex</span>
            </div>
          </div>
          
          <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button @click="toggleRuleActive(rule)" class="px-2.5 py-1 text-[11px] font-medium border rounded transition-colors" :class="rule.active ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' : 'border-white/20 text-slate-600 dark:text-white/60 hover:bg-black/5 dark:bg-white/10'">{{ rule.active ? '冻结' : '唤醒' }}</button>
            <button @click="deleteRule(rule.id)" class="px-2.5 py-1 text-[11px] font-medium border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors">废弃</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
