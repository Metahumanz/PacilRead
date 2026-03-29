import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    query: (sql: string, params?: any[]) => ipcRenderer.invoke('db:query', sql, params),
    importBook: (filePath: string) => ipcRenderer.invoke('db:importBook', filePath)
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
    quit: () => ipcRenderer.invoke('app:quit')
  },
  webdav: {
    request: (opts: any) => ipcRenderer.invoke('webdav:request', opts)
  },
  tts: {
    getEdgeVoices: () => ipcRenderer.invoke('tts:getEdgeVoices'),
    synthesize: (text: string, voice?: string, rate?: number) => ipcRenderer.invoke('tts:synthesize', { text, voice, rate }),
    startMimo: (text: string, apiKey: string) => ipcRenderer.invoke('tts:start-mimo', { text, apiKey }),
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
