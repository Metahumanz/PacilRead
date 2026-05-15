import { ref } from 'vue'
import type { Rule } from './useDataStore'

export type ReplacementRule = Rule

export function useRules() {
  const rules = ref<ReplacementRule[]>([])

  const fetchRules = async (bookId: number) => {
    try {
      const rows = await window.electronAPI.data.readEntity('rules')
      const allRules = Array.isArray(rows) ? rows as Rule[] : []
      rules.value = allRules
        .filter(r => r.scope === 'global' || (r.scope === 'book' && r.bookId === bookId))
        .sort((a, b) => a.id - b.id)
        .map(r => ({
          ...r,
          book_id: r.bookId,
          is_regex: r.regex ? 1 : 0,
          active: r.active ? 1 : 0,
        })) as any
    } catch (e) {
      console.error('Failed to fetch rules:', e)
    }
  }

  const applyReplacements = (html: string): string => {
    if (!html) return html
    let result = html
    for (const rule of rules.value) {
      const isActive = typeof rule.active === 'boolean' ? rule.active : rule.active === 1
      const isRegex = typeof rule.regex === 'boolean' ? rule.regex : (rule as any).is_regex === 1
      const pattern = rule.pattern
      if (!isActive) continue
      try {
        if (isRegex) {
          result = result.replace(new RegExp(pattern, 'g'), rule.replacement)
        } else {
          result = result.replace(
            new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
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
