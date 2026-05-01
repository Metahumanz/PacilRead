# WebDAV 同步格式 v8 迁移指南（桌面端）

## 概述

PacilRead Android 版从 v8 开始，**将增量同步和全量备份的数据格式从 SQLite (`reader.db` / `reader_lite.db`) 切换为 JSON 文件**。

本文档面向桌面端（或其他平台）开发者，说明新格式的结构和适配方法。

## 云端目录结构

```
PacilRead/
  reader.db                        # v7 及以前的全量备份（SQLite），v8 仍可读取
  reader_lite.db                   # v7 及以前的增量备份（SQLite），v8 仍可读取

  database/                        # [v8 新增] 全量快照目录
    books.json                     # 书架元数据
    chapters.json                  # 章节元数据（不含正文）
    rules.json                     # 替换规则
    themes.json                    # 自定义主题
    bookmarks.json                 # 书签
    reading_stats.json             # 阅读统计（全量快照用）
    manifest.json                  # 文件哈希清单

  sync/                            # [v8 新增] 增量同步目录（文件格式与 database/ 相同）
    books.json
    chapters.json
    rules.json
    themes.json
    bookmarks.json
    manifest.json

  chapter_text/                    # 章节正文压缩包（不变）
    book_{id}.zip

  books/                           # 源文件（EPUB/TXT/PDF）（不变）
  covers/                          # 封面图片（不变）

  android-settings/                # Android 设置快照（不变，已是 JSON）
    android-settings.json

  reading_stats/                   # 按设备的阅读统计（不变，已是 JSON）
    device-{id}.json
```

## manifest.json 格式

`manifest.json` 是增量同步的核心。它记录了每个同步文件的 SHA-256 哈希和大小，用于判断文件是否变化。

```json
{
  "schemaVersion": 1,
  "generatedAt": 1714567890123,
  "files": {
    "books.json": {
      "sha256": "abc123def456...",
      "size": 1234
    },
    "chapters.json": {
      "sha256": "789012...",
      "size": 5678
    }
  },
  "assets": {
    "covers/cover_123.jpg": { "size": 12345 },
    "books/mybook.epub": { "size": 67890 },
    "chapter_text/book_1.zip": { "size": 99999 }
  }
}
```

- `files`：JSON 数据文件的哈希和大小
- `assets`：二进制资源文件的路径和大小（仅比较大小，不计算哈希）

## JSON 文件 Schema

### books.json

```json
[
  {
    "id": 1,
    "title": "三体",
    "author": "刘慈欣",
    "bookType": "epub",
    "readingStatsKey": "sha256hex...",
    "progressIndex": 5,
    "progressOffset": 1200,
    "lastReadAt": 1714567890000,
    "pinned": false,
    "chapterCount": 42,
    "currentChapterTitle": "第二章 台球",
    "createdAt": 1714500000000,
    "updatedAt": 1714567890000,
    "coverFile": "cover_123.jpg",
    "sourceFile": "book_123.epub"
  }
]
```

**字段说明：**

| 字段 | 类型 | 说明 |
|---|---|---|
| id | long | 书籍唯一 ID |
| title | string | 书名 |
| author | string | 作者 |
| bookType | string | 类型：`"epub"`, `"txt"`, `"pdf"`, `"text"` |
| readingStatsKey | string | `SHA-256(lower(title)::lower(author))`，用于跨设备匹配 |
| progressIndex | int | 当前阅读章节的 order_index |
| progressOffset | int | 当前章节内的字符偏移 |
| lastReadAt | long | 最后阅读时间（epoch millis） |
| pinned | boolean | 是否置顶 |
| chapterCount | int | 章节总数 |
| currentChapterTitle | string | 当前章节标题 |
| createdAt | long | 创建时间（epoch millis） |
| updatedAt | long | 最后修改时间（epoch millis），用于合并判断 |
| coverFile | string | **仅文件名**，对应 `covers/` 目录下的文件 |
| sourceFile | string | **仅文件名**，对应 `books/` 目录下的文件 |

**重要：** `coverFile` 和 `sourceFile` 只是文件名，不是绝对路径。恢复时需要拼接本地路径。`localPath` 和 `coverPath`（绝对路径）不在 JSON 中存储，而是由各端根据自身文件系统重建。

### chapters.json

```json
[
  {
    "id": 1,
    "bookId": 1,
    "title": "第一章 疯狂年代",
    "orderIndex": 0,
    "bodyTextPath": "chapter_text/book_1/chapter_1.txt.gz",
    "bodyTextStorage": "file_gzip",
    "bodyTextSize": 12345
  }
]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| id | long | 章节唯一 ID |
| bookId | long | 所属书籍 ID |
| title | string | 章节标题 |
| orderIndex | int | 章节序号（从 0 开始） |
| bodyTextPath | string | 外置正文的相对路径（相对于 filesDir） |
| bodyTextStorage | string | `"file_gzip"` 或 `"db"`（db 表示正文仍在数据库/JSON 中） |
| bodyTextSize | long | 外置正文文件大小（字节） |

**重要：** JSON 中**不包含章节正文内容**（`body_text` 和 `body_html` 已被排除）。正文存储在 `chapter_text/book_{id}/chapter_{n}.txt.gz` 中，或打包在 `chapter_text/book_{id}.zip` 中。这是保持 JSON 文件轻量的关键设计。

### rules.json

```json
[
  {
    "id": 1,
    "pattern": "\\n{3,}",
    "replacement": "\\n\\n",
    "scope": "global",
    "regex": true,
    "active": true,
    "updatedAt": 1714567890000
  },
  {
    "id": 2,
    "pattern": "第一章",
    "replacement": "第1章",
    "scope": "book",
    "bookId": 5,
    "regex": false,
    "active": true,
    "updatedAt": 1714567890000
  }
]
```

| 字段 | 说明 |
|---|---|
| scope | `"global"`（全局）或 `"book"`（仅对某本书） |
| bookId | 仅 scope=book 时有值 |
| regex | 是否正则表达式 |

### themes.json

```json
[
  {
    "id": 1,
    "name": "护眼绿",
    "configJson": "{...}",
    "updatedAt": 1714567890000
  }
]
```

### bookmarks.json

```json
[
  {
    "id": 1,
    "uuid": "f47ac10b-...",
    "bookId": 1,
    "bookIdentity": "sha256hex...",
    "bookTitle": "三体",
    "bookAuthor": "刘慈欣",
    "chapterOrderIndex": 5,
    "chapterTitle": "第二章",
    "chapterOffset": 200,
    "progressPercent": 0.15,
    "summary": "重要段落",
    "createdAt": 1714567890000,
    "updatedAt": 1714567890000
  }
]
```

## 增量同步流程

### 备份（手机→云端）

1. 手机计算本地所有 JSON 文件的 SHA-256
2. 下载云端 `sync/manifest.json`
3. 对比哈希 → 只有变化的 JSON 文件才上传
4. 对比资源文件大小 → 只有变化的资源文件才上传
5. 上传新的 `sync/manifest.json`

### 恢复（云端→手机/桌面）

1. 下载云端 `sync/manifest.json`
2. 对比本地保存的 manifest（上次同步后的）
3. 只下载变化的 JSON 文件
4. **逐实体合并**到本地（按 `updatedAt` 判断谁更新，不直接覆盖）
5. 下载变化的资源文件
6. 保存远程 manifest 为本地副本

## 实体合并规则

合并的核心原则：**比较 `updatedAt`，保留较新的一方**。

| 实体 | 匹配键 | 合并规则 |
|---|---|---|
| books | `readingStatsKey` → `title+author` | 远程较新则更新 |
| chapters | `(bookId, orderIndex)` | 远程有外置文件信息则更新 |
| rules | `(pattern, scope, bookId)` | 远程较新则更新 |
| themes | `name` | 远程较新则更新 |
| bookmarks | `uuid` | 远程较新则更新 |
| reading_stats | `(deviceId, date, bookIdentity)` | 远程较新则更新 |

## 桌面端适配建议

### 选项 A：本地也用 JSON（推荐）

桌面端使用与手机端相同的 JSON 文件结构。好处：
- 同步直接下载 JSON 文件覆盖或合并
- 不需要数据库迁移逻辑
- 文件可读、可调试

### 选项 B：JSON → 本地数据库

下载 JSON 文件后导入到桌面端自己的数据库。需要实现：
- JSON 解析 → INSERT/UPDATE
- 合并时的 `updatedAt` 比较
- 路径重定位（`coverFile` → 本地 covers 目录）

### 兼容旧格式

v8 手机端仍能读取 v7 的旧格式：
- 全量恢复：如果 `database/books.json` 不存在，回退到下载 `reader.db`（SQLite）
- 增量恢复：如果 `sync/books.json` 不存在，回退到下载 `reader_lite.db`（SQLite）
- 一旦手机端执行过 v8 备份，`sync/` 和 `database/` 目录就会被创建

建议桌面端优先支持新 JSON 格式，旧 SQLite 格式作为回退。

## v8 与 v7 的关键区别

| | v7 | v8 |
|---|---|---|
| 增量同步格式 | `reader_lite.db`（SQLite） | `sync/*.json` + `manifest.json` |
| 全量备份格式 | `reader.db`（SQLite） | `database/*.json` + `manifest.json` |
| 章节数据 | 全量备份包含章节正文 | JSON 不含正文，正文在 `chapter_text/` 中 |
| 增量变化检测 | 无（每次上传完整 lite DB） | SHA-256 哈希对比，只上传变化的 |
| 合并策略 | 部分表全删全插 | 全部逐实体合并，按 updatedAt 判断 |
| 校验 | 无 | SHA-256 校验 |
