import { app } from 'electron'
import { extname, isAbsolute, relative, resolve } from 'path'

const MAX_IPC_TEXT_BODY_BYTES = 64 * 1024 * 1024
const MAX_IPC_DATA_URL_BYTES = 32 * 1024 * 1024
const ALLOWED_WEBDAV_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'MKCOL', 'PROPFIND'])
const ALLOWED_WEBDAV_HEADERS = new Set([
  'accept',
  'authorization',
  'content-type',
  'depth',
  'destination',
  'if-match',
  'if-none-match',
  'overwrite',
])
const ALLOWED_APP_PATH_NAMES = new Set(['userData'])
export const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'])
export const ALLOWED_BOOK_EXTENSIONS = new Set(['.txt', '.epub', '.pdf'])

function pathKey(filePath: string): string {
  const resolved = resolve(String(filePath || ''))
  return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved
}

export function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new Error(`${label} 无效`)
  }
  return value
}

const userSelectedLocalPaths = new Set<string>()

export function rememberUserSelectedPath(filePath: string | null | undefined): void {
  if (!filePath) return
  userSelectedLocalPaths.add(pathKey(filePath))
}

function isPathInside(targetPath: string, rootPath: string): boolean {
  const target = resolve(targetPath)
  const root = resolve(rootPath)
  const rel = relative(root, target)
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

function isUserSelectedPath(filePath: string): boolean {
  return userSelectedLocalPaths.has(pathKey(filePath))
}

function isAppManagedPath(filePath: string): boolean {
  const target = assertNonEmptyString(filePath, '本地路径')
  return isPathInside(target, app.getPath('userData')) || isPathInside(target, app.getPath('temp'))
}

export function assertAllowedLocalReadPath(filePath: unknown): string {
  const target = assertNonEmptyString(filePath, '本地读取路径')
  if (!isAppManagedPath(target) && !isUserSelectedPath(target)) {
    throw new Error('拒绝读取未授权的本地文件')
  }
  return target
}

export function assertAllowedLocalWritePath(filePath: unknown): string {
  const target = assertNonEmptyString(filePath, '本地写入路径')
  if (!isAppManagedPath(target)) {
    throw new Error('拒绝写入应用数据目录以外的本地路径')
  }
  return target
}

export function assertFileExtension(filePath: string, allowed: Set<string>, label: string): void {
  const ext = extname(filePath).toLocaleLowerCase()
  if (!allowed.has(ext)) throw new Error(`${label} 类型不支持: ${ext || 'unknown'}`)
}

export function assertHttpUrl(value: unknown, label = 'URL'): string {
  const raw = assertNonEmptyString(value, label).trim()
  if (raw.length > 4096) throw new Error(`${label} 过长`)
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`${label} 无效`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} 仅支持 HTTP/HTTPS`)
  }
  return parsed.toString()
}

export function normalizeWebdavMethod(value: unknown): string {
  const method = assertNonEmptyString(value, 'WebDAV 方法').toUpperCase()
  if (!ALLOWED_WEBDAV_METHODS.has(method)) {
    throw new Error(`不支持的 WebDAV 方法: ${method}`)
  }
  return method
}

export function normalizeIpcHeaders(headers: unknown): Record<string, string> {
  if (headers === undefined || headers === null) return {}
  if (typeof headers !== 'object' || Array.isArray(headers)) throw new Error('HTTP headers 无效')
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    const normalizedKey = key.toLocaleLowerCase()
    if (!ALLOWED_WEBDAV_HEADERS.has(normalizedKey)) continue
    const text = String(value ?? '')
    if (/[\r\n]/.test(key) || /[\r\n]/.test(text)) throw new Error('HTTP header 包含非法字符')
    if (text.length > 8192) throw new Error(`HTTP header 过长: ${key}`)
    result[key] = text
  }
  return result
}

export function normalizeOptionalIpcBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined
  const text = String(body)
  if (Buffer.byteLength(text, 'utf8') > MAX_IPC_TEXT_BODY_BYTES) {
    throw new Error('请求正文过大')
  }
  return text
}

export function assertBasicAuthToken(value: unknown): string {
  const auth = assertNonEmptyString(value, '认证信息').trim()
  if (auth.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(auth)) {
    throw new Error('认证信息无效')
  }
  return auth
}

export function assertAllowedAppPathName(value: unknown): Parameters<typeof app.getPath>[0] {
  const name = assertNonEmptyString(value, '应用路径名称')
  if (!ALLOWED_APP_PATH_NAMES.has(name)) throw new Error(`不允许读取应用路径: ${name}`)
  return name as Parameters<typeof app.getPath>[0]
}

export function assertPngDataUrl(dataUrl: unknown): string {
  const value = assertNonEmptyString(dataUrl, '图片数据')
  const prefix = 'data:image/png;base64,'
  if (!value.startsWith(prefix)) throw new Error('无效的 PNG 图片数据')
  if (Buffer.byteLength(value, 'utf8') > MAX_IPC_DATA_URL_BYTES) throw new Error('PNG 图片数据过大')
  return value
}
