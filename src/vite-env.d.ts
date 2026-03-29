/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

export interface ElectronAPI {
  db: {
    query: (sql: string, params?: any[]) => Promise<any>
    importBook: (filePath: string) => Promise<{ bookId: number; chapterCount: number }>
  }
  dialog: {
    openFile: () => Promise<string | null>
    openImage: () => Promise<string | null>
  }
  shell: {
    openPath: (path: string) => Promise<void>
  }
  win: {
    setAspectRatio: (ratio: number) => Promise<void>
    setFullScreen: (isFull: boolean) => Promise<void>
    setControlsVisible: (visible: boolean) => Promise<void>
    setAlwaysOnTop: (isTop: boolean) => Promise<void>
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<void>
    close: () => Promise<void>
    getIsMaximized: () => Promise<boolean>
    onMaximized: (cb: (val: boolean) => void) => void
  }
  font: {
    getSystemFonts: () => Promise<string[]>
  }
  updater: {
    check: () => Promise<boolean>
    download: () => Promise<boolean>
    install: () => Promise<void>
    installSilent: () => Promise<void>
    onStatus: (cb: (data: { status: string; version?: string; percent?: number; message?: string }) => void) => void
  }
  app: {
    getVersion: () => Promise<string>
    quit: () => Promise<void>
  }
  webdav: {
    request: (opts: { url: string; method: string; headers?: Record<string, string>; body?: string }) => Promise<{ status?: number; data?: string; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
