import { ref } from 'vue'
import type { Rule } from './useDataStore'
import { toReplacementRuleView, type ReplacementRuleView } from '../types/entities'

export type ReplacementRule = ReplacementRuleView

export function useRules() {
  const rules = ref<ReplacementRule[]>([])

  const fetchRules = async (bookId: number) => {
    try {
      const rows = await window.electronAPI.data.readEntity('rules')
      const allRules = Array.isArray(rows) ? rows as Rule[] : []
      rules.value = allRules
        .filter(r => r.scope === 'global' || (r.scope === 'book' && r.bookId === bookId))
        .sort((a, b) => a.id - b.id)
        .map(toReplacementRuleView)
    } catch (e) {
      console.error('Failed to fetch rules:', e)
    }
  }

  const applyReplacements = (html: string): string => {
    if (!html) return html
    let result = html
    for (const rule of rules.value) {
      const pattern = rule.pattern
      if (!rule.active) continue
      try {
        if (rule.regex) {
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
