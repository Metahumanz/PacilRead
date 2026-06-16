import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { platform } from 'node:os'

const releaseDir = resolve(process.cwd(), 'release')
const installerExtensions = ['.exe', '.msi', '.dmg', '.AppImage', '.deb', '.rpm']

function findLatestInstaller() {
  if (!existsSync(releaseDir)) return null

  return readdirSync(releaseDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const filePath = join(releaseDir, entry.name)
      const extension = installerExtensions.find(ext => entry.name.endsWith(ext))
      return {
        filePath,
        extension,
        mtimeMs: statSync(filePath).mtimeMs,
      }
    })
    .filter(item => item.extension)
    .sort((a, b) => {
      const extensionDiff = installerExtensions.indexOf(a.extension) - installerExtensions.indexOf(b.extension)
      return extensionDiff || b.mtimeMs - a.mtimeMs
    })[0]?.filePath ?? null
}

function openPath(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
}

try {
  const installerPath = findLatestInstaller()
  if (platform() === 'win32') {
    if (installerPath) {
      console.log(`Opening installer in Explorer: ${installerPath}`)
      openPath('explorer.exe', [`/select,${installerPath}`])
    } else {
      console.log(`No installer found. Opening release folder: ${releaseDir}`)
      openPath('explorer.exe', [releaseDir])
    }
  } else if (platform() === 'darwin') {
    openPath('open', [installerPath || releaseDir])
  } else {
    openPath('xdg-open', [installerPath || releaseDir])
  }
} catch (error) {
  console.warn(`Could not open release installer: ${error instanceof Error ? error.message : String(error)}`)
}
