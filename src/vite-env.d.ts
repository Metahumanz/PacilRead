/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

export interface ElectronAPI {
  data: {
    readEntity: (entityType: string) => Promise<any>
    writeEntity: (entityType: string, data: unknown) => Promise<void>
    hashFile: (entityType: string) => Promise<{ sha256: string | null; size: number }>
    getDataDir: () => Promise<string>
    isMigrated: () => Promise<boolean>
    writeAll: (entities: Record<string, unknown>) => Promise<void>
  }
  library: {
    importBook: (filePath: string) => Promise<{ bookId: number; chapterCount: number }>
    deleteBook: (bookId: number) => Promise<{ success: boolean }>
    getSize: () => Promise<{ sizeBytes: number; chapterTextBytes: number; jsonDataBytes: number; totalBytes: number }>
    getBookChapters: (bookId: number) => Promise<Array<{
      id: number
      title: string
      order_index: number
      body: string
      body_text: string
      body_text_storage: string
      body_text_missing: number
      body_text_fallback: string | null
    }>>
    getBookIdsWithFileGzipChapters: () => Promise<number[]>
    createBookChapterTextZip: (bookId: number) => Promise<string | null>
    extractBookChapterTextZip: (zipPath: string) => Promise<number>
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
    onFullScreen: (cb: (val: boolean) => void) => void
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
    getPath: (name: string) => Promise<string>
    quit: () => Promise<void>
    copyCover: (sourcePath: string) => Promise<{ success: boolean; filename?: string; error?: string }>
  }
  webdav: {
    request: (opts: { url: string; method: string; headers?: Record<string, string>; body?: string }) => Promise<{ status?: number; data?: string; error?: string }>
    uploadFile: (localPath: string, remoteUrl: string, auth: string) => Promise<{ success: boolean; status?: number; error?: string }>
    downloadFile: (remoteUrl: string, localPath: string, auth: string) => Promise<{ success: boolean; status?: number; error?: string }>
  }
  tts: {
    getEdgeVoices: () => Promise<any[]>
    synthesize: (text: string, voice?: string, rate?: number) => Promise<{ success: boolean; audioBuffer?: Uint8Array; error?: string }>
    startMimo: (text: string, apiKey: string, voice?: string) => Promise<void>
    stopMimo: () => Promise<void>
    onMimoChunk: (cb: (chunk: Uint8Array) => void) => () => void
    onMimoDone: (cb: () => void) => () => void
    onMimoError: (cb: (err: string) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
