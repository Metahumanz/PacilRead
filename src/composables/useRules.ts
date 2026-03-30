import { ref } from 'vue'

interface ReplacementRule {
  id: number
  book_id: number | null
  pattern: string
  replacement: string
  active: number
  is_regex: number
  scope: 'global' | 'book'
}

export function useRules() {
  const rules = ref<ReplacementRule[]>([])

  const fetchRules = async (bookId: number) => {
    try {
      const r = await window.electronAPI.db.query(
        'SELECT * FROM replacement_rules WHERE (scope = ? AND book_id IS NULL) OR (scope = ? AND book_id = ?) ORDER BY id',
        ['global', 'book', bookId]
      )
      rules.value = r as ReplacementRule[]
    } catch (e) {
      console.error('Failed to fetch rules:', e)
    }
  }

  const applyReplacements = (html: string): string => {
    if (!html) return html
    let result = html
    for (const rule of rules.value) {
      if (!rule.active) continue
      try {
        if (rule.is_regex) {
          result = result.replace(new RegExp(rule.pattern, 'g'), rule.replacement)
        } else {
          result = result.replace(
            new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            rule.replacement
          )
        }
      } catch (_) {}
    }
    return result
  }

  return {
    rules,
    fetchRules,
    applyReplacements
  }
}
