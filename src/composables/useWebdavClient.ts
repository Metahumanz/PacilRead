import {
  buildBasicAuth,
  extractHrefValues,
  joinRemoteUrl,
  type WebdavAccount,
} from '../utils/webdav'

export interface WebdavClient {
  auth: string
  baseUrl: string
  remoteUrl: (path: string) => string
  request: (opts: { url: string; method: string; headers?: Record<string, string>; body?: string }) => Promise<{ status?: number; data?: string; error?: string }>
  putText: (path: string, body: string, contentType?: string) => Promise<boolean>
  getText: (path: string) => Promise<string | null>
  getJson: <T>(path: string) => Promise<T | null>
  delete: (path: string) => Promise<boolean>
  exists: (path: string) => Promise<boolean>
  ensureCollection: (urlOrPath: string) => Promise<void>
  listFiles: (dirUrlOrPath: string) => Promise<string[]>
  uploadFile: (localPath: string, path: string) => Promise<{ success: boolean; status?: number; error?: string }>
  downloadFile: (path: string, localPath: string) => Promise<{ success: boolean; status?: number; error?: string }>
}

function isAbsoluteRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function createWebdavClient(account: WebdavAccount & { baseUrl: string }): WebdavClient {
  const auth = buildBasicAuth(account.user, account.pass)
  const remoteUrl = (path: string) => isAbsoluteRemoteUrl(path)
    ? path
    : joinRemoteUrl(account.baseUrl, path)

  const request: WebdavClient['request'] = (opts) => window.electronAPI.webdav.request(opts)

  const withAuth = (headers: Record<string, string> = {}) => ({
    ...headers,
    Authorization: `Basic ${auth}`,
  })

  const putText = async (path: string, body: string, contentType?: string): Promise<boolean> => {
    const headers: Record<string, string> = {}
    if (contentType) headers['Content-Type'] = contentType
    try {
      const response = await request({
        url: remoteUrl(path),
        method: 'PUT',
        headers: withAuth(headers),
        body,
      })
      return !response.error && response.status ? response.status < 400 : false
    } catch { return false }
  }

  const getText = async (path: string): Promise<string | null> => {
    try {
      const response = await request({
        url: remoteUrl(path),
        method: 'GET',
        headers: withAuth(),
      })
      if (response.status === 200 && response.data) return response.data
      return null
    } catch { return null }
  }

  const getJson = async <T>(path: string): Promise<T | null> => {
    const data = await getText(path)
    if (!data) return null
    try { return JSON.parse(data) as T } catch { return null }
  }

  const deleteRemote = async (path: string): Promise<boolean> => {
    try {
      const response = await request({
        url: remoteUrl(path),
        method: 'DELETE',
        headers: withAuth(),
      })
      return !response.error
    } catch { return false }
  }

  const exists = async (path: string): Promise<boolean> => {
    try {
      const response = await request({
        url: remoteUrl(path),
        method: 'HEAD',
        headers: withAuth(),
      })
      return response.status === 200
    } catch { return false }
  }

  const ensureCollection = async (urlOrPath: string): Promise<void> => {
    const response = await request({
      url: remoteUrl(urlOrPath),
      method: 'MKCOL',
      headers: withAuth(),
    })
    if (response.error) throw new Error(response.error)
    if (response.status && ![200, 201, 301, 302, 405].includes(response.status)) {
      throw new Error(`MKCOL ${remoteUrl(urlOrPath)} 失败 (HTTP ${response.status})`)
    }
  }

  const listFiles = async (dirUrlOrPath: string): Promise<string[]> => {
    const dirUrl = remoteUrl(dirUrlOrPath)
    const response = await request({
      url: dirUrl,
      method: 'PROPFIND',
      headers: withAuth({ Depth: '1' }),
    })
    if (response.error) throw new Error(response.error)
    if (response.status === 404) return []
    if (!response.status || response.status < 200 || response.status >= 300) {
      throw new Error(`列出云端目录失败 (HTTP ${response.status})`)
    }
    const files = extractHrefValues(response.data || '')
      .map((href) => {
        try { return new URL(href, dirUrl).toString() } catch (_) { return '' }
      })
      .filter(Boolean)
      .filter((url) => url !== dirUrl && !url.endsWith('/'))
    return Array.from(new Set(files))
  }

  return {
    auth,
    baseUrl: account.baseUrl,
    remoteUrl,
    request,
    putText,
    getText,
    getJson,
    delete: deleteRemote,
    exists,
    ensureCollection,
    listFiles,
    uploadFile: (localPath, path) => window.electronAPI.webdav.uploadFile(localPath, remoteUrl(path), auth),
    downloadFile: (path, localPath) => window.electronAPI.webdav.downloadFile(remoteUrl(path), localPath, auth),
  }
}
