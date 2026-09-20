import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

const expectedArchitectures = {
  arm64: 'arm64',
  x64: 'x86_64'
}

const requestedArchitecture = process.argv[2]
const expectedArchitecture = expectedArchitectures[requestedArchitecture]

if (!expectedArchitecture) {
  console.error('Usage: node scripts/verify-macos-build.mjs <arm64|x64>')
  process.exit(1)
}

const releaseDirectory = join(process.cwd(), 'release')

function findApp(directory) {
  if (!existsSync(directory)) return null

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory() && entry.name === 'PacilRead.app') return entryPath
    if (entry.isDirectory()) {
      const result = findApp(entryPath)
      if (result) return result
    }
  }

  return null
}

function findFiles(directory, extension) {
  if (!existsSync(directory)) return []

  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...findFiles(entryPath, extension))
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(entryPath)
    }
  }
  return files
}

function commandOutput(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function assertArchitecture(filePath, label) {
  const output = commandOutput('file', [filePath])
  if (!output.includes(expectedArchitecture)) {
    throw new Error(`${label} has unexpected architecture. Expected ${expectedArchitecture}; file output: ${output.trim()}`)
  }
  return output.trim()
}

const appPath = findApp(releaseDirectory)
if (!appPath) {
  console.error(`[mac verify] no PacilRead.app found under ${releaseDirectory}`)
  process.exit(1)
}

const executablePath = join(appPath, 'Contents', 'MacOS', 'PacilRead')
if (!existsSync(executablePath)) {
  console.error(`[mac verify] executable not found: ${executablePath}`)
  process.exit(1)
}

let extractionDirectory = null
try {
  const executableOutput = assertArchitecture(executablePath, 'PacilRead executable')

  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' })
  } catch {
    throw new Error(`code signature verification failed for ${appPath}`)
  }

  console.log(`[mac verify] app: ${appPath}`)
  console.log(`[mac verify] expected arch: ${requestedArchitecture}`)
  console.log(`[mac verify] executable architecture: OK (${executableOutput})`)
  console.log('[mac verify] code signature: OK')
  console.log('[mac verify] code signature details:')
  execFileSync('codesign', ['-dv', '--verbose=4', appPath], { stdio: 'inherit' })

  const resourcesDirectory = join(appPath, 'Contents', 'Resources')
  let nativeModules = findFiles(resourcesDirectory, '.node')

  if (nativeModules.length === 0) {
    const asarPath = join(resourcesDirectory, 'app.asar')
    if (existsSync(asarPath)) {
      extractionDirectory = mkdtempSync(join(tmpdir(), 'pacilread-asar-'))
      try {
        execFileSync('npx', ['--no-install', 'asar', 'extract', asarPath, extractionDirectory], { stdio: 'inherit' })
      } catch (error) {
        throw new Error(`could not inspect ${asarPath} with local asar: ${error.message}`)
      }
      nativeModules = findFiles(extractionDirectory, '.node')
    }
  }

  for (const nativeModule of nativeModules) {
    const output = assertArchitecture(nativeModule, `native module ${relative(appPath, nativeModule)}`)
    console.log(`[mac verify] native module: ${nativeModule} (${output})`)
  }

  console.log(`[mac verify] native modules checked: ${nativeModules.length}`)
  console.log('[mac verify] all checks passed')
} catch (error) {
  console.error(`[mac verify] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  if (extractionDirectory) rmSync(extractionDirectory, { recursive: true, force: true })
}
