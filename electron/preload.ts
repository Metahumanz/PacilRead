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
  library: {
    importBook: (filePath: string) => ipcRenderer.invoke('library:importBook', filePath),
    deleteBook: (bookId: number) => ipcRenderer.invoke('library:deleteBook', bookId),
    getSize: () => ipcRenderer.invoke('library:getSize'),
    getBookChapters: (bookId: number) => ipcRenderer.invoke('library:getBookChapters', bookId),
    getBookIdsWithFileGzipChapters: () => ipcRenderer.invoke('library:getBookIdsWithFileGzipChapters'),
    createBookChapterTextZip: (bookId: number) => ipcRenderer.invoke('library:createBookChapterTextZip', bookId),
    extractBookChapterTextZip: (zipPath: string) => ipcRenderer.invoke('library:extractBookChapterTextZip', zipPath),
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
