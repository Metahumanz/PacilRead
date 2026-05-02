import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  data: {
    readEntity: (entityType: string) => ipcRenderer.invoke('data:readEntity', entityType),
    writeEntity: (entityType: string, data: unknown) => ipcRenderer.invoke('data:writeEntity', entityType, data),
    hashFile: (entityType: string) => ipcRenderer.invoke('data:hashFile', entityType),
    getDataDir: () => ipcRenderer.invoke('data:getDataDir'),
    isMigrated: () => ipcRenderer.invoke('data:isMigrated'),
    writeAll: (entities: Record<string, unknown>) => ipcRenderer.invoke('data:writeAll', entities),
  },
  db: {
    query: (sql: string, params?: any[]) => ipcRenderer.invoke('db:query', sql, params),
    importBook: (filePath: string) => ipcRenderer.invoke('db:importBook', filePath),
    export: () => ipcRenderer.invoke('db:export'),
    exportLite: () => ipcRenderer.invoke('db:exportLite'),
    importFromFile: (filePath: string) => ipcRenderer.invoke('db:importFromFile', filePath),
    importLiteFromFile: (filePath: string) => ipcRenderer.invoke('db:importLiteFromFile', filePath),
    getSize: () => ipcRenderer.invoke('db:getSize'),
    getBookChapters: (bookId: number) => ipcRenderer.invoke('db:getBookChapters', bookId),
    optimizeStorage: () => ipcRenderer.invoke('db:optimizeStorage'),
    deleteBook: (bookId: number) => ipcRenderer.invoke('db:deleteBook', bookId),
    listChapterTextFiles: () => ipcRenderer.invoke('db:listChapterTextFiles'),
    getRequiredChapterTextFiles: () => ipcRenderer.invoke('db:getRequiredChapterTextFiles'),
    getMissingChapterTextFiles: () => ipcRenderer.invoke('db:getMissingChapterTextFiles'),
    getBookIdsWithFileGzipChapters: () => ipcRenderer.invoke('db:getBookIdsWithFileGzipChapters'),
    createBookChapterTextZip: (bookId: number) => ipcRenderer.invoke('db:createBookChapterTextZip', bookId),
    extractBookChapterTextZip: (zipPath: string) => ipcRenderer.invoke('db:extractBookChapterTextZip', zipPath),
    checkHealth: () => ipcRenderer.invoke('db:checkHealth'),
    hasPendingMaintenance: () => ipcRenderer.invoke('db:hasPendingMaintenance'),
    getMaintenanceStatus: () => ipcRenderer.invoke('db:getMaintenanceStatus'),
    onOptimizeProgress: (cb: (data: { step: number; total: number; message: string }) => void) => {
      const listener = (_: any, data: any) => cb(data)
      ipcRenderer.on('db:optimize-progress', listener)
      return () => ipcRenderer.removeListener('db:optimize-progress', listener)
    },
    onHealthWarning: (cb: (message: string) => void) => {
      const listener = (_: any, message: string) => cb(message)
      ipcRenderer.on('db:health-warning', listener)
      return () => ipcRenderer.removeListener('db:health-warning', listener)
    }
  },
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openImage: () => ipcRenderer.invoke('dialog:openImage')
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path)
  },
  win: {
    setAspectRatio: (ratio: number) => ipcRenderer.invoke('win:setAspectRatio', ratio),
    setControlsVisible: (visible: boolean) => ipcRenderer.invoke('win:setControlsVisible', visible),
    setAlwaysOnTop: (isTop: boolean) => ipcRenderer.invoke('win:setAlwaysOnTop', isTop),
    setFullScreen: (isFull: boolean) => ipcRenderer.invoke('win:setFullScreen', isFull),
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    getIsMaximized: () => ipcRenderer.invoke('win:getIsMaximized'),
    onMaximized: (cb: (val: boolean) => void) => {
      ipcRenderer.on('win:isMaximized', (_, val) => cb(val))
    },
    onFullScreen: (cb: (val: boolean) => void) => {
      ipcRenderer.on('win:isFullScreen', (_, val) => cb(val))
    }
  },
  font: {
    getSystemFonts: () => ipcRenderer.invoke('font:getSystemFonts')
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    installSilent: () => ipcRenderer.invoke('updater:install', true),
    onStatus: (cb: (data: any) => void) => {
      ipcRenderer.on('updater:status', (_, data) => cb(data))
    }
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),
    quit: () => ipcRenderer.invoke('app:quit'),
    copyCover: (sourcePath: string) => ipcRenderer.invoke('fs:copyCover', sourcePath),
  },
  webdav: {
    request: (opts: any) => ipcRenderer.invoke('webdav:request', opts),
    uploadFile: (localPath: string, remoteUrl: string, auth: string) => ipcRenderer.invoke('webdav:uploadFile', localPath, remoteUrl, auth),
    downloadFile: (remoteUrl: string, localPath: string, auth: string) => ipcRenderer.invoke('webdav:downloadFile', remoteUrl, localPath, auth)
  },
  tts: {
    getEdgeVoices: () => ipcRenderer.invoke('tts:getEdgeVoices'),
    synthesize: (text: string, voice?: string, rate?: number) => ipcRenderer.invoke('tts:synthesize', { text, voice, rate }),
    startMimo: (text: string, apiKey: string, voice?: string) => ipcRenderer.invoke('tts:start-mimo', { text, apiKey, voice }),
    stopMimo: () => ipcRenderer.invoke('tts:stop-mimo'),
    onMimoChunk: (cb: (chunk: Uint8Array) => void) => {
      const listener = (_: any, chunk: Uint8Array) => cb(chunk)
      ipcRenderer.on('tts:mimo-chunk', listener)
      return () => ipcRenderer.removeListener('tts:mimo-chunk', listener)
    },
    onMimoDone: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('tts:mimo-done', listener)
      return () => ipcRenderer.removeListener('tts:mimo-done', listener)
    },
    onMimoError: (cb: (err: string) => void) => {
      const listener = (_: any, err: string) => cb(err)
      ipcRenderer.on('tts:mimo-error', listener)
      return () => ipcRenderer.removeListener('tts:mimo-error', listener)
    }
  }
})
