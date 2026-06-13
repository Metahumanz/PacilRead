import { toRaw } from 'vue'
import { useDataStore } from './useDataStore'
import {
  extractDesktopSettingsValues,
} from './useReadingStats'
import { createWebdavClient } from './useWebdavClient'
import { buildPacilReadBaseUrl } from '../utils/webdav'

// ---- v8 manifest types ----
interface ManifestFileEntry {
  sha256: string
  size: number
}

interface ManifestAssetEntry {
  size: number
}

interface Manifest {
  schemaVersion: number
  generatedAt: number
  files: Record<string, ManifestFileEntry>
  assets: Record<string, ManifestAssetEntry>
}

const MANIFEST_SCHEMA_VERSION = 1
const ENTITY_TYPES = ['books', 'chapters', 'rules', 'themes', 'bookmarks', 'readingStats'] as const
type EntityType = typeof ENTITY_TYPES[number]
type SyncEntityPayloads = Record<EntityType, any>

function buildSyncEntities(dataStore = useDataStore()): SyncEntityPayloads {
  const entities = dataStore.getAllEntities()
  return {
    books: entities.books,
    chapters: entities.chapters,
    rules: entities.rules,
    themes: entities.themes,
    bookmarks: entities.bookmarks,
    readingStats: entities.readingStats,
  }
}

function normalizeSettingsMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const settings: Record<string, string> = {}
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    settings[key] = String(entryValue)
  }
  return settings
}

function extractLegacyDesktopSettings(value: unknown): Record<string, string> {
  const settings = normalizeSettingsMap(value)
  return extractDesktopSettingsValues(settings)
}

function entityJson(entities: SyncEntityPayloads, entity: EntityType): string {
  return JSON.stringify(entities[entity], null, 2)
}

function utf8Size(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

async function sha256TextHex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

// ---- WebDAV path helpers ----
function getWebdavContext() {
  const store = useDataStore()
  const s = store.settingsMap.value
  const url = s['webdavUrl'] || ''
  const dir = s['webdavDir'] || ''
  const user = s['webdavUser'] || ''
  const pass = s['webdavPass'] || ''
  const baseUrl = buildPacilReadBaseUrl(url, dir).replace(/\/+$/, '')
  return {
    url,
    user,
    pass,
    auth: btoa(`${user}:${pass}`),
    baseUrl,
  }
}

function getWebdavClient(baseOverride?: string) {
  const ctx = getWebdavContext()
  return createWebdavClient({
    url: ctx.url,
    dir: '',
    user: ctx.user,
    pass: ctx.pass,
    baseUrl: (baseOverride || ctx.baseUrl).replace(/\/+$/, ''),
  })
}

function remoteUrl(path: string): string {
  return getWebdavClient().remoteUrl(path)
}

async function webdavPut(path: string, body: string, contentType?: string): Promise<boolean> {
  return getWebdavClient().putText(path, body, contentType)
}

async function webdavGet(path: string): Promise<string | null> {
  return getWebdavClient().getText(path)
}

async function webdavGetJson<T>(path: string): Promise<T | null> {
  const data = await webdavGet(path)
  if (!data) return null
  try { return JSON.parse(data) as T } catch { return null }
}

async function webdavDelete(path: string): Promise<boolean> {
  return getWebdavClient().delete(path)
}

async function cleanupLegacySettingsFiles(): Promise<void> {
  await webdavDelete('database/settings.json')
  await webdavDelete('sync/settings.json')
}

async function webdavFileExists(path: string): Promise<boolean> {
  return getWebdavClient().exists(path)
}

// ---- Backward-compat helpers ----

async function checkManifestAt(baseUrl: string): Promise<boolean> {
  const ctx = getWebdavContext()
  const url = `${baseUrl}/database/manifest.json`
  try {
    const response = await window.electronAPI.webdav.request({
      url,
      method: 'HEAD',
      headers: { Authorization: `Basic ${ctx.auth}` },
    })
    return response.status === 200
  } catch { return false }
}

async function getJsonAt(baseUrl: string, path: string): Promise<string | null> {
  const ctx = getWebdavContext()
  const url = `${baseUrl}/${path}`
  try {
    const response = await window.electronAPI.webdav.request({
      url,
      method: 'GET',
      headers: { Authorization: `Basic ${ctx.auth}` },
    })
    if (response.status === 200 && response.data) return response.data
    return null
  } catch { return null }
}

// ---- Cover asset helpers ----

async function getCoversDir(): Promise<string> {
  const userData = await window.electronAPI.app.getPath('userData')
  return `${userData.replace(/\\/g, '/')}/covers`
}

function getCoverFilenames(books: any[]): string[] {
  const filenames = new Set<string>()
  for (const book of books) {
    if (book.coverFile) {
      filenames.add(book.coverFile)
    }
  }
  return [...filenames]
}

async function uploadCovers(
  books: any[],
  onProgress?: (message: string) => void,
): Promise<string[]> {
  const uploaded: string[] = []
  const coversDir = await getCoversDir()
  const ctx = getWebdavContext()
  const filenames = getCoverFilenames(books)

  for (const filename of filenames) {
    const localPath = `${coversDir}/${filename}`
    try {
      const response = await window.electronAPI.webdav.uploadFile(
        localPath,
        remoteUrl(`covers/${encodeURIComponent(filename)}`),
        ctx.auth,
      )
      if (response.success) {
        uploaded.push(filename)
      } else {
        console.error(`Failed to upload cover ${filename}:`, response.error)
      }
    } catch (e) {
      console.error(`Failed to upload cover ${filename}:`, e)
    }
  }
  if (uploaded.length > 0) onProgress?.(`已上传 ${uploaded.length} 个封面文件`)
  return uploaded
}

async function downloadCovers(
  books: any[],
  onProgress?: (message: string) => void,
  baseOverride?: string,
): Promise<string[]> {
  const downloaded: string[] = []
  const coversDir = await getCoversDir()
  const ctx = getWebdavContext()
  const base = baseOverride || ctx.baseUrl
  const filenames = getCoverFilenames(books)

  for (const filename of filenames) {
    const localPath = `${coversDir}/${filename}`
    try {
      const response = await window.electronAPI.webdav.downloadFile(
        `${base}/covers/${encodeURIComponent(filename)}`,
        localPath,
        ctx.auth,
      )
      if (response.success) {
        downloaded.push(filename)
      } else {
        // File may not exist remotely — that's okay for optional covers
        console.warn(`Cover not found remotely: ${filename}`)
      }
    } catch (e) {
      console.error(`Failed to download cover ${filename}:`, e)
    }
  }
  if (downloaded.length > 0) onProgress?.(`已下载 ${downloaded.length} 个封面文件`)
  return downloaded
}

// ---- Manifest operations ----

async function generateManifest(entities: SyncEntityPayloads): Promise<Manifest> {
  const files: Record<string, ManifestFileEntry> = {}
  const assets: Record<string, ManifestAssetEntry> = {}

  // Hash JSON data files
  for (const entity of ENTITY_TYPES) {
    const jsonStr = entityJson(entities, entity)
    files[`${entity}.json`] = {
      sha256: await sha256TextHex(jsonStr),
      size: utf8Size(jsonStr),
    }
  }

  // TODO: Add asset manifests for chapter_text zips (covers are already synced via uploadCovers/downloadCovers)

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: Date.now(),
    files,
    assets,
  }
}

async function uploadManifest(manifest: Manifest, dir: 'database' | 'sync'): Promise<boolean> {
  return webdavPut(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2), 'application/json')
}

async function downloadManifest(dir: 'database' | 'sync'): Promise<Manifest | null> {
  return webdavGetJson<Manifest>(`${dir}/manifest.json`)
}

function findChangedFiles(local: Manifest, remote: Manifest): string[] {
  const changed: string[] = []
  for (const [fileName, localEntry] of Object.entries(local.files)) {
    const remoteEntry = remote.files[fileName]
    if (!remoteEntry || remoteEntry.sha256 !== localEntry.sha256) {
      changed.push(fileName)
    }
  }
  for (const fileName of Object.keys(remote.files)) {
    if (!(fileName in local.files)) changed.push(fileName)
  }
  return changed
}

// ---- Entity merge logic ----

type MatchKeyFn<T> = (entity: T) => string

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeRuleScope(value: unknown): 'global' | 'book' {
  return value === 'book' ? 'book' : 'global'
}

function getRuleBookId(rule: any): number | null {
  return toNumberOrNull(rule?.bookId ?? rule?.book_id)
}

function getRuleUpdatedAt(rule: any): number {
  return Number(rule?.updatedAt ?? rule?.updated_at ?? 0) || 0
}

function getRuleRegex(rule: any): boolean {
  if (typeof rule?.regex === 'boolean') return rule.regex
  return Number(rule?.is_regex ?? 0) === 1
}

function getRuleActive(rule: any): boolean {
  if (typeof rule?.active === 'boolean') return rule.active
  return Number(rule?.active ?? 1) === 1
}

function normalizeRuleForSync(rule: any, bookId: number | null = getRuleBookId(rule)): any {
  const scope = normalizeRuleScope(rule?.scope)
  return {
    id: toNumberOrNull(rule?.id) ?? 0,
    pattern: String(rule?.pattern || ''),
    replacement: String(rule?.replacement || ''),
    scope,
    bookId: scope === 'book' ? bookId : null,
    regex: getRuleRegex(rule),
    active: getRuleActive(rule),
    updatedAt: getRuleUpdatedAt(rule),
  }
}

function isSameNormalizedRule(source: any, normalized: any): boolean {
  return toNumberOrNull(source?.id) === normalized.id &&
    String(source?.pattern || '') === normalized.pattern &&
    String(source?.replacement || '') === normalized.replacement &&
    normalizeRuleScope(source?.scope) === normalized.scope &&
    getRuleBookId(source) === normalized.bookId &&
    getRuleRegex(source) === normalized.regex &&
    getRuleActive(source) === normalized.active &&
    getRuleUpdatedAt(source) === normalized.updatedAt
}

function buildRuleSyncKey(rule: any): string {
  const normalized = normalizeRuleForSync(rule)
  return [
    normalized.pattern,
    normalized.scope,
    normalized.scope === 'book' ? String(normalized.bookId ?? 0) : '0',
  ].join('|')
}

function nextEntityId(items: Array<{ id?: number }>): number {
  const maxId = items.reduce((max, item) => Math.max(max, Number(item.id || 0)), 0)
  return maxId + 1
}

function getBookSyncIdentity(book: any): string {
  return String(book?.readingStatsKey || '').trim()
}

function mapRemoteRuleBookIdToLocal(remoteRule: any, remoteBooks: any[], localBooks: any[]): number | null {
  const remoteBookId = getRuleBookId(remoteRule)
  if (remoteBookId === null) return null
  const remoteBook = remoteBooks.find(book => Number(book?.id) === remoteBookId)
  const remoteIdentity = getBookSyncIdentity(remoteBook)
  if (!remoteIdentity) return remoteBookId
  const localBook = localBooks.find(book => getBookSyncIdentity(book) === remoteIdentity)
  return toNumberOrNull(localBook?.id) ?? remoteBookId
}

function mergeRules(
  localRules: any[],
  remoteRules: any[],
  remoteBooks: any[],
  localBooks: any[],
): { merged: any[]; changes: number } {
  const byKey = new Map<string, any>()
  let changes = 0

  for (const rule of localRules) {
    const normalized = normalizeRuleForSync(rule)
    const key = buildRuleSyncKey(normalized)
    const existing = byKey.get(key)
    if (!existing || normalized.updatedAt >= existing.updatedAt) {
      byKey.set(key, normalized)
    }
    if (existing || !isSameNormalizedRule(rule, normalized)) changes++
  }

  for (const remoteRule of remoteRules) {
    const mappedBookId = mapRemoteRuleBookIdToLocal(remoteRule, remoteBooks, localBooks)
    const normalized = normalizeRuleForSync(remoteRule, mappedBookId)
    const key = buildRuleSyncKey(normalized)
    const localMatch = byKey.get(key)

    if (!localMatch) {
      normalized.id = nextEntityId(Array.from(byKey.values()))
      byKey.set(key, normalized)
      changes++
    } else if (normalized.updatedAt > localMatch.updatedAt) {
      byKey.set(key, { ...localMatch, ...normalized, id: localMatch.id })
      changes++
    }
  }

  return {
    merged: Array.from(byKey.values()).sort((a, b) => Number(a.id || 0) - Number(b.id || 0)),
    changes,
  }
}

function mergeEntities<T extends { updatedAt: number }>(
  local: T[],
  remote: T[],
  matchKey: MatchKeyFn<T>,
): { merged: T[]; changes: number } {
  const remoteMap = new Map<string, T>()
  for (const entity of remote) {
    remoteMap.set(matchKey(entity), entity)
  }

  let changes = 0
  const localKeys = new Set<string>()

  // Update existing and add new from remote
  for (const remoteEntity of remote) {
    const key = matchKey(remoteEntity)
    const localIdx = local.findIndex(e => matchKey(e) === key)
    if (localIdx !== -1) {
      localKeys.add(key)
      if (remoteEntity.updatedAt > local[localIdx].updatedAt) {
        local[localIdx] = remoteEntity
        changes++
      }
    } else {
      local.push(remoteEntity)
      changes++
    }
  }

  // Keep local entities not in remote
  // (they're already in the array, we just tracked which ones matched)

  return { merged: local, changes }
}

// ---- Full backup ----

export async function fullBackupV8(
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; error?: string }> {
  try {
    const dataStore = useDataStore()
    onProgress?.('正在读取本地数据...')

    const entities = buildSyncEntities(dataStore)

    // Upload each entity JSON file to database/ directory for mobile compatibility.
    for (const entity of ENTITY_TYPES) {
      onProgress?.(`正在上传 ${entity}.json...`)
      const jsonStr = entityJson(entities, entity)
      const ok = await webdavPut(`database/${entity}.json`, jsonStr, 'application/json')
      if (!ok) throw new Error(`上传 ${entity}.json 失败`)
    }

    // Generate and upload manifest
    onProgress?.('正在生成清单文件...')
    const manifest = await generateManifest(entities)
    await uploadManifest(manifest, 'database')

    // Also upload manifest to sync/ for incremental sync
    await uploadManifest(manifest, 'sync')

    // Also upload individual entity files to sync/
    onProgress?.('正在上传增量同步文件...')
    for (const entity of ENTITY_TYPES) {
      const jsonStr = entityJson(entities, entity)
      await webdavPut(`sync/${entity}.json`, jsonStr, 'application/json')
    }
    await cleanupLegacySettingsFiles()

    // Upload cover image files
    onProgress?.('正在上传封面文件...')
    await uploadCovers(entities.books, onProgress)

    onProgress?.('全量备份完成!')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ---- Full restore ----

export async function fullRestoreV8(
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; error?: string; desktopSettingsFallback?: Record<string, string> }> {
  try {
    const dataStore = useDataStore()
    const desktopSettingsFallback: Record<string, string> = {}
    onProgress?.('正在检查远程数据格式...')

    // Check if v8 JSON format exists at configured subdir
    let base = getWebdavContext().baseUrl
    let manifestExists = await checkManifestAt(base)
    if (!manifestExists) {
      // Fallback: old code uploaded to root/PacilRead (without webdavDir)
      const rootBase = `${getWebdavContext().url.replace(/\/+$/, '')}/PacilRead`
      if (rootBase !== base) {
        onProgress?.('子目录未找到 v8 数据，尝试根目录 PacilRead...')
        manifestExists = await checkManifestAt(rootBase)
        if (manifestExists) {
          // Use root-level base for all subsequent downloads
          base = rootBase
        }
      }
    }
    if (!manifestExists) {
      return { success: false, error: '远程没有 v8 JSON 格式数据，请尝试旧格式恢复' }
    }

    onProgress?.('正在下载数据...')
    const entities: Record<string, any> = {}

    for (const entity of ENTITY_TYPES) {
      onProgress?.(`正在下载 ${entity}.json...`)
      const raw = await getJsonAt(base, `database/${entity}.json`)
      if (raw !== null) {
        try {
          entities[entity] = JSON.parse(raw)
        } catch {}
      }
    }

    // Also try from sync/ directory as fallback
    for (const entity of ENTITY_TYPES) {
      if (!entities[entity]) {
        const raw = await getJsonAt(base, `sync/${entity}.json`)
        if (raw !== null) {
          try {
            entities[entity] = JSON.parse(raw)
          } catch {}
        }
      }
    }

    const collectLegacySettings = async (path: string) => {
      const raw = await getJsonAt(base, path)
      if (raw === null) return
      try {
        Object.assign(desktopSettingsFallback, extractLegacyDesktopSettings(JSON.parse(raw)))
      } catch {}
    }
    await collectLegacySettings('database/settings.json')
    await collectLegacySettings('sync/settings.json')

    onProgress?.('正在应用数据...')
    await dataStore.replaceAllEntities(entities as any)
    dataStore.dataLoaded.value = true

    // Download cover image files
    if (entities.books) {
      onProgress?.('正在下载封面文件...')
      await downloadCovers(entities.books, onProgress, base)
    }

    onProgress?.('全量恢复完成!')
    return { success: true, desktopSettingsFallback }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ---- Incremental backup ----

export async function incrementalBackupV8(
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; uploadedFiles: string[]; error?: string }> {
  try {
    const dataStore = useDataStore()
    const uploadedFiles: string[] = []

    const entities = buildSyncEntities(dataStore)

    onProgress?.('正在生成本地清单...')
    const localManifest = await generateManifest(entities)

    onProgress?.('正在下载远程清单...')
    const remoteManifest = await downloadManifest('sync')

    if (!remoteManifest) {
      // First time - do full upload to sync/
      onProgress?.('首次同步，上传全部文件...')
      for (const entity of ENTITY_TYPES) {
        onProgress?.(`正在上传 ${entity}.json...`)
        const jsonStr = entityJson(entities, entity)
        await webdavPut(`sync/${entity}.json`, jsonStr, 'application/json')
        uploadedFiles.push(`${entity}.json`)
      }
      await uploadManifest(localManifest, 'sync')
      uploadedFiles.push('manifest.json')
      await cleanupLegacySettingsFiles()
    } else {
      // Find changed files
      const changed = findChangedFiles(localManifest, remoteManifest)

      for (const fileName of changed) {
        const entity = fileName.replace('.json', '')
        if (entity in entities) {
          onProgress?.(`正在上传 ${fileName}...`)
          const jsonStr = entityJson(entities, entity as EntityType)
          await webdavPut(`sync/${fileName}`, jsonStr, 'application/json')
          uploadedFiles.push(fileName)
        }
      }

      if (changed.length > 0) {
        await uploadManifest(localManifest, 'sync')
        uploadedFiles.push('manifest.json')
      }
      await cleanupLegacySettingsFiles()
    }

    // Upload cover image files
    onProgress?.('正在上传封面文件...')
    const coversUploaded = await uploadCovers(entities.books, onProgress)
    coversUploaded.forEach(f => uploadedFiles.push(`covers/${f}`))

    return { success: true, uploadedFiles }
  } catch (e) {
    return { success: false, uploadedFiles: [], error: String(e) }
  }
}

// ---- Incremental restore ----

export async function incrementalRestoreV8(
  onProgress?: (message: string) => void,
): Promise<{
  success: boolean
  mergedFiles: string[]
  error?: string
  desktopSettingsFallback?: Record<string, string>
}> {
  try {
    const dataStore = useDataStore()
    const mergedFiles: string[] = []
    let remoteBooksForRuleMerge: any[] | null = null
    const desktopSettingsFallback: Record<string, string> = {}

    const getRemoteBooksForRuleMerge = async () => {
      if (remoteBooksForRuleMerge !== null) return remoteBooksForRuleMerge
      const remoteBooks = await webdavGetJson<any[]>('sync/books.json')
      remoteBooksForRuleMerge = Array.isArray(remoteBooks) ? remoteBooks : []
      return remoteBooksForRuleMerge
    }

    onProgress?.('正在下载远程清单...')
    const remoteManifest = await downloadManifest('sync')
    if (!remoteManifest) {
      return { success: false, mergedFiles: [], error: '远程没有增量同步数据' }
    }

    // Download and merge each entity file
    for (const [fileName] of Object.entries(remoteManifest.files)) {
      const entity = fileName.replace('.json', '')

      onProgress?.(`正在下载 ${fileName}...`)
      const remoteData = await webdavGetJson<any[] | Record<string, string>>(`sync/${fileName}`)
      if (remoteData === null) continue

      if (entity === 'settings') {
        Object.assign(desktopSettingsFallback, extractLegacyDesktopSettings(remoteData))
        continue
      }

      if (!ENTITY_TYPES.includes(entity as any)) continue

      // Get local data
      const localEntities = (dataStore as any)[entity].value as any[]

      if (entity === 'rules' && Array.isArray(localEntities) && Array.isArray(remoteData)) {
        const remoteBooks = await getRemoteBooksForRuleMerge()
        const { merged, changes } = mergeRules(
          localEntities,
          remoteData,
          remoteBooks,
          dataStore.books.value,
        )
        dataStore.rules.value = merged as any
        if (changes > 0) {
          await window.electronAPI.data.writeEntity(entity, toRaw(merged))
          mergedFiles.push(fileName)
        }
      } else if (Array.isArray(localEntities) && Array.isArray(remoteData)) {
        // Array entities: merge by updatedAt
        const matchKeys: Record<string, MatchKeyFn<any>> = {
          books: (b: any) => b.readingStatsKey || `${b.title}\n${b.author || ''}`,
          chapters: (c: any) => `${c.bookId}_${c.orderIndex}`,
          themes: (t: any) => t.name,
          bookmarks: (b: any) => b.uuid,
          readingStats: (r: any) => `${r.sourceDeviceId}_${r.date}_${r.bookIdentity}`,
        }

        const matchKey = matchKeys[entity]
        if (matchKey) {
          const { merged, changes } = mergeEntities(
            localEntities as any[],
            remoteData as any[],
            matchKey,
          )
          ;(dataStore as any)[entity].value = merged
          if (changes > 0) {
            await window.electronAPI.data.writeEntity(entity, toRaw(merged))
            mergedFiles.push(fileName)
          }
        }
      }
    }

    // Reload everything from disk to ensure consistency
    dataStore.dataLoaded.value = false
    await dataStore.loadAllData()

    // Download cover image files if books were merged
    if (mergedFiles.includes('books.json')) {
      onProgress?.('正在下载封面文件...')
      const coversDownloaded = await downloadCovers(dataStore.books.value, onProgress)
      coversDownloaded.forEach(f => mergedFiles.push(`covers/${f}`))
    }

    return { success: true, mergedFiles, desktopSettingsFallback }
  } catch (e) {
    return { success: false, mergedFiles: [], error: String(e) }
  }
}

// ---- Backward compatibility check ----

export async function checkRemoteV8Availability(): Promise<{
  hasV8Full: boolean
  hasV8Incremental: boolean
  hasV7Full: boolean
  hasV7Incremental: boolean
}> {
  const [fullManifest, syncManifest] = await Promise.all([
    webdavFileExists('database/manifest.json'),
    webdavFileExists('sync/manifest.json'),
  ])

  return {
    hasV8Full: fullManifest,
    hasV8Incremental: syncManifest,
    hasV7Full: false,
    hasV7Incremental: false,
  }
}

// ---- Cleanup v7 remote files ----

export async function cleanupRemoteV7Files(
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; deletedFiles: string[] }> {
  const deleted: string[] = []

  // Only clean up if v8 data already exists
  const hasV8 = await webdavFileExists('database/manifest.json') || await webdavFileExists('sync/manifest.json')
  if (!hasV8) {
    return { success: false, deletedFiles: [] }
  }

  const v7Files: string[] = []

  for (const file of v7Files) {
    onProgress?.(`正在检查 ${file}...`)
    const exists = await webdavFileExists(file)
    if (exists) {
      onProgress?.(`正在删除 ${file}...`)
      const ok = await webdavDelete(file)
      if (ok) deleted.push(file)
    }
  }

  return { success: true, deletedFiles: deleted }
}
