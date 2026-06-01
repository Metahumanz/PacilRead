import { useSettings } from './useSettings'

const PROGRESS_CACHE_TTL_MS = 5 * 60 * 1000
const REMOTE_NEWER_GRACE_MS = 5000

export interface ProgressBook {
  title: string
  author: string | null
}

export interface LocalReadingProgress {
  progressIndex: number
  progressOffset: number
  lastReadAt: number
}

export interface RemoteReadingProgress {
  author: string
  durChapterIndex: number
  durChapterPos: number
  durChapterTime: number
  durChapterTitle: string
  name: string
}

export type DownloadProgressResult =
  | { status: 'disabled'; fromCache: false }
  | { status: 'missing'; fromCache: boolean }
  | { status: 'available'; payload: RemoteReadingProgress; fromCache: boolean }

type CachedDownloadProgress = Exclude<DownloadProgressResult, { status: 'disabled' }>

const progressDownloadCache = new Map<string, {
  expiresAt: number
  result: CachedDownloadProgress
}>()
const progressDownloadInFlight = new Map<string, Promise<CachedDownloadProgress>>()

function buildProgressBaseUrl(rawUrl: string, rawDir: string): string {
  let baseUrl = rawUrl.trim()
  if (baseUrl && !baseUrl.endsWith('/')) baseUrl += '/'

  let dir = rawDir.trim().replace(/^\/+/, '')
  if (dir && !dir.endsWith('/')) dir += '/'
  return `${baseUrl}${dir}`
}

function sanitizeProgressFilePart(value: string, fallback: string): string {
  return value.replace(/[\\/:\"*?<>|]/g, '_') || fallback
}

export function buildProgressFileName(book: ProgressBook): string {
  const title = sanitizeProgressFilePart(book.title || 'Unknown', 'Unknown')
  const rawAuthor = book.author?.trim() || '未知'
  const author = sanitizeProgressFilePart(rawAuthor, '未知')
  return `${title}_${author}.json`
}

function parseRemoteReadingProgress(raw: string): RemoteReadingProgress {
  const data = JSON.parse(raw) as Record<string, unknown>
  const numberOrZero = (value: unknown) => {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
  }

  return {
    author: String(data.author || ''),
    durChapterIndex: Math.max(0, Math.floor(numberOrZero(data.durChapterIndex))),
    durChapterPos: Math.max(0, Math.floor(numberOrZero(data.durChapterPos))),
    durChapterTime: Math.max(0, Math.floor(numberOrZero(data.durChapterTime))),
    durChapterTitle: String(data.durChapterTitle || ''),
    name: String(data.name || ''),
  }
}

export function shouldApplyRemoteProgress(
  remote: RemoteReadingProgress,
  local: LocalReadingProgress,
): boolean {
  if (remote.durChapterTime <= 0) return false
  const localEmpty = local.progressIndex === 0 && local.progressOffset === 0
  return remote.durChapterTime > local.lastReadAt + REMOTE_NEWER_GRACE_MS || localEmpty
}

export function useSync() {
  const {
    webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync
  } = useSettings()

  let uploadTimer: number | null = null

  const canDownloadProgressFromWebdav = () => Boolean(webdavSync.value && webdavUrl.value.trim())

  const getProgressRequestContext = (book: ProgressBook) => {
    const baseUrl = buildProgressBaseUrl(webdavUrl.value, webdavDir.value)
    const fileName = buildProgressFileName(book)
    return {
      auth: btoa(`${webdavUser.value}:${webdavPass.value}`),
      cacheKey: `${baseUrl}\n${webdavUser.value}\n${fileName}`,
      url: `${baseUrl}bookProgress/${encodeURIComponent(fileName)}`,
    }
  }

  const downloadProgressFromWebdav = async (book: ProgressBook): Promise<DownloadProgressResult> => {
    if (!canDownloadProgressFromWebdav()) {
      return { status: 'disabled', fromCache: false }
    }

    const context = getProgressRequestContext(book)
    const cached = progressDownloadCache.get(context.cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, fromCache: true }
    }
    if (cached) progressDownloadCache.delete(context.cacheKey)

    const pending = progressDownloadInFlight.get(context.cacheKey)
    if (pending) {
      return { ...(await pending), fromCache: true }
    }

    const request = (async (): Promise<CachedDownloadProgress> => {
      const response = await window.electronAPI.webdav.request({
        url: context.url,
        method: 'GET',
        headers: { Authorization: `Basic ${context.auth}` },
      })
      if (response.error) throw new Error(response.error)
      if (response.status === 404) return { status: 'missing', fromCache: false }
      if (!response.status || response.status < 200 || response.status >= 300) {
        throw new Error(`下载阅读进度失败 (HTTP ${response.status || '未知'})`)
      }
      if (!response.data) return { status: 'missing', fromCache: false }
      return {
        status: 'available',
        payload: parseRemoteReadingProgress(response.data),
        fromCache: false,
      }
    })()

    progressDownloadInFlight.set(context.cacheKey, request)
    try {
      const result = await request
      progressDownloadCache.set(context.cacheKey, {
        expiresAt: Date.now() + PROGRESS_CACHE_TTL_MS,
        result,
      })
      return result
    } finally {
      progressDownloadInFlight.delete(context.cacheKey)
    }
  }

  const getApplicableProgressFromWebdav = async (
    book: ProgressBook & LocalReadingProgress,
  ): Promise<RemoteReadingProgress | null> => {
    const result = await downloadProgressFromWebdav(book)
    if (result.status !== 'available') return null
    return shouldApplyRemoteProgress(result.payload, book) ? result.payload : null
  }

  const uploadProgressToWebdav = async (context: {
    bookId: number
    title: string
    author: string
    currentChapterIndex: number
    currentChapterTitle: string
    currentChapterBodyLength: number
    currentChapterOffset?: number
    currentPage: number
    totalPages: number
    pendingWebdavPos: number
  }) => {
    if (!webdavSync.value || !webdavUrl.value) return
    if (context.pendingWebdavPos >= 0) return

    if (uploadTimer) clearTimeout(uploadTimer)

    uploadTimer = window.setTimeout(async () => {
      try {
        const requestContext = getProgressRequestContext({
          title: context.title,
          author: context.author,
        })
        let author = context.author || '未知'
        if (!author.trim()) author = '未知'

        const length = context.currentChapterBodyLength || 0
        const charPos = context.currentChapterOffset !== undefined
          ? Math.max(0, Math.min(length, Math.floor(context.currentChapterOffset)))
          : context.totalPages > 0
          ? Math.floor(length * (context.currentPage / context.totalPages))
          : 0

        const data = {
          author,
          durChapterIndex: context.currentChapterIndex,
          durChapterPos: charPos,
          durChapterTime: Date.now(),
          durChapterTitle: context.currentChapterTitle || '',
          name: context.title || 'Unknown'
        }

        await window.electronAPI.webdav.request({
          url: requestContext.url,
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${requestContext.auth}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(data, null, 2)
        })
      } catch (e) {
        console.error('WebDAV upload err:', e)
      }
    }, 2000)
  }

  return {
    canDownloadProgressFromWebdav,
    downloadProgressFromWebdav,
    getApplicableProgressFromWebdav,
    uploadProgressToWebdav
  }
}
