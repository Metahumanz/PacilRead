export type SettingScope = 'ui' | 'theme' | 'localOnly' | 'shared'

export interface SettingDefinition<T> {
  key: string
  defaultValue: T
  scope: SettingScope
  parse: (value: string | undefined) => T
  serialize: (value: T) => string
}

export const boolSetting = (
  key: string,
  defaultValue: boolean,
  scope: SettingScope,
  falseOnly = false,
): SettingDefinition<boolean> => ({
  key,
  defaultValue,
  scope,
  parse: (value) => {
    if (value === undefined) return defaultValue
    return falseOnly ? value !== 'false' : value === 'true'
  },
  serialize: (value) => value ? 'true' : 'false',
})

export const stringSetting = (
  key: string,
  defaultValue: string,
  scope: SettingScope,
): SettingDefinition<string> => ({
  key,
  defaultValue,
  scope,
  parse: (value) => value ?? defaultValue,
  serialize: (value) => value,
})

export const intSetting = (
  key: string,
  defaultValue: number,
  scope: SettingScope,
  normalize: (value: number) => number = (value) => value,
): SettingDefinition<number> => ({
  key,
  defaultValue,
  scope,
  parse: (value) => {
    if (value === undefined) return defaultValue
    const parsed = parseInt(value, 10)
    return normalize(Number.isFinite(parsed) ? parsed : defaultValue)
  },
  serialize: (value) => String(normalize(value)),
})

export const floatSetting = (
  key: string,
  defaultValue: number,
  scope: SettingScope,
  normalize: (value: number) => number = (value) => value,
): SettingDefinition<number> => ({
  key,
  defaultValue,
  scope,
  parse: (value) => {
    if (value === undefined) return defaultValue
    const parsed = parseFloat(value)
    return normalize(Number.isFinite(parsed) ? parsed : defaultValue)
  },
  serialize: (value) => String(normalize(value)),
})

export function readSetting<T>(settings: Record<string, string>, definition: SettingDefinition<T>): T {
  return definition.parse(settings[definition.key])
}

export function serializeSetting<T>(definition: SettingDefinition<T>, value: T): string {
  return definition.serialize(value)
}

export function filterSettingsByScope(
  settings: Record<string, string>,
  definitions: ReadonlyArray<SettingDefinition<any>>,
  scopes: SettingScope[],
): Record<string, string> {
  const allowed = new Set(definitions.filter(def => scopes.includes(def.scope)).map(def => def.key))
  const snapshot: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (allowed.has(key)) snapshot[key] = value
  }
  return snapshot
}

export const clampHudMargin = (value: number) => Math.max(0, Math.min(32, Number.isFinite(value) ? value : 2))
export const clampGlassOpacity = (value: number) => Math.max(20, Math.min(100, value))
export const DEFAULT_BOOKSHELF_PROGRESS_PREFETCH_LIMIT = 6
export const clampBookshelfProgressPrefetchLimit = (value: unknown) => {
  if (value === '' || value === null || value === undefined) {
    return DEFAULT_BOOKSHELF_PROGRESS_PREFETCH_LIMIT
  }
  const parsed = Number(value)
  return Math.max(0, Math.min(100, Number.isFinite(parsed)
    ? Math.floor(parsed)
    : DEFAULT_BOOKSHELF_PROGRESS_PREFETCH_LIMIT))
}

export const SETTINGS_SCHEMA = [
  intSetting('reader_fontSize', 20, 'theme'),
  floatSetting('reader_lineHeight', 1.8, 'theme'),
  floatSetting('reader_letterSpacing', 0, 'theme'),
  intSetting('reader_fontWeight', 400, 'theme'),
  intSetting('reader_marginX', 60, 'theme'),
  intSetting('reader_marginY', 40, 'theme'),
  intSetting('reader_marginTop', 40, 'theme'),
  intSetting('reader_marginBottom', 40, 'theme'),
  stringSetting('reader_fontFamily', 'system-ui', 'theme'),
  stringSetting('reader_fontColor', '#e2e8f0', 'theme'),
  stringSetting('reader_coverColor', '#0f172a', 'theme'),
  stringSetting('bgImage', '', 'theme'),
  intSetting('hud_top_margin', 2, 'theme', clampHudMargin),
  intSetting('hud_bottom_margin', 2, 'theme', clampHudMargin),
  boolSetting('reader_alignBottom', false, 'theme'),
  boolSetting('reader_alwaysOnTop', false, 'ui'),
  boolSetting('autoOpenLastRead', false, 'ui'),
  boolSetting('silentUpdate', false, 'ui'),
  boolSetting('webdavSyncBookshelf', true, 'localOnly', true),
  boolSetting('webdavSyncFiles', true, 'localOnly', true),
  boolSetting('webdavSyncUISettings', true, 'localOnly', true),
  boolSetting('webdavSyncThemes', true, 'localOnly', true),
  boolSetting('webdavSyncBackgrounds', true, 'localOnly', true),
  boolSetting('webdav_sync_reading_stats', true, 'ui', true),
  stringSetting('readingStatsDeviceId', '', 'localOnly'),
  stringSetting('reading_stats_device_id', '', 'localOnly'),
  stringSetting('webdavDesktopSettingsDir', 'desktop-settings', 'localOnly'),
] as const

export const SETTING_KEYS_BY_SCOPE = SETTINGS_SCHEMA.reduce<Record<SettingScope, Set<string>>>((acc, definition) => {
  acc[definition.scope].add(definition.key)
  return acc
}, {
  ui: new Set<string>(),
  theme: new Set<string>(),
  localOnly: new Set<string>(),
  shared: new Set<string>(),
})
