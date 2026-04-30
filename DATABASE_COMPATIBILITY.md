# PacilRead reader.db v6 compatibility

This document describes the Android database changes introduced with `reader.db`
schema version 6. It is intended for the desktop client and backup tooling.

## Version 6 summary

- The `chapters.body_html` column is deprecated but still present.
- The canonical chapter body is `chapters.body_text`.
- Android no longer writes EPUB/TXT/PDF chapter HTML into `body_html`.
- On upgrade from v5 or older, Android clears existing `body_html` values and
  runs a best-effort background `VACUUM` to reclaim disk space.
- Imported EPUB covers are extracted automatically when possible and stored as
  compressed JPEG files in the app-private `covers` folder.

## Chapter body rules

Desktop clients should treat `chapters.body_text` as the source of truth.

When reading:

- Prefer `body_text`.
- Accept `body_html` as empty.
- If an older database has non-empty `body_html`, do not require it for modern
  Android compatibility.

When writing:

- Always populate `body_text`.
- Write `body_html` as an empty string.
- Keep the `body_html` column in the table for cross-version compatibility.

The Android schema keeps `body_html TEXT NOT NULL DEFAULT ''` so older code that
expects the column to exist can still open the database.

## Covers

Book covers are referenced by `books.cover_path`.

Android stores both automatically extracted EPUB covers and manually selected
covers under its private `files/covers` directory. The stored image is a JPEG
optimized for bookshelf display, with the longest edge capped around 900 pixels.

Desktop clients may continue to sync `cover_path` by file name. Android restore
logic rebases restored cover paths into the local `covers` directory.

## WebDAV backup impact

Full database backups still upload `reader.db`, but v6 databases should be much
smaller because `body_html` is empty after migration. Incremental backups remain
metadata-only and do not include the `chapters` table.

File sync behavior is unchanged:

- Original imported book files live under `books/`.
- Cover assets live under `covers/`.
- Android settings background assets live under the Android settings background
  directory.

## Migration expectations

Android upgrades from v5 to v6 as follows:

1. Ensure all existing schema columns still exist.
2. Clear `chapters.body_html`.
3. Mark a background maintenance task pending.
4. Recompress existing cover files when the task runs.
5. Run `VACUUM`; if it fails because the database is busy, Android keeps the
   pending flag and retries on a later open.

Desktop clients do not need to run `VACUUM` for compatibility, but should do so
after clearing large deprecated columns if they perform the same migration.
