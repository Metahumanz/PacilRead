import { ref } from 'vue'
import { useDataStore } from './useDataStore'
import { toReplacementRuleView, type ReplacementRuleView } from '../types/entities'
import { notifyError } from './useNotifications'
import { getErrorMessage } from '../utils/errorMessage'

interface RuleBookOption {
  id: number
  title: string
}

export function useRuleManager() {
  const allRules = ref<ReplacementRuleView[]>([])
  const books = ref<RuleBookOption[]>([])

  const fetchAllRules = async () => {
    try {
      const dataStore = useDataStore()
      if (!dataStore.dataLoaded.value) await dataStore.loadAllData()
      allRules.value = dataStore.getRules().map(toReplacementRuleView)
    } catch (e) { console.error(e) }
  }

  const fetchBooks = async () => {
    try {
      const dataStore = useDataStore()
      if (!dataStore.dataLoaded.value) await dataStore.loadAllData()
      books.value = dataStore.getBooksSorted()
        .map(book => ({ id: book.id, title: book.title }))
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    } catch (e) { console.error(e) }
  }

  const getBookTitle = (bookId: number | null) => {
    if (!bookId) return ''
    const book = books.value.find(item => item.id === bookId)
    return book ? book.title : `#${bookId}`
  }

  const deleteRule = async (id: number) => {
    try {
      await useDataStore().deleteRule(id)
      await fetchAllRules()
    } catch (e) {
      console.error(e)
      notifyError(getErrorMessage(e, '删除规则失败，请重试'))
    }
  }

  const toggleRuleActive = async (rule: ReplacementRuleView) => {
    try {
      await useDataStore().updateRule(rule.id, { active: !rule.active })
      await fetchAllRules()
    } catch (e) {
      console.error(e)
      notifyError(getErrorMessage(e, '更新规则状态失败，请重试'))
    }
  }

  return {
    allRules,
    books,
    fetchAllRules,
    fetchBooks,
    getBookTitle,
    deleteRule,
    toggleRuleActive,
  }
}
