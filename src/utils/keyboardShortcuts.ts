const MODIFIER_KEYS = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift'])

const KEY_ALIASES: Record<string, string> = {
  Space: ' ',
  Spacebar: ' ',
  Esc: 'Escape',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
}

export function normalizeShortcutKey(rawKey: unknown): string | null {
  if (typeof rawKey !== 'string') return null
  const aliased = KEY_ALIASES[rawKey] ?? rawKey
  if (aliased === ' ') return ' '
  const key = aliased.trim()
  if (!key || MODIFIER_KEYS.has(key)) return null
  return key.length === 1 ? key.toLowerCase() : key
}

export function normalizeShortcutList(keys: unknown, fallback: string[] = []): string[] {
  const source = Array.isArray(keys) ? keys : fallback
  const normalized: string[] = []
  for (const rawKey of source) {
    const key = normalizeShortcutKey(rawKey)
    if (key && !normalized.includes(key)) normalized.push(key)
  }
  return normalized
}

export function normalizeShortcutBindings(nextKeys: unknown, previousKeys: unknown) {
  const next = normalizeShortcutList(nextKeys)
  const nextSet = new Set(next)
  return {
    nextKeys: next,
    previousKeys: normalizeShortcutList(previousKeys).filter(key => !nextSet.has(key)),
  }
}

export type AddShortcutResult =
  | { status: 'added'; keys: string[]; key: string }
  | { status: 'duplicate' | 'conflict' | 'ignored'; keys: string[]; key?: string }

export function addShortcutBinding(current: string[], opposite: string[], rawKey: unknown): AddShortcutResult {
  const keys = normalizeShortcutList(current)
  const key = normalizeShortcutKey(rawKey)
  if (!key) return { status: 'ignored', keys }
  if (keys.includes(key)) return { status: 'duplicate', keys, key }
  if (normalizeShortcutList(opposite).includes(key)) return { status: 'conflict', keys, key }
  return { status: 'added', keys: [...keys, key], key }
}

const KEY_LABELS: Record<string, string> = {
  ' ': '空格',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Escape: 'Esc',
  Enter: '回车',
}

export function formatShortcutKey(rawKey: unknown): string {
  const key = normalizeShortcutKey(rawKey)
  if (!key) return ''
  return KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}

export function shortcutEventKeys(event: Pick<KeyboardEvent, 'key' | 'code'>): string[] {
  return normalizeShortcutList([event.key, event.code])
}
