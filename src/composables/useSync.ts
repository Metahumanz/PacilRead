import { useSettings } from './useSettings'

export function useSync() {
  const {
    webdavUrl, webdavDir, webdavUser, webdavPass, webdavSync
  } = useSettings()

  let uploadTimer: any = null

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

    uploadTimer = setTimeout(async () => {
      try {
        const auth = btoa(`${webdavUser.value}:${webdavPass.value}`)
        let author = context.author || '未知'
        if (!author.trim()) author = '未知'

        const safeName = context.title.replace(/[\\/:\"*?<>|]/g, '_') || 'Unknown'
        const safeAuthor = author.replace(/[\\/:\"*?<>|]/g, '_')
        const filename = `${safeName}_${safeAuthor}.json`

        const L = context.currentChapterBodyLength || 0
        const charPos = context.currentChapterOffset !== undefined
          ? Math.max(0, Math.min(L, Math.floor(context.currentChapterOffset)))
          : context.totalPages > 0
          ? Math.floor(L * (context.currentPage / context.totalPages))
          : 0

        const data = {
          author,
          durChapterIndex: context.currentChapterIndex,
          durChapterPos: charPos,
          durChapterTime: Date.now(),
          durChapterTitle: context.currentChapterTitle || '',
          name: context.title || 'Unknown'
        }

        let baseURL = webdavUrl.value
        if (webdavDir.value) {
          if (!baseURL.endsWith('/') && !webdavDir.value.startsWith('/')) baseURL += '/'
          baseURL += webdavDir.value
          if (!baseURL.endsWith('/')) baseURL += '/'
        }

        await window.electronAPI.webdav.request({
          url: baseURL + 'bookProgress/' + encodeURIComponent(filename),
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${auth}`,
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
    uploadProgressToWebdav
  }
}
