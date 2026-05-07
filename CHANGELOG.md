# Changelog

## [0.6.6] - 2026-05-07

### Added

- 阅读 HUD 新增“固定悬浮 / 跟随翻页”动效选项，跟随翻页时当前页与 incoming 页各自渲染对应的标题、页数与全书进度。

### Changed

- 阅读器分页改为共用同一套页面度量计算，实时渲染、DOM 测量与离屏预分页使用一致的页宽、边距、行高和页面高度。
- 分页高度改为使用完整可用阅读区域，并放开 CSS columns 的 widows/orphans 限制，减少页面底部明明有空间却提前换页的问题。
- 翻页背景改为进入每个页面层，背景图、模糊与自动夜间遮罩会跟随当前页和下一页一起运动。
- 覆盖翻页的上一页方向改为“上一页从左侧回来盖住当前页”，下一页方向保持“当前页左滑露出下一页”。

### Fixed

- 修复阅读器原生下拉框弹层选项在深色面板中不可读的问题。
- 修复 HUD“书名/章节名”在章节第一页显示章节名而不是书名的问题，现在每章第一页显示书名。
- 修复阅读样式保存后立即重分页可能早于设置落盘的问题，并补齐阅读排版/HUD 设置在运行时设置备份中的覆盖范围。

## [0.6.5] - 2026-05-07

### Fixed

- 修复 WebDAV 增量/全量恢复后桌面界面设置、阅读排版、HUD 与快捷键设置没有真正应用的问题。
- 修复阅读页快捷键提示浮层按钮点击被翻页交互抢走，导致“不再提示 / 我知道了”无法点击的问题。
- 修复正文 ZIP 增量同步不够精确的问题：备份只上传云端缺失的 ZIP，恢复只下载本地缺失的 ZIP。

### Changed

- 桌面私有设置只写入 `desktop-settings/desktop-settings.json`，v8 `sync/` / `database/` 不再发布 `settings.json`。
- 新备份会清理远端旧的 `sync/settings.json` 与 `database/settings.json`，避免移动端误读桌面私有设置。
- 桌面设置上传提前执行，并在上传后立即读取同一路径确认云端文件存在。

## [0.6.0] - 2026-05-01

### Added

- **ReaderPaginator 异步分页模块**: 章节切换动画期间通过隐藏离屏 DOM 预渲染和 CSS 列布局测量，将 PageSlice 结果缓存。动画结束时命中缓存则跳过 DOM 测量并以 100ms 渐入显示，未命中回退至现有 scrollWidth 测量。支持预热相邻章节、快照哈希自动失效、LRU 淘汰（上限 50 条）、generation 计数器取消机制。

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
