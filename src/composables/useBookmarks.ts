export interface BookmarkRecord {
  uuid: string
  bookId: number | null
  bookIdentity: string
  bookTitle: string
  bookAuthor: string
  coverPath: string | null
  chapterOrderIndex: number
  chapterTitle: string
  chapterOffset: number
  progressPercent: number
  summary: string
  createdAt: number
  updatedAt: number
}

export interface BookmarkTarget {
  uuid?: string
  chapterOrderIndex: number
  chapterOffset: number
}

export interface CreateBookmarkPayload {
  bookId: number
  bookIdentity: string
  bookTitle: string
  bookAuthor: string
  chapterOrderIndex: number
  chapterTitle: string
  chapterOffset: number
  progressPercent: number
  summary: string
}

function normalizeBookmarkRow(row: any): BookmarkRecord {
  return {
    uuid: String(row.uuid || ''),
    bookId: row.bookId === null || row.bookId === undefined ? null : Number(row.bookId),
    bookIdentity: String(row.bookIdentity || ''),
    bookTitle: String(row.bookTitle || ''),
    bookAuthor: String(row.bookAuthor || ''),
    coverPath: row.coverPath ? String(row.coverPath) : null,
    chapterOrderIndex: Number(row.chapterOrderIndex || 0),
    chapterTitle: String(row.chapterTitle || ''),
    chapterOffset: Number(row.chapterOffset || 0),
    progressPercent: Number(row.progressPercent || 0),
    summary: String(row.summary || ''),
    createdAt: Number(row.createdAt || 0),
    updatedAt: Number(row.updatedAt || 0),
  }
}

export async function fetchBookmarks(bookId?: number | null): Promise<BookmarkRecord[]> {
  const sql = bookId
    ? `SELECT
        uuid,
        book_id as bookId,
        book_identity as bookIdentity,
        book_title as bookTitle,
        COALESCE(book_author, '') as bookAuthor,
        chapter_order_index as chapterOrderIndex,
        chapter_title as chapterTitle,
        chapter_offset as chapterOffset,
        progress_percent as progressPercent,
        summary,
        created_at as createdAt,
        updated_at as updatedAt
      FROM bookmarks
      WHERE book_id = ?
      ORDER BY updated_at DESC`
    : `SELECT
        bm.uuid,
        bm.book_id as bookId,
        bm.book_identity as bookIdentity,
        bm.book_title as bookTitle,
        COALESCE(bm.book_author, '') as bookAuthor,
        b.cover_path as coverPath,
        bm.chapter_order_index as chapterOrderIndex,
        bm.chapter_title as chapterTitle,
        bm.chapter_offset as chapterOffset,
        bm.progress_percent as progressPercent,
        bm.summary,
        bm.created_at as createdAt,
        bm.updated_at as updatedAt
      FROM bookmarks bm
      LEFT JOIN books b ON b.id = bm.book_id
      ORDER BY bm.updated_at DESC`
  const rows = await window.electronAPI.db.query(sql, bookId ? [bookId] : [])
  return Array.isArray(rows) ? rows.map(normalizeBookmarkRow) : []
}

export async function createBookmark(payload: CreateBookmarkPayload): Promise<BookmarkRecord> {
  const now = Date.now()
  const uuid = crypto.randomUUID()
  await window.electronAPI.db.query(
    `INSERT INTO bookmarks (
      uuid, book_id, book_identity, book_title, book_author,
      chapter_order_index, chapter_title, chapter_offset, progress_percent,
      summary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      payload.bookId,
      payload.bookIdentity,
      payload.bookTitle,
      payload.bookAuthor,
      payload.chapterOrderIndex,
      payload.chapterTitle,
      Math.max(0, Math.floor(payload.chapterOffset)),
      Math.max(0, Math.min(100, Math.round(payload.progressPercent))),
      payload.summary,
      now,
      now,
    ]
  )

  return {
    uuid,
    bookId: payload.bookId,
    bookIdentity: payload.bookIdentity,
    bookTitle: payload.bookTitle,
    bookAuthor: payload.bookAuthor,
    coverPath: null,
    chapterOrderIndex: payload.chapterOrderIndex,
    chapterTitle: payload.chapterTitle,
    chapterOffset: Math.max(0, Math.floor(payload.chapterOffset)),
    progressPercent: Math.max(0, Math.min(100, Math.round(payload.progressPercent))),
    summary: payload.summary,
    createdAt: now,
    updatedAt: now,
  }
}

export async function deleteBookmark(uuid: string): Promise<void> {
  await window.electronAPI.db.query('DELETE FROM bookmarks WHERE uuid = ?', [uuid])
}

export async function deleteBookmarksForBook(bookId: number): Promise<void> {
  await window.electronAPI.db.query('DELETE FROM bookmarks WHERE book_id = ?', [bookId])
}
