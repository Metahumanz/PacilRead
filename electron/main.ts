import { app, BrowserWindow, dialog, screen } from 'electron'
import { existsSync, rmSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { createWindow, getMainWindow, notifyDisplayRefreshRate, saveBounds, setupAutoUpdater } from './appWindow'
import { initializeJsonStore } from './libraryService'
import { registerIpcHandlers } from './ipcHandlers'

registerIpcHandlers()

// Requirement 1: Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow()
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(async () => {
  createWindow()
  screen.on('display-added', () => notifyDisplayRefreshRate(true))
  screen.on('display-removed', () => notifyDisplayRefreshRate(true))
  screen.on('display-metrics-changed', () => notifyDisplayRefreshRate(true))
  try {
    initializeJsonStore()
    console.log('JSON data store initialized successfully')
  } catch (error) {
    console.error('JSON data store init failed:', String(error))
    dialog.showErrorBox('数据初始化失败', String(error))
  }
  setupAutoUpdater()

  try {
    const updaterCacheDirs = [
      join(app.getPath('userData'), '../pacil-read-updater'),
      join(app.getPath('userData'), '../ele-win-reader-updater')
    ]
    for (const dir of updaterCacheDirs) {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true })
        console.log('Cleaned up old updater cache:', dir)
      }
    }
  } catch (e) { console.error('Failed to clean updater cache:', e) }

  if (!is.dev) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  saveBounds()
  if (process.platform !== 'darwin') app.quit()
})
