import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadTsModule(relativePath) {
  const filename = resolve(rootDir, relativePath)
  const source = readFileSync(filename, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  })
  const module = { exports: {} }
  const sandbox = {
    module,
    exports: module.exports,
    require,
    console,
    Buffer,
    URL,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    process,
    btoa: globalThis.btoa,
  }
  vm.runInNewContext(outputText, sandbox, { filename })
  return module.exports
}

const plain = (value) => JSON.parse(JSON.stringify(value))

const webdav = loadTsModule('src/utils/webdav.ts')
assert.equal(webdav.buildWebdavBaseUrl('https://dav.example.com/root', 'Books'), 'https://dav.example.com/root/Books/')
assert.equal(webdav.buildPacilReadBaseUrl('https://dav.example.com/root/', ''), 'https://dav.example.com/root/PacilRead/')
assert.equal(webdav.sanitizeWebdavDirectorySegment('../desktop/settings'), 'desktopsettings')
assert.equal(webdav.buildProgressFileName({ title: 'A:B/C', author: '' }), 'A_B_C_未知.json')
assert.deepEqual(plain(webdav.extractHrefValues('<d:href>/a.txt</d:href><href>/b.txt</href>')), ['/a.txt', '/b.txt'])

const settingsSchema = loadTsModule('src/utils/settingsSchema.ts')
const boolDef = settingsSchema.boolSetting('enabled', false, 'ui')
assert.equal(settingsSchema.readSetting({ enabled: 'true' }, boolDef), true)
assert.equal(settingsSchema.serializeSetting(boolDef, false), 'false')
assert.equal(settingsSchema.clampBookshelfProgressPrefetchLimit('101'), 100)
assert.deepEqual(
  plain(settingsSchema.filterSettingsByScope({ a: '1', b: '2' }, [
    settingsSchema.stringSetting('a', '', 'ui'),
    settingsSchema.stringSetting('b', '', 'theme'),
  ], ['theme'])),
  { b: '2' },
)

const readingStats = loadTsModule('src/utils/readingStats.ts')
const splitRows = readingStats.splitRangeByDate(
  new Date(2026, 0, 1, 23, 59, 30).getTime(),
  new Date(2026, 0, 2, 0, 0, 45).getTime(),
)
assert.deepEqual(plain(splitRows), [
  { date: '2026-01-01', seconds: 30 },
  { date: '2026-01-02', seconds: 45 },
])

const pagination = loadTsModule('src/utils/pagination.ts')
const slices = [
  { startChar: 0, endChar: 10, bodyEndInSlice: 10 },
  { startChar: 10, endChar: 20, bodyEndInSlice: 20 },
  { startChar: 20, endChar: 30, bodyEndInSlice: 30 },
]
assert.equal(pagination.findPageForOffsetInSlices(slices, 15), 1)
assert.equal(pagination.findPageForOffsetInSlices(slices, 99), 2)
assert.equal(pagination.findPageForOffsetInSlices([], 5), 0)

const parsers = loadTsModule('electron/parsers.ts')
const chapters = parsers.splitTextIntoChapters('开头说明\n\n第一章：开始\n这里是正文\n\n第二章 继续\n更多正文')
assert.equal(chapters.length, 3)
assert.equal(chapters[0].title, '前言')
assert.equal(chapters[1].title, '第一章：开始')
assert.equal(chapters[2].title, '第二章 继续')

console.log('logic tests passed')
