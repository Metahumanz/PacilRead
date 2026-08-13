export type SyncDiffEntity = 'books' | 'chapters' | 'rules' | 'themes' | 'bookmarks' | 'readingStats'
export type SyncDiffStatus = 'local' | 'remote' | 'conflict' | 'unchanged'
export type SyncResolutionChoice = 'local' | 'remote' | 'merge'

export interface SyncDiffField {
  field: string
  local: string
  remote: string
}

export interface SyncDiffItem {
  id: string
  entity: SyncDiffEntity
  key: string
  status: SyncDiffStatus
  title: string
  description: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  fields: SyncDiffField[]
}

export interface SyncDiffPreview {
  generatedAt: number
  summary: Record<SyncDiffStatus, number>
  items: SyncDiffItem[]
}

export type SyncResolutionMap = Record<string, SyncResolutionChoice>
export type SyncEntityPayloads = Record<SyncDiffEntity, any[]>

const ENTITIES: SyncDiffEntity[] = ['books', 'chapters', 'rules', 'themes', 'bookmarks', 'readingStats']

function safeString(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.join('、') || '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => (
    `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
  )).join(',')}}`
}

function numberOrZero(value: unknown): number {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

function ruleBookId(rule: any): number | null {
  const raw = rule?.bookId ?? rule?.book_id
  if (raw === null || raw === undefined || raw === '') return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

function ruleScope(rule: any): string {
  return rule?.scope === 'book' ? 'book' : 'global'
}

export function getSyncItemKey(entity: SyncDiffEntity, item: any): string {
  switch (entity) {
    case 'books':
      return String(item?.readingStatsKey || `${item?.title || ''}\n${item?.author || ''}`)
    case 'chapters':
      return `${numberOrZero(item?.bookId)}_${numberOrZero(item?.orderIndex)}`
    case 'rules':
      return [
        String(item?.pattern || ''),
        ruleScope(item),
        ruleScope(item) === 'book' ? String(ruleBookId(item) ?? 0) : '0',
      ].join('|')
    case 'themes':
      return String(item?.name || item?.id || '')
    case 'bookmarks':
      return String(item?.uuid || item?.id || '')
    case 'readingStats':
      return `${item?.sourceDeviceId || ''}_${item?.date || ''}_${item?.bookIdentity || ''}`
  }
}

function getUpdatedAt(entity: SyncDiffEntity, item: any): number {
  if (!item) return 0
  if (entity === 'chapters') return numberOrZero(item.updatedAt ?? item.id)
  return numberOrZero(item.updatedAt ?? item.updated_at)
}

function getTitle(entity: SyncDiffEntity, item: any, fallbackKey: string): string {
  switch (entity) {
    case 'books':
      return String(item?.title || '未命名书籍')
    case 'chapters':
      return String(item?.title || `章节 ${item?.orderIndex ?? fallbackKey}`)
    case 'rules':
      return String(item?.pattern || '替换规则')
    case 'themes':
      return String(item?.name || '阅读主题')
    case 'bookmarks':
      return String(item?.summary || item?.chapterTitle || '书签')
    case 'readingStats':
      return String(item?.bookTitle || item?.bookIdentity || '阅读统计')
  }
}

function getDescription(entity: SyncDiffEntity, item: any): string {
  switch (entity) {
    case 'books':
      return `${item?.author || '未知作者'} · ${item?.readingStatus || '未读'}`
    case 'chapters':
      return `第 ${numberOrZero(item?.orderIndex) + 1} 章`
    case 'rules':
      return item?.scope === 'book' ? '单书规则' : '全局规则'
    case 'themes':
      return '阅读主题'
    case 'bookmarks':
      return `${item?.bookTitle || '未知书籍'} · ${item?.chapterTitle || '未知章节'}`
    case 'readingStats':
      return `${item?.date || '未知日期'} · ${numberOrZero(item?.durationSeconds)} 秒`
  }
}

function fieldsForEntity(entity: SyncDiffEntity): string[] {
  switch (entity) {
    case 'books':
      return ['title', 'author', 'tags', 'series', 'seriesIndex', 'readingStatus', 'progressIndex', 'progressOffset', 'progressOffsetKind', 'currentChapterTitle', 'updatedAt']
    case 'chapters':
      return ['title', 'bookId', 'orderIndex', 'bodyTextSize']
    case 'rules':
      return ['pattern', 'replacement', 'scope', 'bookId', 'regex', 'active', 'updatedAt']
    case 'themes':
      return ['name', 'configJson', 'updatedAt']
    case 'bookmarks':
      return ['bookTitle', 'chapterTitle', 'chapterOffset', 'summary', 'updatedAt']
    case 'readingStats':
      return ['date', 'bookTitle', 'durationSeconds', 'charCount', 'updatedAt']
  }
}

function diffFields(entity: SyncDiffEntity, local: any, remote: any): SyncDiffField[] {
  const result: SyncDiffField[] = []
  for (const field of fieldsForEntity(entity)) {
    const localValue = local?.[field]
    const remoteValue = remote?.[field]
    if (stableJson(localValue) === stableJson(remoteValue)) continue
    result.push({
      field,
      local: safeString(localValue),
      remote: safeString(remoteValue),
    })
  }
  return result
}

function indexByKey(entity: SyncDiffEntity, items: any[]): Map<string, any> {
  const map = new Map<string, any>()
  for (const item of Array.isArray(items) ? items : []) {
    const key = getSyncItemKey(entity, item)
    if (!key) continue
    const existing = map.get(key)
    if (!existing || getUpdatedAt(entity, item) >= getUpdatedAt(entity, existing)) {
      map.set(key, item)
    }
  }
  return map
}

function positiveId(value: unknown): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function nextAvailableId(used: Set<number>, start: { value: number }): number {
  while (used.has(start.value) || start.value <= 0) start.value += 1
  const id = start.value
  used.add(id)
  start.value += 1
  return id
}

function maxEntityId(...groups: any[][]): number {
  let max = 0
  for (const group of groups) {
    for (const item of group || []) max = Math.max(max, positiveId(item?.id) || 0)
  }
  return max
}

/**
 * 将远端设备的数值主键映射到本地命名空间，同时保持书籍与章节、规则、书签的关联。
 * 正文路径保留远端原值，因为 ZIP 内路径本身就是跨设备资源定位符。
 */
export function remapRemoteSyncEntityIds(
  localEntities: Partial<SyncEntityPayloads>,
  remoteEntities: Partial<SyncEntityPayloads>,
): Partial<SyncEntityPayloads> {
  const localBooks = localEntities.books || []
  const remoteBooks = remoteEntities.books || []
  const localBookByKey = indexByKey('books', localBooks)
  const usedBookIds = new Set(localBooks.map((book) => positiveId(book?.id)).filter((id): id is number => id !== null))
  const nextBookId = { value: maxEntityId(localBooks, remoteBooks) + 1 }
  const remoteBookIdMap = new Map<number, number>()
  const assignedBookKeyIds = new Map<string, number>()

  const books = remoteBooks.map((book) => {
    const key = getSyncItemKey('books', book)
    const remoteId = positiveId(book?.id)
    const localMatch = localBookByKey.get(key)
    let mappedId = positiveId(localMatch?.id) || assignedBookKeyIds.get(key) || null
    if (!mappedId && remoteId && !usedBookIds.has(remoteId)) {
      mappedId = remoteId
      usedBookIds.add(mappedId)
    }
    if (!mappedId) mappedId = nextAvailableId(usedBookIds, nextBookId)
    if (key) assignedBookKeyIds.set(key, mappedId)
    if (remoteId) remoteBookIdMap.set(remoteId, mappedId)
    return { ...book, id: mappedId }
  })

  const localChapters = localEntities.chapters || []
  const remoteChapters = remoteEntities.chapters || []
  const localChapterByKey = indexByKey('chapters', localChapters)
  const usedChapterIds = new Set(localChapters.map((chapter) => positiveId(chapter?.id)).filter((id): id is number => id !== null))
  const nextChapterId = { value: maxEntityId(localChapters, remoteChapters) + 1 }
  const chapters = remoteChapters.map((chapter) => {
    const remoteBookId = positiveId(chapter?.bookId)
    const bookId = remoteBookId ? (remoteBookIdMap.get(remoteBookId) || remoteBookId) : numberOrZero(chapter?.bookId)
    const remapped = { ...chapter, bookId }
    const localMatch = localChapterByKey.get(getSyncItemKey('chapters', remapped))
    const remoteId = positiveId(chapter?.id)
    let mappedId = positiveId(localMatch?.id)
    if (!mappedId && remoteId && !usedChapterIds.has(remoteId)) {
      mappedId = remoteId
      usedChapterIds.add(mappedId)
    }
    if (!mappedId) mappedId = nextAvailableId(usedChapterIds, nextChapterId)
    return { ...remapped, id: mappedId }
  })

  const remapBookId = (value: unknown): number | null => {
    const id = positiveId(value)
    if (!id) return null
    return remoteBookIdMap.get(id) || id
  }

  const remapIdsByIdentity = (entity: 'rules' | 'themes' | 'bookmarks', remoteItems: any[]): any[] => {
    const localItems = localEntities[entity] || []
    const localByKey = indexByKey(entity, localItems)
    const usedIds = new Set(localItems.map((item) => positiveId(item?.id)).filter((id): id is number => id !== null))
    const nextId = { value: maxEntityId(localItems, remoteItems) + 1 }
    return remoteItems.map((rawItem) => {
      const item = entity === 'rules' || entity === 'bookmarks'
        ? { ...rawItem, bookId: remapBookId(rawItem?.bookId) }
        : { ...rawItem }
      const localMatch = localByKey.get(getSyncItemKey(entity, item))
      const remoteId = positiveId(rawItem?.id)
      let mappedId = positiveId(localMatch?.id)
      if (!mappedId && remoteId && !usedIds.has(remoteId)) {
        mappedId = remoteId
        usedIds.add(mappedId)
      }
      if (!mappedId) mappedId = nextAvailableId(usedIds, nextId)
      return { ...item, id: mappedId }
    })
  }

  return {
    ...remoteEntities,
    books,
    chapters,
    rules: remapIdsByIdentity('rules', remoteEntities.rules || []),
    themes: remapIdsByIdentity('themes', remoteEntities.themes || []),
    bookmarks: remapIdsByIdentity('bookmarks', remoteEntities.bookmarks || []),
    readingStats: (remoteEntities.readingStats || []).map((row) => ({ ...row })),
  }
}

export function buildSyncDiffPreview(
  localEntities: Partial<SyncEntityPayloads>,
  remoteEntities: Partial<SyncEntityPayloads>,
): SyncDiffPreview {
  const items: SyncDiffItem[] = []
  const summary: Record<SyncDiffStatus, number> = {
    local: 0,
    remote: 0,
    conflict: 0,
    unchanged: 0,
  }

  for (const entity of ENTITIES) {
    const localMap = indexByKey(entity, localEntities[entity] || [])
    const remoteMap = indexByKey(entity, remoteEntities[entity] || [])
    const keys = new Set([...localMap.keys(), ...remoteMap.keys()])

    for (const key of keys) {
      const local = localMap.get(key)
      const remote = remoteMap.get(key)
      let status: SyncDiffStatus
      if (local && remote) {
        status = stableJson(local) === stableJson(remote) ? 'unchanged' : 'conflict'
      } else {
        status = local ? 'local' : 'remote'
      }
      summary[status] += 1

      const source = remote || local
      items.push({
        id: `${entity}:${key}`,
        entity,
        key,
        status,
        title: getTitle(entity, source, key),
        description: getDescription(entity, source),
        localUpdatedAt: getUpdatedAt(entity, local),
        remoteUpdatedAt: getUpdatedAt(entity, remote),
        fields: status === 'conflict' ? diffFields(entity, local, remote) : [],
      })
    }
  }

  items.sort((a, b) => {
    const statusWeight: Record<SyncDiffStatus, number> = { conflict: 0, remote: 1, local: 2, unchanged: 3 }
    return statusWeight[a.status] - statusWeight[b.status]
      || a.entity.localeCompare(b.entity)
      || Math.max(b.localUpdatedAt, b.remoteUpdatedAt) - Math.max(a.localUpdatedAt, a.remoteUpdatedAt)
      || a.title.localeCompare(b.title, 'zh-CN')
  })

  return {
    generatedAt: Date.now(),
    summary,
    items,
  }
}

function chooseItem(local: any, remote: any, choice: SyncResolutionChoice): any | null {
  if (choice === 'local') return local ?? null
  if (choice === 'remote') return remote ?? null
  if (!local) return remote ?? null
  if (!remote) return local ?? null
  return getUpdatedAt('books', remote) > getUpdatedAt('books', local) ? remote : local
}

function chooseItemForEntity(entity: SyncDiffEntity, local: any, remote: any, choice: SyncResolutionChoice): any | null {
  if (choice !== 'merge') return chooseItem(local, remote, choice)
  if (!local) return remote ?? null
  if (!remote) return local ?? null
  return getUpdatedAt(entity, remote) > getUpdatedAt(entity, local) ? remote : local
}

export function applySyncDiffResolution(
  localEntities: Partial<SyncEntityPayloads>,
  remoteEntities: Partial<SyncEntityPayloads>,
  resolutions: SyncResolutionMap,
): SyncEntityPayloads {
  const result = {} as SyncEntityPayloads

  for (const entity of ENTITIES) {
    const localMap = indexByKey(entity, localEntities[entity] || [])
    const remoteMap = indexByKey(entity, remoteEntities[entity] || [])
    const keys = new Set([...localMap.keys(), ...remoteMap.keys()])
    const merged: any[] = []

    for (const key of keys) {
      const id = `${entity}:${key}`
      const local = localMap.get(key)
      const remote = remoteMap.get(key)
      const defaultChoice: SyncResolutionChoice = local && remote
        ? 'merge'
        : remote
          ? 'remote'
          : 'local'
      const chosen = chooseItemForEntity(entity, local, remote, resolutions[id] || defaultChoice)
      if (chosen) merged.push(chosen)
    }

    result[entity] = merged.sort((a, b) => {
      if (Number.isFinite(Number(a?.id)) || Number.isFinite(Number(b?.id))) {
        return numberOrZero(a?.id) - numberOrZero(b?.id)
      }
      return getSyncItemKey(entity, a).localeCompare(getSyncItemKey(entity, b), 'zh-CN')
    })
  }

  return result
}
