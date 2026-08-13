import { app, BrowserWindow, dialog, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { createWindow, getMainWindow, notifyDisplayRefreshRate, saveBounds, setupAutoUpdater } from './appWindow'
import { initializeJsonStore } from './libraryService'
import { registerIpcHandlers } from './ipcHandlers'
import { isPortableBuild } from './runtime'

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
  if (!isPortableBuild()) setupAutoUpdater()

  if (!is.dev && !isPortableBuild()) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000)
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  saveBounds()
  if (process.platform !== 'darwin') app.quit()
})
