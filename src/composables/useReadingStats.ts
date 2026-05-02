import { saveSetting, useSettings } from './useSettings'

export type ReadingStatsPeriod = 'today' | 'week' | 'year'

export interface ReadingStatsOverview {
  today: number
  week: number
  year: number
}

export interface ReadingStatsBookRankItem {
  bookIdentity: string
  bookTitle: string
  bookAuthor: string
  totalSeconds: number
  lastUpdatedAt: number
  localBookId: number | null
  coverPath: string | null
}

export interface ReadingStatsBookDetail {
  id: number
  title: string
  author: string
  coverPath: string | null
  lastRead: string
  progressIndex: number
  readingStatsKey: string
}

interface ReadingStatsRowPayload {
  date: string
  sourceDeviceId: string
  bookIdentity: string
  bookTitle: string
  bookAuthor: string
  durationSeconds: number
  charCount: number
  updatedAt: number
}

interface DesktopSettingsBackgroundFile {
  token: string
  remoteFileName: string
}

interface DesktopSettingsPayload {
  schemaVersion: number
  platform: 'desktop'
  generatedAt: number
  settings: Record<string, string>
  backgroundFiles: DesktopSettingsBackgroundFile[]
}

interface DesktopSettingsSnapshot {
  payload: DesktopSettingsPayload
  backgroundUploads: Array<{ localPath: string; remoteFileName: string }>
}

const READING_STATS_SCHEMA_VERSION = 1
const DESKTOP_SETTINGS_SCHEMA_VERSION = 1
const DESKTOP_SETTINGS_FILE_NAME = 'desktop-settings.json'
const READING_STATS_REMOTE_DIR = 'readingStats'
const PACILREAD_ROOT_DIR = 'PacilRead'
const DEFAULT_DESKTOP_SETTINGS_DIR = 'desktop-settings'
export const DESKTOP_DATABASE_DIR = 'database'
const REMOTE_BG_PLACEHOLDER_PREFIX = '__PACILREAD_REMOTE_BG__:'
const READING_STATS_IDLE_MS = 60_000

const UI_SETTINGS_KEYS = [
  'hideKeyHints',
  'autoOpenLastRead',
  'silentUpdate',
  'reader_nextKeys',
  'reader_prevKeys',
  'reader_autoPageSpeed',
  'reader_ttsEngine',
  'reader_ttsVoice',
  'reader_ttsRate',
  'reader_highlightColor',
  'reader_ttsMiMoApiKey',
  'reader_ttsMiMoVoice',
  'reader_alwaysOnTop',
  'reader_sliderMode',
  'sidebarCollapsed',
  'viewMode',
  'bookshelf_show_add_entry',
  'home_nav_auto_switch_enabled',
  'home_nav_manual_mode',
  'home_bottom_nav_style',
  'home_nav_portrait_mode',
  'home_nav_landscape_mode',
  'home_sidebar_presentation',
  'home_fixed_sidebar_style',
  'app_theme_mode',
  'app_light_style_variant',
  'app_dark_style_variant',
  'glass_opacity_percent',
  'readingTimeTrackingEnabled',
  'reading_time_tracking_enabled',
  'readingTimeStatsHidden',
  'webdav_sync_reading_stats',
]

const THEME_SETTINGS_KEYS = [
  'reader_fontSize',
  'reader_lineHeight',
  'reader_letterSpacing',
  'reader_fontWeight',
  'reader_marginX',
  'reader_marginY',
  'reader_fontFamily',
  'reader_fontColor',
  'reader_coverColor',
  'bgImage',
  'reader_flipMode',
  'reader_flipSpeed',
  'reader_pageMode',
  'reader_double_page_enabled',
  'reader_double_page_mode',
  'reader_doublePageStep',
  'reader_auto_night_enabled',
  'reader_auto_night_custom_policy',
  'reader_blurAmount',
  'reader_textAlign',
  'reader_alignBottom',
  'custom_themes',
  'hud_tl',
  'hud_tc',
  'hud_tr',
  'hud_bl',
  'hud_bc',
  'hud_br',
  'chapterTitleDisplay',
  'reader_pIndent',
  'reader_pSpacing',
]

const LOCAL_ONLY_SETTING_KEYS = new Set([
  'readingStatsDeviceId',
  'reading_stats_device_id',
  'webdavDesktopSettingsDir',
])

export const readingStatsIdleMs = READING_STATS_IDLE_MS

export function sanitizeWebdavDirectorySegment(value: string): string {
  const sanitized = value.trim().replace(/[\\/]+/g, '').replace(/\.+$/g, '')
  return sanitized || DEFAULT_DESKTOP_SETTINGS_DIR
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainSeconds = safeSeconds % 60

  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`
  }
  if (minutes > 0) {
    return `${minutes}分钟 ${remainSeconds}秒`
  }
  return `${remainSeconds}秒`
}

function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildBasicAuth(user: string, pass: string): string {
  return btoa(`${user}:${pass}`)
}

function buildWebdavBaseUrl(rawUrl: string, rawDir: string): string {
  let baseUrl = rawUrl.trim()
  if (baseUrl && !baseUrl.endsWith('/')) baseUrl += '/'
  let dir = rawDir.trim()
  if (dir.startsWith('/')) dir = dir.substring(1)
  if (dir && !dir.endsWith('/')) dir += '/'
  return `${baseUrl}${dir}`
}

export function buildPacilReadBaseUrl(rawUrl: string, rawDir: string): string {
  let baseUrl = buildWebdavBaseUrl(rawUrl, rawDir)
  if (!baseUrl.endsWith('/')) baseUrl += '/'
  // If user configured a subdir, it serves as the namespace; otherwise default to PacilRead.
  return rawDir.trim() ? baseUrl : `${baseUrl}${PACILREAD_ROOT_DIR}/`
}

function buildRemoteReadingStatsFileName(deviceId: string): string {
  return `device-${deviceId}.json`
}

function getPeriodRange(period: ReadingStatsPeriod): { start: string; end: string } {
  const now = new Date()
  const end = toDateString(now)

  if (period === 'today') {
    return { start: end, end }
  }

  if (period === 'week') {
    const startDate = new Date(now)
    const day = startDate.getDay()
    const diff = day === 0 ? 6 : day - 1
    startDate.setDate(startDate.getDate() - diff)
    return { start: toDateString(startDate), end }
  }

  const startDate = new Date(now.getFullYear(), 0, 1)
  return { start: toDateString(startDate), end }
}

function isLocalFileUrl(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('file:///')
}

function fileUrlToLocalPath(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl)
    if (url.protocol !== 'file:') return null
    let localPath = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:/.test(localPath)) localPath = localPath.substring(1)
    return localPath.replace(/\//g, '\\')
  } catch (_) {
    return null
  }
}

function localPathToFileUrl(localPath: string): string {
  return `file:///${localPath.replace(/\\/g, '/')}`
}

function sanitizeRemoteFileName(input: string): string {
  const sanitized = input.replace(/[\\/:*?"<>|]+/g, '_').trim()
  return sanitized || `bg-${Date.now()}`
}

async function readSettingsMap(): Promise<Record<string, string>> {
  const { useDataStore: getStore } = await import('./useDataStore')
  const store = getStore()
  if (!store.dataLoaded.value) await store.loadAllData()
  return { ...store.settingsMap.value }
}

async function saveSettingsMap(settings: Record<string, string>): Promise<void> {
  const { useDataStore: getStore } = await import('./useDataStore')
  const store = getStore()
  await store.setSettings(settings)
}

export async function getCurrentDesktopSettingsSnapshot(): Promise<Record<string, string>> {
  const settings = await readSettingsMap()
  const snapshot: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (UI_SETTINGS_KEYS.includes(key) || THEME_SETTINGS_KEYS.includes(key)) {
      snapshot[key] = value
    }
  }
  return snapshot
}

export async function restoreDesktopSettingsValues(snapshot: Record<string, string>): Promise<void> {
  await saveSettingsMap(snapshot)
}

export async function getLocalOnlySettingsSnapshot(): Promise<Record<string, string>> {
  const settings = await readSettingsMap()
  const snapshot: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith('webdav') || LOCAL_ONLY_SETTING_KEYS.has(key)) {
      snapshot[key] = value
    }
  }
  return snapshot
}

export async function restoreLocalOnlySettings(snapshot: Record<string, string>): Promise<void> {
  await saveSettingsMap(snapshot)
}

async function ensureWebDavCollection(url: string, auth: string): Promise<void> {
  const response = await window.electronAPI.webdav.request({
    url,
    method: 'MKCOL',
    headers: { Authorization: `Basic ${auth}` },
  })

  if (response.error) throw new Error(response.error)
  if (response.status && ![200, 201, 301, 302, 405].includes(response.status)) {
    throw new Error(`MKCOL ${url} 失败 (HTTP ${response.status})`)
  }
}

async function getWebDavContext(requireEnabledSync = false): Promise<{
  auth: string
  baseUrl: string
  desktopSettingsDir: string
}> {
  const settings = useSettings()
  const {
    webdavUrl,
    webdavDir,
    webdavUser,
    webdavPass,
    webdavSync,
    webdavDesktopSettingsDir,
  } = settings

  if (requireEnabledSync && !webdavSync.value) {
    throw new Error('WebDAV 同步未启用')
  }
  if (!webdavUrl.value.trim()) {
    throw new Error('请先配置 WebDAV 地址')
  }

  const desktopSettingsDir = sanitizeWebdavDirectorySegment(
    webdavDesktopSettingsDir.value || DEFAULT_DESKTOP_SETTINGS_DIR
  )

  return {
    auth: buildBasicAuth(webdavUser.value, webdavPass.value),
    baseUrl: buildPacilReadBaseUrl(webdavUrl.value, webdavDir.value),
    desktopSettingsDir,
  }
}

async function ensurePacilReadStructure(options: {
  includeReadingStats?: boolean
  includeDesktopSettings?: boolean
  includeDesktopSettingsBackgrounds?: boolean
  includeDesktopDatabase?: boolean
  includeBooks?: boolean
  includeCovers?: boolean
  includeLegacyBackgrounds?: boolean
}): Promise<{
  auth: string
  pacilReadBaseUrl: string
  desktopSettingsBaseUrl: string
}> {
  const { auth, baseUrl, desktopSettingsDir } = await getWebDavContext()
  await ensureWebDavCollection(baseUrl, auth)

  if (options.includeBooks) await ensureWebDavCollection(`${baseUrl}books/`, auth)
  if (options.includeCovers) await ensureWebDavCollection(`${baseUrl}covers/`, auth)
  if (options.includeLegacyBackgrounds) await ensureWebDavCollection(`${baseUrl}backgrounds/`, auth)
  if (options.includeReadingStats) await ensureWebDavCollection(`${baseUrl}${READING_STATS_REMOTE_DIR}/`, auth)

  const desktopSettingsBaseUrl = `${baseUrl}${desktopSettingsDir}/`
  if (options.includeDesktopSettings || options.includeDesktopSettingsBackgrounds) {
    await ensureWebDavCollection(desktopSettingsBaseUrl, auth)
  }
  if (options.includeDesktopSettingsBackgrounds) {
    await ensureWebDavCollection(`${desktopSettingsBaseUrl}backgrounds/`, auth)
  }
  if (options.includeDesktopDatabase) {
    await ensureWebDavCollection(desktopSettingsBaseUrl, auth)
    await ensureWebDavCollection(`${desktopSettingsBaseUrl}${DESKTOP_DATABASE_DIR}/`, auth)
  }

  return {
    auth,
    pacilReadBaseUrl: baseUrl,
    desktopSettingsBaseUrl,
  }
}

export function extractHrefValues(xmlText: string): string[] {
  const hrefs: string[] = []
  const regex = /<[^>]*:?href[^>]*>([^<]+)<\/[^>]*:?href>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(xmlText)) !== null) {
    hrefs.push(match[1])
  }
  return hrefs
}

async function listRemoteFiles(dirUrl: string, auth: string): Promise<string[]> {
  const response = await window.electronAPI.webdav.request({
    url: dirUrl,
    method: 'PROPFIND',
    headers: {
      Authorization: `Basic ${auth}`,
      Depth: '1',
    },
  })

  if (response.error) throw new Error(response.error)
  if (response.status === 404) return []
  if (!response.status || response.status < 200 || response.status >= 300) {
    throw new Error(`列出云端目录失败 (HTTP ${response.status})`)
  }

  const files = extractHrefValues(response.data || '')
    .map((href) => {
      try {
        return new URL(href, dirUrl).toString()
      } catch (_) {
        return ''
      }
    })
    .filter(Boolean)
    .filter((url) => url !== dirUrl && !url.endsWith('/'))

  return Array.from(new Set(files))
}

export async function ensureReadingStatsDeviceId(): Promise<string> {
  const settings = useSettings()
  if (!settings.readingStatsDeviceId.value) {
    settings.readingStatsDeviceId.value = crypto.randomUUID()
    await saveSetting('readingStatsDeviceId', settings.readingStatsDeviceId.value)
    await saveSetting('reading_stats_device_id', settings.readingStatsDeviceId.value)
  }
  return settings.readingStatsDeviceId.value
}

export async function appendReadingStatsDuration(row: ReadingStatsRowPayload): Promise<void> {
  const { useDataStore: getStore } = await import('./useDataStore')
  await getStore().upsertReadingStatRow(row, 'append')
}

async function overwriteReadingStatsRow(row: ReadingStatsRowPayload): Promise<void> {
  const { useDataStore: getStore } = await import('./useDataStore')
  await getStore().upsertReadingStatRow(row, 'overwrite')
}

export async function getAllLocalReadingStatsRows(): Promise<ReadingStatsRowPayload[]> {
  const rows = await window.electronAPI.db.query(
    `SELECT
      date as date,
      source_device_id as sourceDeviceId,
      book_identity as bookIdentity,
      book_title as bookTitle,
      COALESCE(book_author, '') as bookAuthor,
      duration_seconds as durationSeconds,
      char_count as charCount,
      updated_at as updatedAt
    FROM reading_stats
    ORDER BY updated_at ASC, source_device_id ASC, date ASC, book_identity ASC`
  )
  return (rows as ReadingStatsRowPayload[]) || []
}

export async function restoreReadingStatsRows(rows: ReadingStatsRowPayload[]): Promise<void> {
  for (const row of rows) {
    await overwriteReadingStatsRow(row)
  }
}

export async function createReadingStatsSnapshot(): Promise<{
  schemaVersion: number
  deviceId: string
  generatedAt: number
  rows: ReadingStatsRowPayload[]
}> {
  const deviceId = await ensureReadingStatsDeviceId()
  const { useDataStore: getStore } = await import('./useDataStore')
  const rows = getStore().getReadingStatsRows(deviceId)

  return {
    schemaVersion: READING_STATS_SCHEMA_VERSION,
    deviceId,
    generatedAt: Date.now(),
    rows: rows as ReadingStatsRowPayload[],
  }
}

export async function uploadReadingStatsSnapshot(): Promise<void> {
  const settings = useSettings()
  if (!settings.webdavSync.value || !settings.webdavUrl.value) return
  if (!settings.webdavSyncReadingStats.value) return

  const { auth, pacilReadBaseUrl } = await ensurePacilReadStructure({
    includeReadingStats: true,
  })
  const snapshot = await createReadingStatsSnapshot()
  const remoteUrl = `${pacilReadBaseUrl}${READING_STATS_REMOTE_DIR}/${buildRemoteReadingStatsFileName(snapshot.deviceId)}`
  const response = await window.electronAPI.webdav.request({
    url: remoteUrl,
    method: 'PUT',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot, null, 2),
  })

  if (response.error) throw new Error(response.error)
  if (!response.status || response.status < 200 || response.status >= 300) {
    throw new Error(`上传阅读统计失败 (HTTP ${response.status})`)
  }
}

export async function mergeRemoteReadingStats(): Promise<number> {
  const settings = useSettings()
  if (!settings.webdavUrl.value) return 0
  if (!settings.webdavSyncReadingStats.value) return 0

  const { auth, baseUrl } = await getWebDavContext()
  const dirUrl = `${baseUrl}${READING_STATS_REMOTE_DIR}/`
  const files = await listRemoteFiles(dirUrl, auth)
  let mergedCount = 0

  for (const fileUrl of files) {
    const response = await window.electronAPI.webdav.request({
      url: fileUrl,
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    })

    if (response.error || response.status !== 200 || !response.data) continue

    try {
      const payload = JSON.parse(response.data) as {
        rows?: ReadingStatsRowPayload[]
      }
      const rows = Array.isArray(payload.rows) ? payload.rows : []
      const { useDataStore: getStore } = await import('./useDataStore')
      const store = getStore()
      for (const row of rows) {
        if (!row?.date || !row?.sourceDeviceId || !row?.bookIdentity) continue
        const merged = await store.mergeRemoteReadingStatRow({
          date: row.date,
          sourceDeviceId: row.sourceDeviceId,
          bookIdentity: row.bookIdentity,
          bookTitle: row.bookTitle || '',
          bookAuthor: row.bookAuthor || '',
          durationSeconds: Number(row.durationSeconds) || 0,
          charCount: Number(row.charCount) || 0,
          updatedAt: Number(row.updatedAt) || 0,
        })
        if (merged) mergedCount += 1
      }
      await store.flushRemoteReadingStatsMerge()
    } catch (_) {}
  }

  return mergedCount
}

export async function clearLocalReadingStats(): Promise<void> {
  const { useDataStore: getStore } = await import('./useDataStore')
  await getStore().clearReadingStats()
}

export async function deleteRemoteReadingStatsFiles(): Promise<void> {
  const { auth, baseUrl } = await getWebDavContext()
  const dirUrl = `${baseUrl}${READING_STATS_REMOTE_DIR}/`
  const files = await listRemoteFiles(dirUrl, auth)
  for (const fileUrl of files) {
    const response = await window.electronAPI.webdav.request({
      url: fileUrl,
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` },
    })
    if (response.error) throw new Error(response.error)
    if (response.status && ![200, 202, 204, 404].includes(response.status)) {
      throw new Error(`删除远端阅读统计失败 (HTTP ${response.status})`)
    }
  }
}

async function getBookIdentityById(bookId: number): Promise<string | null> {
  const { useDataStore: getStore } = await import('./useDataStore')
  const book = getStore().getBook(bookId)
  return book?.readingStatsKey ?? null
}

async function queryReadingStatsTotal(start: string, end: string, bookIdentity?: string | null): Promise<number> {
  const { useDataStore: getStore } = await import('./useDataStore')
  const allRows = getStore().getReadingStatsRows()
  let total = 0
  for (const row of allRows) {
    if (row.date < start || row.date > end) continue
    if (bookIdentity && row.bookIdentity !== bookIdentity) continue
    total += row.durationSeconds
  }
  return total
}

export async function fetchReadingStatsOverview(bookId?: number | null): Promise<ReadingStatsOverview> {
  const bookIdentity = typeof bookId === 'number' ? await getBookIdentityById(bookId) : null
  const todayRange = getPeriodRange('today')
  const weekRange = getPeriodRange('week')
  const yearRange = getPeriodRange('year')

  return {
    today: await queryReadingStatsTotal(todayRange.start, todayRange.end, bookIdentity),
    week: await queryReadingStatsTotal(weekRange.start, weekRange.end, bookIdentity),
    year: await queryReadingStatsTotal(yearRange.start, yearRange.end, bookIdentity),
  }
}

export async function fetchReadingStatsBookRank(period: ReadingStatsPeriod): Promise<ReadingStatsBookRankItem[]> {
  const range = getPeriodRange(period)
  const { useDataStore: getStore } = await import('./useDataStore')
  const store = getStore()
  const allStats = store.getReadingStatsRows()
  const allBooks = store.books.value

  // Group by bookIdentity, filter by date range
  const groups = new Map<string, { totalSeconds: number; bookTitle: string; bookAuthor: string; lastUpdatedAt: number }>()
  for (const row of allStats) {
    if (row.date < range.start || row.date > range.end) continue
    const g = groups.get(row.bookIdentity)
    if (g) {
      g.totalSeconds += row.durationSeconds
      g.lastUpdatedAt = Math.max(g.lastUpdatedAt, row.updatedAt)
    } else {
      groups.set(row.bookIdentity, {
        totalSeconds: row.durationSeconds,
        bookTitle: row.bookTitle,
        bookAuthor: row.bookAuthor,
        lastUpdatedAt: row.updatedAt,
      })
    }
  }

  // Join with books to get localBookId and coverPath
  const result: ReadingStatsBookRankItem[] = []
  for (const [identity, g] of groups) {
    const matchingBook = allBooks.find(b => b.readingStatsKey === identity)
    result.push({
      bookIdentity: identity,
      bookTitle: g.bookTitle,
      bookAuthor: g.bookAuthor,
      totalSeconds: g.totalSeconds,
      lastUpdatedAt: g.lastUpdatedAt,
      localBookId: matchingBook?.id ?? null,
      coverPath: matchingBook?.coverFile ?? null,
    })
  }

  result.sort((a, b) => b.totalSeconds - a.totalSeconds || b.lastUpdatedAt - a.lastUpdatedAt)
  return result
}

export async function fetchReadingStatsBookDetail(bookId: number): Promise<ReadingStatsBookDetail | null> {
  const { useDataStore: getStore } = await import('./useDataStore')
  const b = getStore().getBook(bookId)
  if (!b) return null
  return {
    id: b.id,
    title: b.title,
    author: b.author || '',
    coverPath: b.coverFile,
    lastRead: b.lastReadAt ? new Date(b.lastReadAt).toISOString() : '',
    progressIndex: b.progressIndex,
    readingStatsKey: b.readingStatsKey,
  }
}

export async function hasReadingStatsHistory(): Promise<boolean> {
  const { useDataStore: getStore } = await import('./useDataStore')
  const store = getStore()
  if (!store.dataLoaded.value) await store.loadAllData()
  return store.readingStats.value.length > 0
}

function shouldIncludeSettingKey(
  key: string,
  options: { includeUi: boolean; includeThemes: boolean }
): boolean {
  if (options.includeUi && UI_SETTINGS_KEYS.includes(key)) return true
  if (options.includeThemes && THEME_SETTINGS_KEYS.includes(key)) return true
  return false
}

function createBackgroundPlaceholder(token: string): string {
  return `${REMOTE_BG_PLACEHOLDER_PREFIX}${token}`
}

function readBackgroundPlaceholder(value: string): string | null {
  if (!value.startsWith(REMOTE_BG_PLACEHOLDER_PREFIX)) return null
  return value.substring(REMOTE_BG_PLACEHOLDER_PREFIX.length)
}

function buildRemoteBackgroundFileName(token: string, localPath: string): string {
  const baseName = localPath.split(/[\\/]/).pop() || `bg-${Date.now()}`
  return `${sanitizeRemoteFileName(token)}-${sanitizeRemoteFileName(baseName)}`
}

function prepareDesktopSettingsSnapshot(
  settingsMap: Record<string, string>,
  options: { includeUi: boolean; includeThemes: boolean; includeBackgrounds: boolean }
): DesktopSettingsSnapshot {
  const filteredSettings: Record<string, string> = {}
  for (const [key, value] of Object.entries(settingsMap)) {
    if (shouldIncludeSettingKey(key, options)) {
      filteredSettings[key] = value
    }
  }

  const backgroundUploadsByPath = new Map<string, { token: string; remoteFileName: string }>()
  const backgroundFiles: DesktopSettingsBackgroundFile[] = []

  const registerBackground = (token: string, fileUrl: string): string | null => {
    const localPath = fileUrlToLocalPath(fileUrl)
    if (!localPath) return null

    if (backgroundUploadsByPath.has(localPath)) {
      return createBackgroundPlaceholder(backgroundUploadsByPath.get(localPath)!.token)
    }

    const remoteFileName = buildRemoteBackgroundFileName(token, localPath)
    backgroundUploadsByPath.set(localPath, { token, remoteFileName })
    backgroundFiles.push({ token, remoteFileName })
    return createBackgroundPlaceholder(token)
  }

  if (options.includeThemes && filteredSettings.bgImage) {
    if (isLocalFileUrl(filteredSettings.bgImage)) {
      if (options.includeBackgrounds) {
        const placeholder = registerBackground('bgImage', filteredSettings.bgImage)
        if (placeholder) filteredSettings.bgImage = placeholder
        else delete filteredSettings.bgImage
      } else {
        delete filteredSettings.bgImage
      }
    }
  }

  if (options.includeThemes && filteredSettings.custom_themes) {
    try {
      const themes = JSON.parse(filteredSettings.custom_themes)
      if (Array.isArray(themes)) {
        const nextThemes = themes.map((theme) => {
          if (!theme || typeof theme !== 'object') return theme
          const nextTheme = { ...theme }
          if (isLocalFileUrl(nextTheme.bgImage)) {
            if (options.includeBackgrounds) {
              const placeholder = registerBackground(`theme-${String(nextTheme.id || Date.now())}`, nextTheme.bgImage)
              nextTheme.bgImage = placeholder || ''
            } else {
              nextTheme.bgImage = ''
            }
          }
          return nextTheme
        })
        filteredSettings.custom_themes = JSON.stringify(nextThemes)
      }
    } catch (_) {}
  }

  const backgroundUploads = Array.from(backgroundUploadsByPath.entries()).map(([localPath, entry]) => ({
    localPath,
    remoteFileName: entry.remoteFileName,
  }))

  return {
    payload: {
      schemaVersion: DESKTOP_SETTINGS_SCHEMA_VERSION,
      platform: 'desktop',
      generatedAt: Date.now(),
      settings: filteredSettings,
      backgroundFiles,
    },
    backgroundUploads,
  }
}

export async function buildDesktopSettingsSnapshot(): Promise<DesktopSettingsSnapshot> {
  const settings = useSettings()
  const settingsMap = await readSettingsMap()
  return prepareDesktopSettingsSnapshot(settingsMap, {
    includeUi: settings.webdavSyncUISettings.value,
    includeThemes: settings.webdavSyncThemes.value,
    includeBackgrounds: settings.webdavSyncBackgrounds.value,
  })
}

export async function uploadDesktopSettingsSnapshot(): Promise<void> {
  const settings = useSettings()
  if (!settings.webdavUrl.value) return
  if (
    !settings.webdavSyncUISettings.value &&
    !settings.webdavSyncThemes.value &&
    !settings.webdavSyncBackgrounds.value
  ) {
    return
  }

  const snapshot = await buildDesktopSettingsSnapshot()
  const { auth, desktopSettingsBaseUrl } = await ensurePacilReadStructure({
    includeDesktopSettings: true,
    includeDesktopSettingsBackgrounds: settings.webdavSyncBackgrounds.value,
  })

  for (const background of snapshot.backgroundUploads) {
    await window.electronAPI.webdav.uploadFile(
      background.localPath,
      `${desktopSettingsBaseUrl}backgrounds/${background.remoteFileName}`,
      auth
    )
  }

  const response = await window.electronAPI.webdav.request({
    url: `${desktopSettingsBaseUrl}${DESKTOP_SETTINGS_FILE_NAME}`,
    method: 'PUT',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot.payload, null, 2),
  })

  if (response.error) throw new Error(response.error)
  if (!response.status || response.status < 200 || response.status >= 300) {
    throw new Error(`上传桌面设置失败 (HTTP ${response.status})`)
  }
}

function replaceBackgroundPlaceholders(
  settingsMap: Record<string, string>,
  tokenToLocalFileUrl: Record<string, string>
): Record<string, string> {
  const nextSettings = { ...settingsMap }

  if (nextSettings.bgImage) {
    const token = readBackgroundPlaceholder(nextSettings.bgImage)
    if (token) nextSettings.bgImage = tokenToLocalFileUrl[token] || ''
  }

  if (nextSettings.custom_themes) {
    try {
      const themes = JSON.parse(nextSettings.custom_themes)
      if (Array.isArray(themes)) {
        nextSettings.custom_themes = JSON.stringify(
          themes.map((theme) => {
            if (!theme || typeof theme !== 'object') return theme
            const nextTheme = { ...theme }
            if (typeof nextTheme.bgImage === 'string') {
              const token = readBackgroundPlaceholder(nextTheme.bgImage)
              if (token) nextTheme.bgImage = tokenToLocalFileUrl[token] || ''
            }
            return nextTheme
          })
        )
      }
    } catch (_) {}
  }

  return nextSettings
}

export async function restoreDesktopSettingsSnapshot(): Promise<{
  applied: boolean
  message?: string
}> {
  const settings = useSettings()
  if (!settings.webdavUrl.value) {
    return { applied: false, message: '未配置 WebDAV 地址' }
  }

  const { auth, baseUrl, desktopSettingsDir } = await getWebDavContext()
  const remoteUrl = `${baseUrl}${desktopSettingsDir}/${DESKTOP_SETTINGS_FILE_NAME}`
  const response = await window.electronAPI.webdav.request({
    url: remoteUrl,
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  })

  if (response.status === 404) {
    return { applied: false, message: '云端没有桌面设置文件，已保留本地设置' }
  }
  if (response.error) throw new Error(response.error)
  if (response.status !== 200 || !response.data) {
    throw new Error(`读取桌面设置失败 (HTTP ${response.status})`)
  }

  const payload = JSON.parse(response.data) as DesktopSettingsPayload
  if (payload.platform !== 'desktop' || payload.schemaVersion !== DESKTOP_SETTINGS_SCHEMA_VERSION) {
    throw new Error('桌面设置文件格式不兼容')
  }

  const tokenToLocalFileUrl: Record<string, string> = {}
  if (settings.webdavSyncBackgrounds.value && Array.isArray(payload.backgroundFiles)) {
    const appDataPath = await window.electronAPI.app.getPath('userData')
    for (const file of payload.backgroundFiles) {
      const localPath = `${appDataPath}/desktop-bg-${file.remoteFileName}`
      const download = await window.electronAPI.webdav.downloadFile(
        `${baseUrl}${desktopSettingsDir}/backgrounds/${file.remoteFileName}`,
        localPath,
        auth
      )
      if (!download.error) {
        tokenToLocalFileUrl[file.token] = localPathToFileUrl(localPath)
      }
    }
  }

  const nextSettings = replaceBackgroundPlaceholders(payload.settings || {}, tokenToLocalFileUrl)
  await saveSettingsMap(nextSettings)
  await settings.loadAllSettings()

  return { applied: true }
}
