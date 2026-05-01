import { useDataStore } from './useDataStore'
import { useSettings } from './useSettings'

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
const ENTITY_TYPES = ['books', 'chapters', 'rules', 'themes', 'bookmarks', 'readingStats', 'settings'] as const

// ---- WebDAV path helpers ----
function getWebdavContext() {
  const settings = useSettings()
  const url = settings.webdavUrl.value
  const user = settings.webdavUser.value
  const pass = settings.webdavPass.value
  return {
    url,
    user,
    pass,
    auth: btoa(`${user}:${pass}`),
    baseUrl: url.replace(/\/+$/, ''),
  }
}

function remoteUrl(path: string): string {
  const ctx = getWebdavContext()
  return `${ctx.baseUrl}/PacilRead/${path}`
}

async function webdavPut(path: string, body: string, contentType?: string): Promise<boolean> {
  const ctx = getWebdavContext()
  const headers: Record<string, string> = {
    Authorization: `Basic ${ctx.auth}`,
  }
  if (contentType) headers['Content-Type'] = contentType
  try {
    const response = await window.electronAPI.webdav.request({
      url: remoteUrl(path),
      method: 'PUT',
      headers,
      body,
    })
    return !response.error && response.status ? response.status < 400 : false
  } catch { return false }
}

async function webdavGet(path: string): Promise<string | null> {
  const ctx = getWebdavContext()
  try {
    const response = await window.electronAPI.webdav.request({
      url: remoteUrl(path),
      method: 'GET',
      headers: { Authorization: `Basic ${ctx.auth}` },
    })
    if (response.status === 200 && response.data) return response.data
    return null
  } catch { return null }
}

async function webdavGetJson<T>(path: string): Promise<T | null> {
  const data = await webdavGet(path)
  if (!data) return null
  try { return JSON.parse(data) as T } catch { return null }
}

async function webdavDelete(path: string): Promise<boolean> {
  const ctx = getWebdavContext()
  try {
    const response = await window.electronAPI.webdav.request({
      url: remoteUrl(path),
      method: 'DELETE',
      headers: { Authorization: `Basic ${ctx.auth}` },
    })
    return !response.error
  } catch { return false }
}

async function webdavFileExists(path: string): Promise<boolean> {
  const ctx = getWebdavContext()
  try {
    const response = await window.electronAPI.webdav.request({
      url: remoteUrl(path),
      method: 'HEAD',
      headers: { Authorization: `Basic ${ctx.auth}` },
    })
    return response.status === 200
  } catch { return false }
}

// ---- Manifest operations ----

async function generateManifest(): Promise<Manifest> {
  const files: Record<string, ManifestFileEntry> = {}
  const assets: Record<string, ManifestAssetEntry> = {}

  // Hash JSON data files
  for (const entity of ENTITY_TYPES) {
    const { sha256, size } = await window.electronAPI.data.hashFile(entity)
    files[`${entity}.json`] = {
      sha256: sha256 || '0',
      size,
    }
  }

  // TODO: Add asset manifests (covers, books, chapter_text zips)
  // These would be generated during full/incremental backup

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
  return changed
}

// ---- Entity merge logic ----

type MatchKeyFn<T> = (entity: T) => string

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

    const entities = dataStore.getAllEntities()

    // Upload each entity JSON file to database/ directory
    for (const entity of ENTITY_TYPES) {
      onProgress?.(`正在上传 ${entity}.json...`)
      const jsonStr = JSON.stringify(entities[entity], null, 2)
      const ok = await webdavPut(`database/${entity}.json`, jsonStr, 'application/json')
      if (!ok) throw new Error(`上传 ${entity}.json 失败`)
    }

    // Generate and upload manifest
    onProgress?.('正在生成清单文件...')
    const manifest = await generateManifest()
    await uploadManifest(manifest, 'database')

    // Also upload manifest to sync/ for incremental sync
    await uploadManifest(manifest, 'sync')

    // Also upload individual entity files to sync/
    onProgress?.('正在上传增量同步文件...')
    for (const entity of ENTITY_TYPES) {
      const jsonStr = JSON.stringify(entities[entity], null, 2)
      await webdavPut(`sync/${entity}.json`, jsonStr, 'application/json')
    }

    onProgress?.('全量备份完成!')
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ---- Full restore ----

export async function fullRestoreV8(
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; error?: string }> {
  try {
    const dataStore = useDataStore()
    onProgress?.('正在检查远程数据格式...')

    // Check if v8 JSON format exists
    const hasV8 = await webdavFileExists('database/manifest.json')
    if (!hasV8) {
      return { success: false, error: '远程没有 v8 JSON 格式数据，请尝试旧格式恢复' }
    }

    onProgress?.('正在下载数据...')
    const entities: Record<string, any> = {}

    for (const entity of ENTITY_TYPES) {
      onProgress?.(`正在下载 ${entity}.json...`)
      const data = await webdavGetJson(`${entity}.json`)
      if (data !== null) {
        entities[entity] = data
      }
    }

    // Also try from sync/ directory as fallback
    for (const entity of ENTITY_TYPES) {
      if (!entities[entity]) {
        const data = await webdavGetJson(`sync/${entity}.json`)
        if (data !== null) {
          entities[entity] = data
        }
      }
    }

    onProgress?.('正在应用数据...')
    await dataStore.replaceAllEntities(entities as any)
    dataStore.dataLoaded.value = true

    onProgress?.('全量恢复完成!')
    return { success: true }
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

    onProgress?.('正在生成本地清单...')
    const localManifest = await generateManifest()

    onProgress?.('正在下载远程清单...')
    const remoteManifest = await downloadManifest('sync')

    if (!remoteManifest) {
      // First time - do full upload to sync/
      onProgress?.('首次同步，上传全部文件...')
      const entities = dataStore.getAllEntities()
      for (const entity of ENTITY_TYPES) {
        onProgress?.(`正在上传 ${entity}.json...`)
        const jsonStr = JSON.stringify(entities[entity], null, 2)
        await webdavPut(`sync/${entity}.json`, jsonStr, 'application/json')
        uploadedFiles.push(`${entity}.json`)
      }
      await uploadManifest(localManifest, 'sync')
      uploadedFiles.push('manifest.json')
    } else {
      // Find changed files
      const changed = findChangedFiles(localManifest, remoteManifest)
      const entities = dataStore.getAllEntities()

      for (const fileName of changed) {
        const entity = fileName.replace('.json', '')
        if (entity in entities) {
          onProgress?.(`正在上传 ${fileName}...`)
          const jsonStr = JSON.stringify((entities as any)[entity], null, 2)
          await webdavPut(`sync/${fileName}`, jsonStr, 'application/json')
          uploadedFiles.push(fileName)
        }
      }

      if (changed.length > 0) {
        await uploadManifest(localManifest, 'sync')
        uploadedFiles.push('manifest.json')
      }
    }

    return { success: true, uploadedFiles }
  } catch (e) {
    return { success: false, uploadedFiles: [], error: String(e) }
  }
}

// ---- Incremental restore ----

export async function incrementalRestoreV8(
  onProgress?: (message: string) => void,
): Promise<{ success: boolean; mergedFiles: string[]; error?: string }> {
  try {
    const dataStore = useDataStore()
    const mergedFiles: string[] = []

    onProgress?.('正在下载远程清单...')
    const remoteManifest = await downloadManifest('sync')
    if (!remoteManifest) {
      return { success: false, mergedFiles: [], error: '远程没有增量同步数据' }
    }

    // Download and merge each entity file
    for (const [fileName] of Object.entries(remoteManifest.files)) {
      const entity = fileName.replace('.json', '')
      if (!ENTITY_TYPES.includes(entity as any)) continue

      onProgress?.(`正在下载 ${fileName}...`)
      const remoteData = await webdavGetJson<any[] | Record<string, string>>(`sync/${fileName}`)
      if (remoteData === null) continue

      // Get local data
      const localEntities = (dataStore as any)[entity].value as any[]

      if (entity === 'settings') {
        // Settings are merged differently (object merge)
        const localSettings = dataStore.settingsMap.value
        const remoteSettings = remoteData as Record<string, string>
        await dataStore.setSettings({ ...localSettings, ...remoteSettings })
        mergedFiles.push(fileName)
      } else if (Array.isArray(localEntities) && Array.isArray(remoteData)) {
        // Array entities: merge by updatedAt
        const matchKeys: Record<string, MatchKeyFn<any>> = {
          books: (b: any) => b.readingStatsKey || `${b.title}\n${b.author || ''}`,
          chapters: (c: any) => `${c.bookId}_${c.orderIndex}`,
          rules: (r: any) => `${r.pattern}_${r.scope}_${r.bookId || 'global'}`,
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
            await window.electronAPI.data.writeEntity(entity, merged)
            mergedFiles.push(fileName)
          }
        }
      }
    }

    // Reload everything from disk to ensure consistency
    dataStore.dataLoaded.value = false
    await dataStore.loadAllData()

    return { success: true, mergedFiles }
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
  const [dbManifest, syncManifest, readerDb, readerLiteDb] = await Promise.all([
    webdavFileExists('database/manifest.json'),
    webdavFileExists('sync/manifest.json'),
    webdavFileExists('reader.db'),
    webdavFileExists('reader_lite.db'),
  ])

  return {
    hasV8Full: dbManifest,
    hasV8Incremental: syncManifest,
    hasV7Full: readerDb,
    hasV7Incremental: readerLiteDb,
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

  const v7Files = [
    'reader.db',
    'reader_lite.db',
    'desktop-settings/database/reader_lite.db',
  ]

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
