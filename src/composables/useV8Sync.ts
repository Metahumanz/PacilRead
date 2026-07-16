import { toRaw } from 'vue'
import { useDataStore } from './useDataStore'
import {
  extractDesktopSettingsValues,
} from './useReadingStats'
import { createWebdavClient } from './useWebdavClient'
import { buildPacilReadBaseUrl } from '../utils/webdav'
import { normalizeBookMetadata } from '../utils/bookMetadata'
import {
  applySyncDiffResolution,
  buildSyncDiffPreview,
  remapRemoteSyncEntityIds,
  type SyncDiffPreview,
  type SyncResolutionMap,
} from '../utils/syncDiff'

// ---- v8 manifest types ----
interface ManifestFileEntry {
  sha256: string
  size: number
}

export interface ManifestAssetEntry {
  size: number
  sha256?: string
}

export interface SyncManifest {
  schemaVersion: number
  generatedAt: number
  generationId?: string
  files: Record<string, ManifestFileEntry>
  assets: Record<string, ManifestAssetEntry>
  scopes?: {
    chapterText?: boolean
    covers?: boolean
    sourceFiles?: boolean
  }
}

interface SnapshotCommit {
  schemaVersion: number
  generationId: string
  manifestSha256: string
  committedAt: number
}

interface PreparedAsset {
  key: string
  localPath: string
  integrity: ManifestAssetEntry & { sha256: string }
}

type Manifest = SyncManifest

const MANIFEST_SCHEMA_VERSION = 1
const SNAPSHOT_COMMIT_FILE = 'commit.json'
const ENTITY_TYPES = ['books', 'chapters', 'rules', 'themes', 'bookmarks', 'readingStats'] as const
type EntityType = typeof ENTITY_TYPES[number]
type SyncEntityPayloads = Record<EntityType, any>

function buildSyncEntities(dataStore = useDataStore()): SyncEntityPayloads {
  const entities = dataStore.getAllEntities()
  return {
    books: entities.books.map(book => normalizeBookMetadata(book)),
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

function parseEntityArrayJson(raw: string, label: string): any[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${label} JSON 格式损坏`)
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} 数据结构无效`)
  if (parsed.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error(`${label} 含有非对象记录`)
  }
  return parsed
}

async function sha256TextHex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createGenerationId(): string {
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  return `${Date.now()}-${suffix}`
}

function manifestJson(manifest: Manifest): string {
  return JSON.stringify(manifest, null, 2)
}

function assetFileName(value: unknown): string {
  const clean = String(value || '').split(/[?#]/)[0].replace(/\\/g, '/')
  return clean.split('/').pop() || ''
}

function encodeAssetKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

async function assertManagedFileIntegrity(
  filePath: string,
  expected: ManifestAssetEntry,
  label: string,
): Promise<void> {
  const actual = await window.electronAPI.library.getManagedFileIntegrity(filePath)
  if (actual.size !== expected.size) {
    throw new Error(`${label}大小校验失败`)
  }
  if (expected.sha256 && actual.sha256.toLowerCase() !== expected.sha256.toLowerCase()) {
    throw new Error(`${label} SHA-256 校验失败`)
  }
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

export type {
  SyncDiffPreview,
  SyncResolutionMap,
}

export interface FullRestoreV8Result {
  success: boolean
  error?: string
  desktopSettingsFallback?: Record<string, string>
  resolvedBase?: string
  manifest?: SyncManifest
  strictSnapshot?: boolean
  sourceFilesDownloaded?: number
}

export async function previewSyncDiff(): Promise<{
  success: boolean
  preview?: SyncDiffPreview
  error?: string
}> {
  try {
    const dataStore = useDataStore()
    const localEntities = buildSyncEntities(dataStore)
    const remoteEntities = remapRemoteSyncEntityIds(localEntities, await downloadRemoteSyncEntities())
    return {
      success: true,
      preview: buildSyncDiffPreview(localEntities as any, remoteEntities as any),
    }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function applySyncResolution(
  resolutions: SyncResolutionMap,
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; appliedFiles: string[]; error?: string }> {
  try {
    const dataStore = useDataStore()
    onProgress?.('正在下载远端差异数据...')
    const localEntities = buildSyncEntities(dataStore)
    const remoteEntities = remapRemoteSyncEntityIds(localEntities, await downloadRemoteSyncEntities())
    const merged = applySyncDiffResolution(localEntities as any, remoteEntities as any, resolutions)

    onProgress?.('正在应用选择结果...')
    await dataStore.replaceAllEntities(merged)
    dataStore.dataLoaded.value = true

    onProgress?.('正在同步选择结果到云端...')
    const manifest = await generateManifest(merged)
    const appliedFiles: string[] = []
    for (const entity of ENTITY_TYPES) {
      const jsonStr = entityJson(merged, entity)
      const ok = await webdavPut(`sync/${entity}.json`, jsonStr, 'application/json')
      if (!ok) throw new Error(`上传 sync/${entity}.json 失败`)
      appliedFiles.push(`${entity}.json`)
    }
    if (!await uploadManifest(manifest, 'sync')) throw new Error('上传 sync/manifest.json 失败')
    appliedFiles.push('manifest.json')

    onProgress?.('正在同步封面文件...')
    await downloadCovers(merged.books, onProgress)
    const uploadedCovers = await uploadCovers(merged.books, onProgress)
    uploadedCovers.forEach(fileName => appliedFiles.push(`covers/${fileName}`))

    return { success: true, appliedFiles }
  } catch (e) {
    return { success: false, appliedFiles: [], error: String(e) }
  }
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
      const filename = assetFileName(book.coverFile)
      if (filename) filenames.add(filename)
    }
  }
  return [...filenames]
}

function getSourceFilenames(books: any[]): string[] {
  const filenames = new Set<string>()
  for (const book of books) {
    const filename = assetFileName(book.sourceFile)
    if (filename) filenames.add(filename)
  }
  return [...filenames]
}

async function prepareFullBackupAssets(
  entities: SyncEntityPayloads,
  includeSourceFiles: boolean,
  onProgress?: (message: string) => void,
): Promise<PreparedAsset[]> {
  const userData = (await window.electronAPI.app.getPath('userData')).replace(/\\/g, '/')
  const assets: PreparedAsset[] = []
  const addAsset = async (key: string, localPath: string, label: string) => {
    const integrity = await window.electronAPI.library.getManagedFileIntegrity(localPath)
    assets.push({ key, localPath, integrity })
    onProgress?.(`已校验 ${label}`)
  }

  const bookIds = await window.electronAPI.library.getBookIdsWithFileGzipChapters()
  for (let index = 0; index < bookIds.length; index++) {
    const bookId = bookIds[index]
    onProgress?.(`正在打包章节正文 (${index + 1}/${bookIds.length})...`)
    const zipPath = await window.electronAPI.library.createBookChapterTextZip(bookId)
    if (!zipPath) throw new Error(`书籍 ${bookId} 的章节正文 ZIP 生成失败`)
    await addAsset(`chapter_text/book_${bookId}.zip`, zipPath, `书籍 ${bookId} 正文包`)
  }

  for (const filename of getCoverFilenames(entities.books)) {
    await addAsset(`covers/${filename}`, `${userData}/covers/${filename}`, `封面 ${filename}`)
  }

  if (includeSourceFiles) {
    for (const filename of getSourceFilenames(entities.books)) {
      await addAsset(`books/${filename}`, `${userData}/books/${filename}`, `源文件 ${filename}`)
    }
  }

  return assets
}

async function uploadPreparedAssets(
  assets: PreparedAsset[],
  onProgress?: (message: string) => void,
): Promise<void> {
  const ctx = getWebdavContext()
  for (let index = 0; index < assets.length; index++) {
    const asset = assets[index]
    onProgress?.(`正在上传资源 (${index + 1}/${assets.length})：${asset.key}`)
    const result = await window.electronAPI.webdav.uploadFile(
      asset.localPath,
      remoteUrl(encodeAssetKey(asset.key)),
      ctx.auth,
    )
    if (!result.success) {
      throw new Error(`上传资源失败：${asset.key} (${result.error || result.status || 'unknown'})`)
    }
  }
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
  assets: Record<string, ManifestAssetEntry> = {},
): Promise<string[]> {
  const downloaded: string[] = []
  const coversDir = await getCoversDir()
  const ctx = getWebdavContext()
  const base = baseOverride || ctx.baseUrl
  const filenames = getCoverFilenames(books)

  for (const filename of filenames) {
    const localPath = `${coversDir}/${filename}`
    const assetKey = `covers/${filename}`
    const expected = assets[assetKey]
    try {
      const response = await window.electronAPI.webdav.downloadFile(
        `${base}/covers/${encodeURIComponent(filename)}`,
        localPath,
        ctx.auth,
      )
      if (response.success) {
        if (expected) await assertManagedFileIntegrity(localPath, expected, `封面 ${filename}`)
        downloaded.push(filename)
      } else {
        if (expected) throw new Error(`下载封面失败：${filename}`)
        // 旧版清单未记录封面时按可选资源兼容处理。
        console.warn(`Cover not found remotely: ${filename}`)
      }
    } catch (e) {
      console.error(`Failed to download cover ${filename}:`, e)
      if (expected) throw e
    }
  }
  if (downloaded.length > 0) onProgress?.(`已下载 ${downloaded.length} 个封面文件`)
  return downloaded
}

async function downloadSourceFiles(
  books: any[],
  onProgress?: (message: string) => void,
  baseOverride?: string,
  assets: Record<string, ManifestAssetEntry> = {},
): Promise<string[]> {
  const userData = (await window.electronAPI.app.getPath('userData')).replace(/\\/g, '/')
  const ctx = getWebdavContext()
  const base = baseOverride || ctx.baseUrl
  const filenames = getSourceFilenames(books)
  const downloaded: string[] = []

  for (let index = 0; index < filenames.length; index++) {
    const filename = filenames[index]
    const assetKey = `books/${filename}`
    const expected = assets[assetKey]
    if (Object.keys(assets).length > 0 && !expected) continue
    const localPath = `${userData}/books/${filename}`
    onProgress?.(`正在下载源文件 (${index + 1}/${filenames.length})...`)
    const response = await window.electronAPI.webdav.downloadFile(
      `${base}/books/${encodeURIComponent(filename)}`,
      localPath,
      ctx.auth,
    )
    if (!response.success) throw new Error(`下载源文件失败：${filename}`)
    if (expected) await assertManagedFileIntegrity(localPath, expected, `源文件 ${filename}`)
    downloaded.push(filename)
  }
  return downloaded
}

// ---- Manifest operations ----

async function generateManifest(
  entities: SyncEntityPayloads,
  options: {
    generationId?: string
    assets?: PreparedAsset[]
    scopes?: Manifest['scopes']
  } = {},
): Promise<Manifest> {
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

  for (const asset of options.assets || []) {
    assets[asset.key] = { ...asset.integrity }
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: Date.now(),
    ...(options.generationId ? { generationId: options.generationId } : {}),
    files,
    assets,
    ...(options.scopes ? { scopes: options.scopes } : {}),
  }
}

async function uploadManifest(manifest: Manifest, dir: 'database' | 'sync'): Promise<boolean> {
  return webdavPut(`${dir}/manifest.json`, manifestJson(manifest), 'application/json')
}

async function downloadManifest(dir: 'database' | 'sync'): Promise<Manifest | null> {
  return webdavGetJson<Manifest>(`${dir}/manifest.json`)
}

async function uploadSnapshotCommit(manifest: Manifest, dir: 'database' | 'sync'): Promise<boolean> {
  if (!manifest.generationId) return false
  const commit: SnapshotCommit = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generationId: manifest.generationId,
    manifestSha256: await sha256TextHex(manifestJson(manifest)),
    committedAt: Date.now(),
  }
  return webdavPut(`${dir}/${SNAPSHOT_COMMIT_FILE}`, JSON.stringify(commit, null, 2), 'application/json')
}

async function validateSnapshotCommitAt(baseUrl: string, manifest: Manifest, manifestRaw: string): Promise<void> {
  if (!manifest.generationId) return
  const commitRaw = await getJsonAt(baseUrl, `database/${SNAPSHOT_COMMIT_FILE}`)
  if (!commitRaw) throw new Error('完整快照尚未提交完成，请重新执行全量备份')
  let commit: SnapshotCommit
  try {
    commit = JSON.parse(commitRaw) as SnapshotCommit
  } catch {
    throw new Error('完整快照提交标记损坏')
  }
  if (commit.generationId !== manifest.generationId) {
    throw new Error('完整快照提交标记与 manifest 不匹配')
  }
  const manifestSha256 = await sha256TextHex(manifestRaw)
  if (commit.manifestSha256.toLowerCase() !== manifestSha256.toLowerCase()) {
    throw new Error('完整快照 manifest 校验失败')
  }
}

async function downloadRemoteSyncEntities(): Promise<Partial<SyncEntityPayloads>> {
  const remoteManifest = await downloadManifest('sync')
  if (!remoteManifest) throw new Error('远程没有增量同步数据')

  const entities: Partial<SyncEntityPayloads> = {}
  for (const entity of ENTITY_TYPES) {
    const fileName = `${entity}.json`
    const expected = remoteManifest.files[fileName]
    if (!expected?.sha256) throw new Error(`远程 manifest 缺少 ${fileName} 校验信息`)
    const remoteText = await webdavGet(`sync/${fileName}`)
    if (remoteText === null) throw new Error(`远程缺少 sync/${fileName}`)
    if (utf8Size(remoteText) !== expected.size) throw new Error(`sync/${fileName} 大小校验失败`)
    if ((await sha256TextHex(remoteText)).toLowerCase() !== expected.sha256.toLowerCase()) {
      throw new Error(`sync/${fileName} SHA-256 校验失败`)
    }
    const remoteData = parseEntityArrayJson(remoteText, `sync/${fileName}`)
    ;(entities as any)[entity] = entity === 'books'
      ? remoteData.map(book => normalizeBookMetadata(book))
      : remoteData
  }
  return entities
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

// ---- Full backup ----

export async function fullBackupV8(
  onProgress?: (message: string) => void,
  options: { includeSourceFiles?: boolean } = {},
): Promise<{ success: boolean; error?: string }> {
  try {
    const dataStore = useDataStore()
    onProgress?.('正在读取本地数据...')

    const entities = buildSyncEntities(dataStore)
    const generationId = createGenerationId()
    const assets = await prepareFullBackupAssets(entities, options.includeSourceFiles === true, onProgress)

    // Upload each entity JSON file to database/ directory for mobile compatibility.
    for (const entity of ENTITY_TYPES) {
      onProgress?.(`正在上传 ${entity}.json...`)
      const jsonStr = entityJson(entities, entity)
      const ok = await webdavPut(`database/${entity}.json`, jsonStr, 'application/json')
      if (!ok) throw new Error(`上传 ${entity}.json 失败`)
    }

    onProgress?.('正在上传增量同步文件...')
    for (const entity of ENTITY_TYPES) {
      const jsonStr = entityJson(entities, entity)
      const ok = await webdavPut(`sync/${entity}.json`, jsonStr, 'application/json')
      if (!ok) throw new Error(`上传 sync/${entity}.json 失败`)
    }

    await uploadPreparedAssets(assets, onProgress)

    onProgress?.('正在生成完整资源清单...')
    const manifest = await generateManifest(entities, {
      generationId,
      assets,
      scopes: {
        chapterText: true,
        covers: true,
        sourceFiles: options.includeSourceFiles === true,
      },
    })
    if (!await uploadManifest(manifest, 'database')) throw new Error('上传 database/manifest.json 失败')
    if (!await uploadManifest(manifest, 'sync')) throw new Error('上传 sync/manifest.json 失败')
    if (!await uploadSnapshotCommit(manifest, 'database')) throw new Error('提交完整快照失败')
    if (!await uploadSnapshotCommit(manifest, 'sync')) throw new Error('提交增量基线失败')
    await cleanupLegacySettingsFiles()

    onProgress?.('全量备份完成!')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ---- Full restore ----

export async function fullRestoreV8(
  onProgress?: (message: string) => void,
  options: { includeSourceFiles?: boolean } = {},
): Promise<FullRestoreV8Result> {
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

    const manifestRaw = await getJsonAt(base, 'database/manifest.json')
    if (!manifestRaw) return { success: false, error: '远程 manifest.json 无法读取' }
    let manifest: Manifest
    try {
      manifest = JSON.parse(manifestRaw) as Manifest
    } catch {
      return { success: false, error: '远程 manifest.json 已损坏' }
    }
    if (!manifest.files || typeof manifest.files !== 'object') {
      return { success: false, error: '远程 manifest.json 缺少文件清单' }
    }
    await validateSnapshotCommitAt(base, manifest, manifestRaw)

    onProgress?.('正在下载并校验 JSON 数据...')
    const entities: Record<string, any> = {}

    for (const entity of ENTITY_TYPES) {
      const fileName = `${entity}.json`
      const expected = manifest.files[fileName]
      if (!expected?.sha256) throw new Error(`manifest 缺少 ${fileName} 校验信息`)
      onProgress?.(`正在下载 ${entity}.json...`)
      const raw = await getJsonAt(base, `database/${fileName}`)
      if (raw === null) throw new Error(`完整快照缺少 ${fileName}`)
      if (utf8Size(raw) !== expected.size) throw new Error(`${fileName} 大小校验失败`)
      if ((await sha256TextHex(raw)).toLowerCase() !== expected.sha256.toLowerCase()) {
        throw new Error(`${fileName} SHA-256 校验失败`)
      }
      entities[entity] = parseEntityArrayJson(raw, fileName)
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

    const assets = manifest.assets || {}
    let sourceFilesDownloaded = 0
    if (entities.books) {
      if (manifest.scopes?.covers !== false) {
        onProgress?.('正在下载封面文件...')
        await downloadCovers(entities.books, onProgress, base, assets)
      }
      if (options.includeSourceFiles && manifest.scopes?.sourceFiles !== false) {
        sourceFilesDownloaded = (await downloadSourceFiles(entities.books, onProgress, base, assets)).length
      }
    }

    onProgress?.('全量恢复完成!')
    return {
      success: true,
      desktopSettingsFallback,
      resolvedBase: base,
      manifest,
      strictSnapshot: Boolean(manifest.generationId),
      sourceFilesDownloaded,
    }
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

    const localEntities = buildSyncEntities(dataStore)

    onProgress?.('正在下载远程清单...')
    const remoteManifest = await downloadManifest('sync')
    let entities = localEntities

    if (remoteManifest) {
      onProgress?.('正在保留其他设备的云端独有数据...')
      const remoteEntities = remapRemoteSyncEntityIds(localEntities, await downloadRemoteSyncEntities())
      const preview = buildSyncDiffPreview(localEntities, remoteEntities)
      const preserveResolutions: SyncResolutionMap = {}
      for (const item of preview.items) {
        if (item.status === 'conflict') preserveResolutions[item.id] = 'local'
      }
      entities = applySyncDiffResolution(localEntities, remoteEntities, preserveResolutions)
    }

    onProgress?.('正在生成本地清单...')
    const localManifest = await generateManifest(entities)
    if (remoteManifest) {
      localManifest.assets = { ...(remoteManifest.assets || {}) }
      localManifest.scopes = remoteManifest.scopes
    }

    if (!remoteManifest) {
      // First time - do full upload to sync/
      onProgress?.('首次同步，上传全部文件...')
      for (const entity of ENTITY_TYPES) {
        onProgress?.(`正在上传 ${entity}.json...`)
        const jsonStr = entityJson(entities, entity)
        const ok = await webdavPut(`sync/${entity}.json`, jsonStr, 'application/json')
        if (!ok) throw new Error(`上传 sync/${entity}.json 失败`)
        uploadedFiles.push(`${entity}.json`)
      }
      if (!await uploadManifest(localManifest, 'sync')) throw new Error('上传 sync/manifest.json 失败')
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
          const ok = await webdavPut(`sync/${fileName}`, jsonStr, 'application/json')
          if (!ok) throw new Error(`上传 sync/${fileName} 失败`)
          uploadedFiles.push(fileName)
        }
      }

      if (changed.length > 0) {
        if (!await uploadManifest(localManifest, 'sync')) throw new Error('上传 sync/manifest.json 失败')
        uploadedFiles.push('manifest.json')
      }
      await cleanupLegacySettingsFiles()
    }

    // Upload cover image files
    onProgress?.('正在上传封面文件...')
    const coversUploaded = await uploadCovers(localEntities.books, onProgress)
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
    const desktopSettingsFallback: Record<string, string> = {}

    onProgress?.('正在下载远程清单...')
    const remoteManifest = await downloadManifest('sync')
    if (!remoteManifest) {
      return { success: false, mergedFiles: [], error: '远程没有增量同步数据' }
    }

    const localEntities = buildSyncEntities(dataStore)
    const remoteEntities = remapRemoteSyncEntityIds(localEntities, await downloadRemoteSyncEntities())
    const mergedEntities = applySyncDiffResolution(localEntities, remoteEntities, {})
    for (const entity of ENTITY_TYPES) {
      const fileName = `${entity}.json`
      if (entityJson(localEntities, entity) === entityJson(mergedEntities, entity)) continue
      await window.electronAPI.data.writeEntity(entity, toRaw(mergedEntities[entity]))
      mergedFiles.push(fileName)
    }

    const legacySettingsRaw = await webdavGet('sync/settings.json')
    if (legacySettingsRaw !== null) {
      try { Object.assign(desktopSettingsFallback, extractLegacyDesktopSettings(JSON.parse(legacySettingsRaw))) } catch {}
    }

    // Reload everything from disk to ensure consistency
    dataStore.dataLoaded.value = false
    await dataStore.loadAllData()

    // Download cover image files if books were merged
    if (mergedFiles.includes('books.json')) {
      onProgress?.('正在下载封面文件...')
      const coversDownloaded = await downloadCovers(
        dataStore.books.value,
        onProgress,
        undefined,
        remoteManifest.assets || {},
      )
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
