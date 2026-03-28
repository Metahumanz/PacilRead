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
    setAlwaysOnTop: (isTop: boolean) => ipcRenderer.invoke('win:setAlwaysOnTop', isTop)
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
    synthesize: (text: string, voice?: string, rate?: number) => ipcRenderer.invoke('tts:synthesize', { text, voice, rate })
  }
})
