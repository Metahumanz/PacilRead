# Changelog

## [0.5.1] - 2026-04-30

### Added

- **reader.db v7 external chapter storage**: chapters are now stored externally via the v7 database API, reducing memory footprint and improving load performance.
- **V7 storage optimization**: settings now include storage optimization options for v7 databases, with shared backup support.
- **Manual v6 migration**: a progress modal in settings allows users to manually migrate from v6 to v7 database format.

### Changed

- Reader now hydrates chapter content through the v7 database API instead of inline storage.

### Documentation

- Updated reader.db v7 compatibility guide.
- Added `DATABASE_COMPATIBILITY.md` for reader.db v6 changes.

## [0.5.0] - 2026-04-20
