import * as fs from 'fs'
import * as iconv from 'iconv-lite'
import * as jschardet from 'jschardet'
import AdmZip from 'adm-zip'
import { dirname, resolve } from 'path'
import { PDFParse } from 'pdf-parse'

export interface Chapter {
  title: string
  body: string
  bodyText: string
  bodyHtml: string
  orderIndex: number
}

export interface EpubParseResult {
  chapters: Chapter[]
  coverBuffer?: Buffer
  coverExtension?: string
}

export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

function linesToHtml(text: string): string {
  return text
    .split(/\n/)
    .filter(l => l.trim())
    .map(l => `<p>${l.trim()}</p>`)
    .join('\n')
}

export function splitTextIntoChapters(content: string): Chapter[] {
  const rules = [
    // "第xx章/节/卷/回/部/篇/季" or "卷xx" — require a separator before any title text
    // Matches: "第一回"  "第一回 风云再起"  "第一回——起源"  "第一回：风起"
    // Rejects: "第一回看到这种景象" (no separator after keyword, likely body text)
    /^[ \t　]{0,8}(?:序章|楔子|引子|番外|第\s{0,4}[0-9一二三四五六七八九十百千万零两]+?\s{0,4}(?:章|节(?!课)|卷|回|部|篇|季)|卷\s{0,4}[0-9一二三四五六七八九十百千万零两]+?)(?:[\s:：;；\-—─━~·、,.，。　]+.{0,30})?$/gm,
    /^[ \t　]{0,4}\d{1,5}[:：,.， 、_—\-].{1,30}$/gm,
    /^[ \t　]*[【〔〖「『〈［\[](?:第|[Cc]hapter).*?[章节].{0,20}$/gm
  ]

  let bestMatches: { index: number; title: string }[] = []

  for (const rule of rules) {
    const matches: { index: number; title: string }[] = []
    let match: RegExpExecArray | null
    rule.lastIndex = 0
    while ((match = rule.exec(content)) !== null) {
      matches.push({
        index: match.index,
        title: match[0].trim()
      })
    }
    if (matches.length > bestMatches.length) {
      bestMatches = matches
    }
  }

  if (bestMatches.length === 0) {
    return [{
      title: '全文',
      body: linesToHtml(content),
      bodyText: content.trim(),
      bodyHtml: '',
      orderIndex: 0
    }]
  }

  const chapters: Chapter[] = []
  let lastIndex = 0

  for (let i = 0; i < bestMatches.length; i++) {
    const { index, title } = bestMatches[i]
    
    if (i === 0 && index > 0) {
      const chunk = content.slice(0, index).trim()
      if (chunk.length > 0) {
        chapters.push({
          title: '前言',
          body: linesToHtml(chunk),
          bodyText: chunk,
          bodyHtml: '',
          orderIndex: chapters.length
        })
      }
    }

    const nextIndex = i + 1 < bestMatches.length ? bestMatches[i + 1].index : content.length

    const rawText = content.slice(index, nextIndex).replace(title, '').trim()
    chapters.push({
      title: title,
      body: linesToHtml(rawText),
      bodyText: rawText,
      bodyHtml: '',
      orderIndex: chapters.length
    })

    lastIndex = index
  }

  return chapters
}

export function parseTxt(filePath: string): Chapter[] {
  const buffer = fs.readFileSync(filePath)

  const detected = jschardet.detect(buffer)
  const encoding = detected.encoding || 'UTF-8'

  let content: string
  try {
    content = iconv.decode(buffer, encoding)
  } catch {
    content = iconv.decode(buffer, 'GB18030')
  }

  return splitTextIntoChapters(content)
}

export async function parsePdf(filePath: string): Promise<Chapter[]> {
  const dataBuffer = fs.readFileSync(filePath)
  const parser = new PDFParse(new Uint8Array(dataBuffer))
  const data = await parser.getText()
  
  // pdf-parse text is often messy, clean redundant spaces
  const cleanContent = data.text.replace(/\r/g, '').replace(/([^\n])\n([^\n])/g, '$1$2')
  
  return splitTextIntoChapters(cleanContent)
}

// ---- EPUB parser using adm-zip (no browser deps) ----

function extractBodyContent(html: string): string {
  // Extract content inside <body>...</body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) return bodyMatch[1].trim()
  return html
}

function extractTitle(html: string): string {
  // Try <title>, then <h1>, then <h2>, then <h3>
  for (const tag of ['title', 'h1', 'h2', 'h3']) {
    const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    if (m) {
      const t = stripHtmlTags(m[1]).trim()
      if (t) return t
    }
  }
  return ''
}

function findEpubCover(
  zip: AdmZip,
  opfXml: string,
  manifest: Map<string, string>,
  rootDir: string
): { buffer: Buffer; extension: string } | null {
  const entries = zip.getEntries()
  const coverImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']
  let coverId: string | null = null

  // Strategy 1: <meta name="cover" content="cover-image-id"/>
  const metaCoverMatch = opfXml.match(/<meta\s+[^>]*name="cover"[^>]*content="([^"]+)"[^>]*\/?\s*>/i)
  if (metaCoverMatch) {
    coverId = metaCoverMatch[1]
  }

  // Strategy 2: <guide> <reference type="cover" href="..."/>
  if (!coverId) {
    const guideMatch = opfXml.match(/<reference\s+[^>]*type="cover"[^>]*href="([^"]+)"[^>]*\/?\s*>/i)
    if (guideMatch) {
      const href = guideMatch[1]
      // Find matching manifest item by href
      for (const [id, itemHref] of manifest) {
        if (itemHref === href || itemHref.endsWith(href)) {
          coverId = id
          break
        }
      }
    }
  }

  // Strategy 3: manifest item id containing "cover" (case-insensitive), with image media-type
  if (!coverId) {
    for (const [id, href] of manifest) {
      if (id.toLowerCase().includes('cover') && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(href)) {
        coverId = id
        break
      }
    }
  }

  // Strategy 4: first image in manifest
  if (!coverId) {
    for (const [id, href] of manifest) {
      if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(href)) {
        coverId = id
        break
      }
    }
  }

  if (!coverId) return null

  const coverHref = manifest.get(coverId)
  if (!coverHref) return null

  const coverPath = rootDir !== '.' ? `${rootDir}/${coverHref}` : coverHref
  const coverEntry = entries.find(e => e.entryName === coverPath || e.entryName === decodeURIComponent(coverPath))
  if (!coverEntry) return null

  const extMatch = coverPath.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)
  const extension = extMatch ? extMatch[1].toLowerCase() : 'jpg'

  return { buffer: coverEntry.getData(), extension }
}

export async function parseEpub(filePath: string): Promise<EpubParseResult> {
  const zip = new AdmZip(filePath)
  const entries = zip.getEntries()

  // 1. Find container.xml -> rootfile path
  const containerEntry = entries.find(e => e.entryName.toLowerCase() === 'meta-inf/container.xml')
  if (!containerEntry) throw new Error('Invalid EPUB: no META-INF/container.xml')

  const containerXml = containerEntry.getData().toString('utf8')
  const rootFileMatch = containerXml.match(/full-path="([^"]+)"/)
  if (!rootFileMatch) throw new Error('Invalid EPUB: no rootfile path in container.xml')

  const rootFilePath = rootFileMatch[1]
  const rootDir = dirname(rootFilePath)

  // 2. Read content.opf (root file)
  const opfEntry = entries.find(e => e.entryName === rootFilePath)
  if (!opfEntry) throw new Error(`Invalid EPUB: rootfile ${rootFilePath} not found`)

  const opfXml = opfEntry.getData().toString('utf8')

  // 3. Parse manifest: <item id="..." href="..." media-type="..." />
  const manifest: Map<string, string> = new Map()
  const itemRegex = /<item\s+([^>]*?)\/?\s*>/gi
  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    const attrs = itemMatch[1]
    const idM = attrs.match(/id="([^"]+)"/)
    const hrefM = attrs.match(/href="([^"]+)"/)
    if (idM && hrefM) {
      manifest.set(idM[1], hrefM[1])
    }
  }

  // 4. Extract cover image
  const coverData = findEpubCover(zip, opfXml, manifest, rootDir)

  // 5. Parse spine: <itemref idref="..." />
  const spineIds: string[] = []
  const spineSection = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i)
  if (spineSection) {
    const itemrefRegex = /idref="([^"]+)"/g
    let spineMatch: RegExpExecArray | null
    while ((spineMatch = itemrefRegex.exec(spineSection[1])) !== null) {
      spineIds.push(spineMatch[1])
    }
  }

  // 6. Parse TOC for titles (try toc.ncx)
  const tocTitles: Map<string, string> = new Map()
  // Find NCX file from manifest
  const ncxId = Array.from(manifest.entries()).find(([, href]) => href.endsWith('.ncx'))?.[0]
  if (ncxId) {
    const ncxHref = manifest.get(ncxId)!
    const ncxPath = rootDir !== '.' ? `${rootDir}/${ncxHref}` : ncxHref
    const ncxEntry = entries.find(e => e.entryName === ncxPath)
    if (ncxEntry) {
      const ncxXml = ncxEntry.getData().toString('utf8')
      // Parse navPoints: <navPoint> <navLabel><text>Title</text></navLabel> <content src="file.xhtml"/> </navPoint>
      const navPointRegex = /<navPoint[^>]*>[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\s+src="([^"]+)"[\s\S]*?<\/navPoint>/gi
      let navMatch: RegExpExecArray | null
      while ((navMatch = navPointRegex.exec(ncxXml)) !== null) {
        const title = stripHtmlTags(navMatch[1]).trim()
        const src = navMatch[2].split('#')[0] // Remove fragment
        if (title) tocTitles.set(src, title)
      }
    }
  }

  // 7. Read each spine item
  const chapters: Chapter[] = []
  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i]
    const href = manifest.get(id)
    if (!href) continue

    const fullPath = rootDir !== '.' ? `${rootDir}/${href}` : href
    const entry = entries.find(e => e.entryName === fullPath || e.entryName === decodeURIComponent(fullPath))
    if (!entry) continue

    const html = entry.getData().toString('utf8')
    const bodyContent = extractBodyContent(html)
    if (!bodyContent || stripHtmlTags(bodyContent).length === 0) continue

    // Try to get title from TOC, then from HTML content
    let title = tocTitles.get(href) || tocTitles.get(decodeURIComponent(href)) || extractTitle(html)
    if (!title) title = `第 ${chapters.length + 1} 章`

    chapters.push({
      title: title,
      body: bodyContent,
      bodyText: stripHtmlTags(bodyContent),
      bodyHtml: '',
      orderIndex: chapters.length
    })
  }

  if (chapters.length === 0) {
    throw new Error('EPUB parsing failed: no readable chapters found')
  }

  return {
    chapters,
    coverBuffer: coverData?.buffer,
    coverExtension: coverData?.extension
  }
}
