export const PACILREAD_ROOT_DIR = 'PacilRead'
export const DEFAULT_DESKTOP_SETTINGS_DIR = 'desktop-settings'

export interface WebdavAccount {
  url: string
  dir: string
  user: string
  pass: string
}

export function buildBasicAuth(user: string, pass: string): string {
  return btoa(`${user}:${pass}`)
}

export function normalizeWebdavDirectory(rawDir: string): string {
  let dir = rawDir.trim().replace(/^\/+/, '')
  if (dir && !dir.endsWith('/')) dir += '/'
  return dir
}

export function buildWebdavBaseUrl(rawUrl: string, rawDir: string): string {
  let baseUrl = rawUrl.trim()
  if (baseUrl && !baseUrl.endsWith('/')) baseUrl += '/'
  return `${baseUrl}${normalizeWebdavDirectory(rawDir)}`
}

export function buildPacilReadBaseUrl(rawUrl: string, rawDir: string): string {
  const baseUrl = buildWebdavBaseUrl(rawUrl, rawDir)
  return rawDir.trim() ? baseUrl : `${baseUrl}${PACILREAD_ROOT_DIR}/`
}

export function buildProgressBaseUrl(rawUrl: string, rawDir: string): string {
  return buildWebdavBaseUrl(rawUrl, rawDir)
}

export function sanitizeWebdavDirectorySegment(value: string): string {
  const sanitized = value.trim().replace(/[\\/]+/g, '').replace(/\.+/g, '')
  return sanitized || DEFAULT_DESKTOP_SETTINGS_DIR
}

export function sanitizeRemoteFileName(input: string): string {
  const sanitized = input.replace(/[\\/:*?"<>|]+/g, '_').trim()
  return sanitized || `file-${Date.now()}`
}

export function sanitizeProgressFilePart(value: string, fallback: string): string {
  return value.replace(/[\\/:\"*?<>|]/g, '_') || fallback
}

export function buildProgressFileName(book: { title: string; author: string | null }): string {
  const title = sanitizeProgressFilePart(book.title || 'Unknown', 'Unknown')
  const rawAuthor = book.author?.trim() || '未知'
  const author = sanitizeProgressFilePart(rawAuthor, '未知')
  return `${title}_${author}.json`
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

export function isLocalFileUrl(value: string | undefined): boolean {
  return typeof value === 'string' && value.startsWith('file:///')
}

export function fileUrlToLocalPath(fileUrl: string): string | null {
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

export function localPathToFileUrl(localPath: string): string {
  return `file:///${localPath.replace(/\\/g, '/')}`
}

export function joinRemoteUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${base}${path.replace(/^\/+/, '')}`
}
