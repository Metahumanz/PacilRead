<script setup lang="ts">
import { ref } from 'vue'
import { useDataStore } from '../../../composables/useDataStore'
import type { ReplacementRuleView } from '../../../types/entities'
import { notifyError } from '../../../composables/useNotifications'
import { getErrorMessage } from '../../../utils/errorMessage'

const props = defineProps<{
  rules: ReplacementRuleView[]
  bookId: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'refresh'): void
}>()

const newPattern = ref('')
const newReplacement = ref('')
const newScope = ref<'book' | 'global'>('book')
const newIsRegex = ref(false)
const operationError = ref('')
const adding = ref(false)
const busyRuleIds = ref<number[]>([])

const addRule = async () => {
  if (!newPattern.value.trim()) return
  try {
    adding.value = true
    operationError.value = ''
    const { addRule: add } = useDataStore()
    await add({
      pattern: newPattern.value,
      replacement: newReplacement.value,
      scope: newScope.value,
      bookId: newScope.value === 'book' ? props.bookId : null,
      regex: newIsRegex.value,
      active: true,
    })
    newPattern.value = ''; newReplacement.value = ''; newIsRegex.value = false
    emit('refresh')
  } catch (e) {
    console.error(e)
    operationError.value = getErrorMessage(e, '添加规则失败，请重试')
    notifyError(operationError.value)
  } finally { adding.value = false }
}

const deleteRule = async (id: number) => {
  try {
    busyRuleIds.value = [...busyRuleIds.value, id]
    operationError.value = ''
    const { deleteRule: del } = useDataStore()
    await del(id)
    emit('refresh')
  } catch (e) {
    console.error(e)
    operationError.value = getErrorMessage(e, '删除规则失败，请重试')
    notifyError(operationError.value)
  } finally { busyRuleIds.value = busyRuleIds.value.filter(ruleId => ruleId !== id) }
}

const toggleRuleActive = async (rule: ReplacementRuleView) => {
  try {
    busyRuleIds.value = [...busyRuleIds.value, rule.id]
    operationError.value = ''
    const { updateRule } = useDataStore()
    await updateRule(rule.id, { active: !rule.active })
    emit('refresh')
  } catch (e) {
    console.error(e)
    operationError.value = getErrorMessage(e, '更新规则状态失败，请重试')
    notifyError(operationError.value)
  } finally { busyRuleIds.value = busyRuleIds.value.filter(ruleId => ruleId !== rule.id) }
}
</script>

<template>
  <div class="rules-p" @click.stop @wheel.stop>
    <div class="ph"><span class="pt">替换规则</span><button @click="$emit('close')" class="px">✕</button></div>
    <!-- Add rule form -->
    <div class="rule-form">
      <input type="text" v-model="newPattern" placeholder="查找内容..." class="rule-input" />
      <input type="text" v-model="newReplacement" placeholder="替换为..." class="rule-input" />
      <div class="rule-opts">
        <label class="rule-scope-opt"><input type="radio" value="book" v-model="newScope" /> 本书</label>
        <label class="rule-scope-opt"><input type="radio" value="global" v-model="newScope" /> 全局</label>
        <label class="rule-regex-opt"><input type="checkbox" v-model="newIsRegex" /> 正则</label>
        <button @click="addRule" class="rule-add-btn" :disabled="!newPattern.trim() || adding">{{ adding ? '添加中…' : '+ 添加' }}</button>
      </div>
      <p v-if="operationError" class="rule-error" role="alert">{{ operationError }}</p>
    </div>
    <!-- Rules list -->
    <div class="rules-list">
      <div v-if="rules.length === 0" class="rules-empty">暂无替换规则</div>
      <div v-for="rule in rules" :key="rule.id" class="rule-item" :class="{ inactive: !rule.active }">
        <div class="rule-content">
          <span class="rule-pattern">{{ rule.pattern }}</span>
          <span class="rule-arrow">→</span>
          <span class="rule-repl">{{ rule.replacement || '(删除)' }}</span>
        </div>
        <div class="rule-meta">
          <span class="rule-badge" :class="rule.scope">{{ rule.scope === 'global' ? '全局' : '本书' }}</span>
          <span v-if="rule.regex" class="rule-badge regex">正则</span>
          <button @click="toggleRuleActive(rule)" class="rule-toggle" :disabled="busyRuleIds.includes(rule.id)">{{ rule.active ? '✓' : '○' }}</button>
          <button @click="deleteRule(rule.id)" class="rule-del" :disabled="busyRuleIds.includes(rule.id)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rules-p { position:absolute; right:20px; top:60px; max-height: calc(100% - 180px); width:380px; background:rgba(15,23,42,0.95); backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:16px; z-index:60; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; overflow:hidden; touch-action: pan-y; }
.rule-form { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
.rule-input { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:8px 14px; font-size:13px; color:white; outline:none; transition:border-color .2s; }
.rule-input:focus { border-color:#3b82f6; }
.rule-input::placeholder { color:rgba(255,255,255,0.3); }
.rule-opts { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.rule-scope-opt, .rule-regex-opt { font-size:12px; color:rgba(255,255,255,0.5); display:flex; align-items:center; gap:4px; cursor:pointer; }
.rule-add-btn { margin-left:auto; padding:6px 16px; border-radius:8px; font-size:12px; font-weight:700; background:#3b82f6; border:none; color:white; cursor:pointer; transition:all .2s; }
.rule-add-btn:hover { background:#2563eb; }
.rule-add-btn:disabled { opacity:0.3; cursor:default; }
.rule-error { margin:0; color:#fca5a5; font-size:11px; line-height:1.5; }
.rules-list { flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:6px; }
.rules-list::-webkit-scrollbar { width:4px; }
.rules-list::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
.rules-empty { text-align:center; padding:24px; font-size:12px; color:rgba(255,255,255,0.2); }
.rule-item { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:10px 12px; transition:all .15s; }
.rule-item.inactive { opacity:0.4; }
.rule-content { display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; }
.rule-pattern { color:#f59e0b; font-weight:600; word-break:break-all; }
.rule-arrow { color:rgba(255,255,255,0.2); font-size:12px; flex-shrink:0; }
.rule-repl { color:#34d399; font-weight:600; word-break:break-all; }
.rule-meta { display:flex; align-items:center; gap:6px; }
.rule-badge { font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; }
.rule-badge.global { background:rgba(139,92,246,0.15); color:#a78bfa; }
.rule-badge.book { background:rgba(59,130,246,0.15); color:#60a5fa; }
.rule-badge.regex { background:rgba(245,158,11,0.15); color:#fbbf24; }
.rule-toggle { background:none; border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.4); font-size:12px; cursor:pointer; padding:2px 8px; border-radius:6px; margin-left:auto; transition:all .15s; }
.rule-toggle:hover { color:white; border-color:rgba(255,255,255,0.3); }
.rule-del { background:none; border:none; color:rgba(239,68,68,0.5); font-size:14px; cursor:pointer; padding:2px 6px; transition:all .15s; }
.rule-del:hover { color:#ef4444; }
.ph { display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; }
.pt { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.15em; opacity:0.5; }
.px { background:none; border:none; color:rgba(255,255,255,0.4); cursor:pointer; font-size:16px; }
.px:hover { color:white; }
</style>
