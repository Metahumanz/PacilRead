import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { findAllSearchMatches, normalizeSearchText } from '../src/utils/searchText'

const INDEX_VERSION = 1
const HASH_PROBES = 4

export interface SearchIndexChapter {
  id: number
  title: string
  orderIndex: number
  fingerprint: string
  text: string
}

export interface SearchIndexRule {
  id: number
  updatedAt?: number
  active: boolean
  regex: boolean
  pattern: string
  replacement: string
}

export interface BookSearchResult {
  chapterIndex: number
  chapterTitle: string
  snippet: string
  charOffset: number
}

interface SerializedBloom {
  bitSize: number
  bitsBase64: string
}

interface SerializedIndex {
  version: number
  fingerprint: string
  chapters: SerializedBloom[]
}

const hashPair = (value: string): [number, number] => {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = (second ^ (code + 0x9e3779b9 + ((second << 6) >>> 0) + (second >>> 2))) >>> 0
  }
  return [first, second | 1]
}

const bitIndex = (first: number, second: number, probe: number, bitSize: number) => (
  (first + Math.imul(probe, second)) >>> 0
) % bitSize

const buildBloom = (text: string): SerializedBloom => {
  const desiredBits = Math.max(1024, Math.min(8 * 1024 * 1024, text.length * 12))
  const bitSize = Math.ceil(desiredBits / 64) * 64
  const bytes = new Uint8Array(Math.ceil(bitSize / 8))
  for (let length = 1; length <= 3; length++) {
    for (let start = 0; start + length <= text.length; start++) {
      const [first, second] = hashPair(text.slice(start, start + length))
      for (let probe = 0; probe < HASH_PROBES; probe++) {
        const index = bitIndex(first, second, probe, bitSize)
        bytes[index >> 3] |= 1 << (index & 7)
      }
    }
  }
  return { bitSize, bitsBase64: Buffer.from(bytes).toString('base64') }
}

const bloomMightContain = (bloom: SerializedBloom, query: string): boolean => {
  const bytes = Buffer.from(bloom.bitsBase64, 'base64')
  const length = Math.min(3, query.length)
  for (let start = 0; start + length <= query.length; start++) {
    const [first, second] = hashPair(query.slice(start, start + length))
    for (let probe = 0; probe < HASH_PROBES; probe++) {
      const index = bitIndex(first, second, probe, bloom.bitSize)
      if ((bytes[index >> 3] & (1 << (index & 7))) === 0) return false
    }
  }
  return true
}

export function applySearchRules(text: string, rules: SearchIndexRule[]): string {
  let result = text
  for (const rule of rules) {
    if (!rule.active || !rule.pattern) continue
    try {
      const pattern = rule.regex
        ? new RegExp(rule.pattern, 'g')
        : new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      result = result.replace(pattern, rule.replacement || '')
    } catch {}
  }
  return result
}

export function searchIndexFingerprint(chapters: SearchIndexChapter[], rules: SearchIndexRule[]): string {
  const digest = createHash('sha256')
  for (const chapter of chapters) {
    digest.update(`${chapter.id}|${chapter.orderIndex}|${chapter.fingerprint}\u0000`)
  }
  for (const rule of rules) {
    digest.update(`${rule.id}|${rule.updatedAt || 0}|${rule.active}|${rule.regex}|${rule.pattern}|${rule.replacement}\u0000`)
  }
  return digest.digest('hex')
}

export class PersistentBookSearchIndex {
  constructor(private readonly directory: string) {}

  private file(bookId: number): string {
    return join(this.directory, `book_${bookId}.idx.json`)
  }

  private read(bookId: number, fingerprint: string, chapterCount: number): SerializedIndex | null {
    const file = this.file(bookId)
    if (!existsSync(file)) return null
    try {
      const value = JSON.parse(readFileSync(file, 'utf8')) as SerializedIndex
      if (value.version !== INDEX_VERSION || value.fingerprint !== fingerprint || value.chapters.length !== chapterCount) {
        return null
      }
      return value
    } catch {
      rmSync(file, { force: true })
      return null
    }
  }

  isReady(bookId: number, chapters: SearchIndexChapter[], rules: SearchIndexRule[]): boolean {
    return this.read(bookId, searchIndexFingerprint(chapters, rules), chapters.length) !== null
  }

  build(bookId: number, chapters: SearchIndexChapter[], rules: SearchIndexRule[]): SerializedIndex {
    mkdirSync(this.directory, { recursive: true })
    const fingerprint = searchIndexFingerprint(chapters, rules)
    const index: SerializedIndex = {
      version: INDEX_VERSION,
      fingerprint,
      chapters: chapters.map(chapter => buildBloom(normalizeSearchText(applySearchRules(chapter.text, rules)))),
    }
    const target = this.file(bookId)
    const temp = `${target}.tmp`
    writeFileSync(temp, JSON.stringify(index), 'utf8')
    renameSync(temp, target)
    return index
  }

  search(bookId: number, chapters: SearchIndexChapter[], rules: SearchIndexRule[], query: string): BookSearchResult[] {
    const normalizedQuery = normalizeSearchText(query.trim())
    if (!normalizedQuery) return []
    const fingerprint = searchIndexFingerprint(chapters, rules)
    const index = this.read(bookId, fingerprint, chapters.length) || this.build(bookId, chapters, rules)
    const results: BookSearchResult[] = []
    for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
      if (!bloomMightContain(index.chapters[chapterIndex], normalizedQuery)) continue
      const chapter = chapters[chapterIndex]
      const processed = applySearchRules(chapter.text, rules)
      for (const match of findAllSearchMatches(processed, normalizedQuery)) {
        const start = Math.max(0, match - 24)
        const end = Math.min(processed.length, match + normalizedQuery.length + 32)
        const body = processed.slice(start, end).replace(/\s+/g, ' ').trim()
        results.push({
          chapterIndex,
          chapterTitle: chapter.title,
          snippet: `${start > 0 ? '…' : ''}${body}${end < processed.length ? '…' : ''}`,
          charOffset: match,
        })
      }
    }
    return results
  }

  delete(bookId: number): void {
    rmSync(this.file(bookId), { force: true })
  }
}
