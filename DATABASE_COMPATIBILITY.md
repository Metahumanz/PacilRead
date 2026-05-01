# PacilRead reader.db v7 兼容性文档

本文档描述 `reader.db` 架构版本 v7 引入的数据库变更，供桌面端客户端和备份工具开发者参考。

## v7 变更摘要

- `chapters.body_html` 列保留但始终写空，不再存储任何正文内容。
- 新增三个章节外置存储字段，支持将正文迁移出数据库。
- 章节正文可存储为外部 GZIP 压缩文件（`chapter_text/book_<bookId>/chapter_<chapterId>.txt.gz`）。
- 数据库仅保留章节元数据（标题、顺序、阅读进度等），正文主体从外部文件读取。
- 设置页"优化数据库存储"按钮执行深度瘦身：清 `body_html`、导出正文到 GZIP 文件、清空数据库 `body_text`、checkpoint WAL、`VACUUM`。
- 全量备份必须包含 `chapter_text/` 目录，否则外置正文无法恢复。

## Schema 变更

`chapters` 表新增以下列：

```sql
ALTER TABLE chapters ADD COLUMN body_text_path    TEXT;
ALTER TABLE chapters ADD COLUMN body_text_storage TEXT NOT NULL DEFAULT 'db';
ALTER TABLE chapters ADD COLUMN body_text_size    INTEGER NOT NULL DEFAULT 0;
```

字段说明：

| 列名 | 类型 | 说明 |
|------|------|------|
| `body_text_path` | TEXT | 外置正文文件的相对路径，`storage='db'` 时为 NULL |
| `body_text_storage` | TEXT | 存储模式：`'db'`（数据库内）或 `'file_gzip'`（外置 GZIP 压缩文件） |
| `body_text_size` | INTEGER | 正文原始字节数（解压后），用于空间统计。0 表示未知或无正文 |

`body_html` 列保留定义 `TEXT NOT NULL DEFAULT ''`，但所有新写入操作均写空字符串。旧数据库中可能存在非空值，Android 瘦身流程会将其清空。

v7 完整建表语句（供桌面端新建数据库参考）：

```sql
CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body_html TEXT NOT NULL DEFAULT '',
    body_text TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL,
    body_text_path TEXT,
    body_text_storage TEXT NOT NULL DEFAULT 'db',
    body_text_size INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_chapters_book_order ON chapters(book_id, order_index);
```

## 外置正文文件

### 存储路径

完整物理路径：

- **Android**：`context.getFilesDir()/chapter_text/book_<bookId>/chapter_<chapterId>.txt.gz`
- **桌面端**：`<data_dir>/chapter_text/book_<bookId>/chapter_<chapterId>.txt.gz`（`<data_dir>` 为桌面端存储应用数据的根目录）

`body_text_path` 列仅存储相对路径：`book_<bookId>/chapter_<chapterId>.txt.gz`。
读取时拼接到 `chapter_text/` 目录下即可得到完整路径。

- 文件名使用章节 ID 而非标题，避免特殊字符问题。
- 文件内容为章节正文原文经 GZIP 压缩，编码为 UTF-8。
- 压缩规范：`java.util.zip.GZIPOutputStream`，写入为纯 UTF-8 文本后再压缩。桌面端需使用兼容的 GZIP 实现（标准 DEFLATE）。

### 存储模式状态机

```
新建书籍 ──→ storage = 'file_gzip'
               body_text_path = "book_<id>/chapter_<id>.txt.gz"
               body_text = ""（数据库内为空）

旧版兼容 ──→ storage = 'db'
               body_text_path = NULL
               body_text = 章节原文（数据库内存储）

瘦身后   ──→ storage = 'file_gzip'
               body_text_path = "book_<id>/chapter_<id>.txt.gz"
               body_text = ""（已导出并清空）
               body_text_size = 原文字节数
```

## 桌面端读写规则

### 读取章节正文（2026-05 更新：增加 legacy body 列回退 + 占位文本）

桌面端应按以下优先级读取章节正文：

```
1. 若 body_text_storage = 'file_gzip' 且 body_text_path 非空：
   → 解析 body_text_path 找到对应的外置 .txt.gz 文件，GZIP 解压后返回。
   → body_text_path 可能是相对路径（book_<id>/chapter_<id>.txt.gz）或绝对路径（旧版本）。
     解析路径时：先尝试按相对路径拼接 data_dir/chapter_text/<path>；
     若文件不存在，尝试将 path 视为绝对路径直接读取。
   → 若文件缺失，记录警告日志，回退到第 2 步。

2. 若 body_text 非空：
   → 直接使用 body_text（兼容旧数据库，storage='db' 模式）。

3. 若 body_text 为空且 body_text 列太大导致分块读取（CursorWindow 安全）：
   → 使用 SUBSTR(body_text, offset, chunkSize) 分块拼接读取完整正文。
   → 桌面端通常无 CursorWindow 大小限制，可直接读取，但建议也做分块兼容处理。

4. 若以上皆无正文，且数据库中存在旧版 body 列（pre-v6）：
   → 检查 body 列是否有内容（旧版 HTML 正文）。
   → 若有内容，使用 HtmlUtils.stripHtml(body) 提取纯文本作为正文。
   → 此列在 v7 中默认写空，仅用于兼容极旧数据库。

5. 所有回退路径均无正文：
   → 返回固定占位文本："章节正文为空或外置正文文件缺失。"（中文）。
   → Android 端已在 ReaderDatabaseHelper 中定义了 EMPTY_CHAPTER_TEXT_PLACEHOLDER 常量。
   → 桌面端应使用相同占位文本或本地化等效文本，避免向用户展示空白页。
```

参考伪代码（更新版）：

```python
EMPTY_CHAPTER_TEXT_PLACEHOLDER = "章节正文为空或外置正文文件缺失。"

def get_chapter_body(chapter_row, data_dir):
    # 第1步：优先读取外置文件
    if chapter_row.body_text_storage == 'file_gzip' and chapter_row.body_text_path:
        path = resolve_chapter_text_path(chapter_row.body_text_path, data_dir)
        if path and os.path.exists(path):
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                return f.read()
        log.warning(f"外置正文文件缺失 chapter {chapter_row.id}: {chapter_row.body_text_path}")
    
    # 第2步：回退数据库 body_text
    if chapter_row.body_text:
        return chapter_row.body_text
    
    # 第3步：分块读取（如果 body_text 太大未预读到 cursor）
    if chapter_row.body_text is None:
        # 桌面端通常可直接 SELECT body_text，但建议也支持分块读取
        body_text = read_body_text_chunked(db, chapter_row.id)
        if body_text:
            return body_text
    
    # 第4步：回退旧版 body 列（pre-v6 HTML 正文）
    if has_column(db, "chapters", "body"):
        legacy_body = read_column_chunked(db, "chapters", "body", chapter_row.id)
        if legacy_body:
            return strip_html(legacy_body)
    
    # 第5步：返回占位文本
    return EMPTY_CHAPTER_TEXT_PLACEHOLDER

def resolve_chapter_text_path(body_text_path, data_dir):
    """解析 body_text_path，兼容相对路径和绝对路径"""
    # v7+ 存储的是相对路径：book_<id>/chapter_<id>.txt.gz
    relative_path = os.path.join(data_dir, 'chapter_text', body_text_path)
    if os.path.exists(relative_path):
        return relative_path
    # 兼容旧版绝对路径
    if os.path.isabs(body_text_path) and os.path.exists(body_text_path):
        return body_text_path
    return None
```

### 写入/新建章节

桌面端新建书籍时：

- **推荐模式**：将正文写入外置 `.txt.gz`，数据库行设置 `body_text_storage='file_gzip'`、`body_text_path` 指向该文件、`body_text_size` 为原文字节数、`body_text` 写空字符串。
- **兼容模式**：若需兼容旧版 Android（v5 及以下），可将正文同时写入 `body_text` 和外置文件。注意这会占用双份存储空间。

桌面端处理旧数据库时：

- 若数据库行 `storage='db'` 且 `body_text` 有内容，不需要主动迁移。保留原有存储模式，读写功能均正常。
- 若需主动瘦身，参见下文的"瘦身流程"。

### body_html 处理

- 读取时可接受为空。如果旧数据库有非空 `body_html`，不应依赖其作为正文来源。
- 写入时始终写空字符串 `''`。
- 保留该列以保证与全部 v6+ 客户端的兼容性。

## 全量备份结构

完整备份应打包以下文件和目录：

```
backup_root/
├── reader.db                  # SQLite 数据库（必需）
├── chapter_text/               # 外置章节正文（必需，存在外置正文时）
│   └── chapters_<bookId>.zip  # 每本书的章节正文打包（2026-05 起推荐格式）
├── covers/                     # 封面图片（必需）
│   └── <cover_hash>.jpg
└── books/                      # 原始源文件（可选，仅用于保留导入用源文件）
    └── <title>.<ext>
```

- `reader.db` 是必需的，包含所有元数据。
- `chapter_text/` 目录：只要数据库中存在任意 `storage='file_gzip'` 的行，该目录即视为必需。缺失将导致对应章节正文无法恢复。
- `covers/`：封面图片，缺失不影响阅读但书架显示将缺少封面。
- `books/`：从 v7 开始降级为可选备份项。原始源文件不再作为阅读必需数据，仅用于用户希望保留导入源文件以备日后重新导入的场景。

### 章节正文备份格式（2026-05 更新）

从 2026-05 起，Android 端 WebDAV 备份将每本书的章节正文打包为单个 ZIP 文件上传，而非逐文件上传。桌面端应支持两种格式：

**新格式（推荐）**：
```
chapter_text/chapters_<bookId>.zip
```
ZIP 内部结构：
```
chapters_<bookId>.zip
└── book_<bookId>/
    ├── chapter_<chapterId1>.txt.gz
    ├── chapter_<chapterId2>.txt.gz
    └── ...
```
- ZIP 内部使用相对路径 `book_<id>/chapter_<id>.txt.gz`，与数据库 `body_text_path` 一致。
- ZIP 使用标准 DEFLATE 压缩（java.util.zip.ZipOutputStream）。

**旧格式（兼容）**：
```
chapter_text/book_<id>/chapter_<id>.txt.gz  （散文件）
```
- 逐文件上传/下载，文件数量大时效率低。
- 桌面端下载时应同时检查两种格式：先查找 `chapters_<bookId>.zip`，不存在则回退到散文件目录。

**桌面端上传建议**：
- 优先使用 ZIP 打包格式 (`chapters_<bookId>.zip`)，减少上传文件数。
- 同时保留散文件格式作为兼容（新老客户端混合使用时更安全）。
- 若只服务桌面端自身，仅使用其中一种即可。

### Android 上传示例（WebDAV full backup，2026-05 更新）

Android 全量备份按用户勾选的同步范围选择性上传：

**书架元数据**（始终执行）：
1. `reader.db`

**章节正文**（书架同步启用时）：
2. 收集需备份的章节，按 `book_id` 分组，每本书生成 `chapters_<bookId>.zip` 上传到 `chapter_text/` 目录
3. ZIP 内包含该书所有 `storage='file_gzip'` 章节的 `.txt.gz` 文件

**书籍源文件**（文件同步启用时）：
4. `books/` 下所有文件

**封面/背景图**（对应同步范围启用时）：
5. `covers/` 下所有文件（由书架同步控制）
6. 背景图文件（由背景图同步控制）

### 远端孤立文件清理（2026-05 新增）

Android 端新增"备份后清理远端未引用文件"功能（`SettingsStore.isWebDavCleanRemoteOrphansEnabled()`）。开启后，全量和增量备份完成后会自动清理远端备份目录中已不被当前书架引用的文件：

- 列出远端 `chapter_text/` 目录下所有 `chapters_*.zip`，删除当前数据库中不存在对应 `book_id` 的 ZIP 包。
- 列出远端 `covers/` 目录下所有封面文件，删除当前书架已不引用的封面。
- 列出远端 `books/` 目录下所有源文件，删除当前书架已不引用的源文件。
- 列出远端背景图目录，删除已不被任何主题引用的背景图。

桌面端实现远程同步时可参考此逻辑，避免远端存储无限增长。

### 桌面端上传注意事项

桌面端上传时，确保：

- `reader.db` 最先上传，因为它是目录索引。
- 章节正文使用 ZIP 打包格式时，ZIP 内部路径必须与数据库中的 `body_text_path` 值格式一致（`book_<id>/chapter_<id>.txt.gz`）。例如数据库存 `book_3/chapter_17.txt.gz`，则 ZIP 条目应为 `book_3/chapter_17.txt.gz`。
- 路径分隔符统一使用正斜杠 `/`（WebDAV 和 ZIP 均使用正斜杠）。
- 上传时先创建 `chapter_text/` 目录（`MKCOL`），再上传 `chapters_<bookId>.zip` 文件。
- 遍历数据库 `SELECT DISTINCT book_id FROM chapters WHERE body_text_storage='file_gzip'`，按书籍分组生成 ZIP。

## 全量下载与恢复规则

桌面端从远程拉取完整备份时，建议按以下顺序：

```
1. 下载 reader.db → 解析 books 和 chapters 行。
2. 下载 chapter_text/ → 优先查找 chapters_<bookId>.zip，按 ZIP 解压到 chapter_text/book_<id>/ 目录。
   若 ZIP 不存在，回退到散文件目录下载。
3. 下载 covers/ → 放入对应本地目录。
4. 下载 books/ → 可选，放入对应本地目录。
```

恢复后校验：

- 遍历所有章节，检查 `storage='file_gzip'` 的行：对应的 `.txt.gz` 文件是否存在。
- 若文件缺失且 `body_text` 为空且 `body` 列为空/不存在 → 该章节标记为"正文缺失"，显示占位文本。
- 若文件缺失但 `body_text` 非空 → 正常（旧数据库兼容行，正文从数据库读取）。可触发修复流程将数据库正文重新导出为外置文件。
- 若文件缺失且 `body_text` 为空但旧 `body` 列有内容 → 从 `body` 列提取纯文本作为正文（兼容 pre-v6 数据库）。
- 数据库路径中的 `body_text_path` 值若为绝对路径，应将其 rebase 到本地数据目录。v7 数据库仅存储相对路径，但处理旧数据时需防御。

### 缺失正文修复（2026-05 新增）

Android 端"优化数据库存储"按钮现在包含"修复章节正文"阶段，桌面端可参考实现：

**优先级1：从数据库正文重建外置文件**

```
遍历 storage='file_gzip' 且 body_text_path 非空但文件缺失的章节：
  1. 若 body_text 非空 → 将 body_text 写入 .txt.gz 文件，校验回读一致性后更新 storage 字段。
  2. 若 body_text 为空 → 分块读取 body_text 列，写入外置文件。
  3. 若数据库内也无正文 → 检查旧 body 列是否有 HTML 正文，strip HTML 后写入外置文件。
```

**优先级2：从源文件重新解析（数据库正文也缺失时）**

```
按 book_id 分组未修复的章节：
  1. 查找对应 BookRecord 的 localPath（源文件路径）。
  2. 若源文件存在且为 EPUB 或 TXT → 重新解析提取章节正文。
  3. 按 order_index 匹配章节，将重新提取的正文写入外置 .txt.gz。
  4. 校验通过后更新数据库 storage 字段。
  5. 当前支持 EPUB 和 TXT 格式；PDF 暂不支持从源文件修复。
```

**桌面端实现要点**：
- 写入前校验：GZIP 写入 → 解压回读 → 逐字符与原始正文对比，不匹配则保留数据库正文不更新 storage。
- 校验通过后：清空 `body_text`（和 `body` 列，如存在），更新 `body_text_storage='file_gzip'`、`body_text_path`、`body_text_size`。
- 若校验失败，保留原 `storage='db'` 状态，不修改数据库。
- 修复过程可随时中断并安全重试：已修复的章节 storage 已变更为 `file_gzip`，下次跳过；未修复的保持 `db` 模式。

参考伪代码：

```python
def repair_missing_chapter_text(db, data_dir, book_source_map):
    """修复缺失的外置章节正文文件"""
    missing = []
    for row in db.execute(
        "SELECT id, book_id, order_index, body_text_path FROM chapters "
        "WHERE body_text_storage='file_gzip' AND body_text_path IS NOT NULL"
    ):
        path = os.path.join(data_dir, 'chapter_text', row.body_text_path)
        if not os.path.exists(path):
            missing.append(row)
    
    unresolved_by_book = {}
    for row in missing:
        # 第1优先级：从数据库正文修复
        body_text = get_body_text_from_db(db, row.id)
        if body_text:
            write_and_verify_external_text(data_dir, db, row.book_id, row.id, body_text)
            continue
        # 第2优先级：从源文件修复
        unresolved_by_book.setdefault(row.book_id, []).append(row)
    
    for book_id, rows in unresolved_by_book.items():
        source_file = book_source_map.get(book_id)
        if source_file:
            seeds = reparse_source(source_file)
            for row in rows:
                if row.order_index < len(seeds):
                    body_text = seeds[row.order_index].body_text
                    if body_text:
                        write_and_verify_external_text(data_dir, db, book_id, row.id, body_text)
```

## 深度瘦身与维护流程（2026-05 更新）

Android"优化数据库存储"按钮执行以下阶段。桌面端若需实现等效功能，可参考此流程：

### 阶段0：健康检查前置（2026-05 新增）

维护执行前检查数据库完整性：
```sql
SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('books','chapters');
```
若返回值 < 2（books 或 chapters 表缺失），中止维护并提示用户数据库可能已损坏。

此外，Android 端启动时也使用此检查（`isDatabaseHealthyForStartup()`）防止损坏的数据库导致崩溃。桌面端建议在打开数据库时首先执行此检查。

### 阶段1：清空 body_html（v6→v7 迁移遗留）

```
1. 检查 chapters 表是否有 body_html 列。
2. 若存在且存在 body_html != '' 的行，执行：
   UPDATE chapters SET body_html = '' WHERE body_html IS NOT NULL AND body_html != ''。
```

### 阶段2：修复缺失外置正文（2026-05 新增）

```
1. 统计 storage='file_gzip' 但外置 .txt.gz 文件缺失的章节数。
2. 若存在缺失，按优先级修复：
   a. 从数据库 body_text 重建外置文件。
   b. 若数据库也无正文，检查旧 body 列（pre-v6 HTML 正文），strip HTML 后重建。
   c. 若仍无正文，按 book_id 分组，尝试从原始源文件（EPUB/TXT）重新解析提取。
3. 写入外置文件后校验回读一致性，通过后才更新数据库 storage 字段。
4. 所有回退路径均无正文的章节保留原状，等待用户重新导入书籍。
```

### 阶段3：导出正文到外置文件

```
1. 遍历所有 storage='db' 或 body_text 非空的章节行。
2. 对每行：
   a. 若外置 .txt.gz 文件已存在 → 跳过（避免重复写入）。
   b. 读取 body_text 内容（空时检查旧 body 列）。
   c. 若正文为空且 body 列也无内容 → 保留原状态跳过。
   d. 创建目录 chapter_text/book_<bookId>/。
   e. 将正文经 GZIPOutputStream 写入 chapter_<chapterId>.txt.gz。
   f. 解压校验：读取压缩文件并与原始正文逐字节比对。
   g. 校验通过后：
      - UPDATE body_text_storage = 'file_gzip'
      - UPDATE body_text_path = 'book_<bookId>/chapter_<chapterId>.txt.gz'
      - UPDATE body_text_size = <原始字节数>
      - UPDATE body_text = ''   （清空数据库正文）
      - UPDATE body = ''        （若 body 列存在，也清空）
```

### 阶段4：整理 WAL 日志

```
PRAGMA wal_checkpoint(TRUNCATE)
```
将 WAL 内容写入主文件并清空 WAL。WAL 已空时可能抛错（非致命，忽略即可）。

### 阶段5：VACUUM 空间回收（2026-05 更新）

**静默执行条件**（导出正文后总是 VACUUM，无论空闲页多少）：
- 阶段3（导出正文）刚执行过 → 总是 VACUUM。

**按阈值判断**（其他情况）：
- 统计空闲页：`PRAGMA freelist_count`。
- 仅当空闲页 ≥ 256（`VACUUM_FREE_PAGE_THRESHOLD`）时执行 VACUUM。
- 阈值以下的小量碎片属于 SQLite 正常波动，不必要的 VACUUM 会消耗 I/O 且重建数据库文件。
- 桌面端建议采用相同阈值，避免每次打开都触发重写。

**VACUUM 注意事项**：
- VACUUM 期间禁止其他写入操作。如果无法获取排他锁，跳过 VACUUM 并提示用户稍后重试。
- 清空 `body_html` 和 `body_text` 后，数据库文件体积应显著减小（通常减少 60%-90%，取决于正文占比）。
- 瘦身过程中若被中断，已完成的章节 `storage` 已更新为 `'file_gzip'`，未完成的仍为 `'db'`。再次点击按钮时跳过已完成章节即可继续。

### 维护任务检测（2026-05 新增）

Android 端使用 `hasPendingMaintenanceWork()` 统一判断是否有待处理任务，桌面端可参考以下逻辑判断是否需要显示"优化存储"按钮：

```python
def has_pending_maintenance(db, data_dir):
    """检查是否有待处理的维护任务"""
    # 1. body_html 清理标记
    if has_non_empty_body_html(db):
        return True
    # 2. 封面重压缩标记
    if maintenance_prefs.get('recompress_covers'):
        return True
    # 3. 正文导出：标记位 OR 实际有待导出章节
    if maintenance_prefs.get('export_body_text') or count_chapters_needing_export(db) > 0:
        return True
    # 4. 真空优化：WAL checkpoint 标记 OR VACUUM 标记 OR 空闲页 >= 阈值
    if (maintenance_prefs.get('wal_checkpoint') or 
        maintenance_prefs.get('vacuum') or 
        get_free_page_count(db) >= VACUUM_FREE_PAGE_THRESHOLD):
        return True
    # 5. 外置正文文件缺失
    if count_missing_chapter_text_files(db, data_dir) > 0:
        return True
    return False
```

**注意**：维护标记位（maintenance prefs）是 Android 端 `SharedPreferences` 中的持久化标志。桌面端可使用等效机制（如配置文件、数据库元表等），或简化为直接检查数据库状态。标记位的作用是确保一次性迁移（如清空 body_html）不会被遗漏——若标记位丢失，重新检测数据库状态即可补救。

## 删除书籍时的联动清理

删除书籍时应同时删除其外置正文目录：

```python
def delete_book(book_id, data_dir):
    # 删除数据库行（级联删除章节行）
    db.execute("DELETE FROM books WHERE id = ?", [book_id])
    # 删除外置正文目录
    chapter_dir = os.path.join(data_dir, 'chapter_text', f'book_{book_id}')
    if os.path.exists(chapter_dir):
        shutil.rmtree(chapter_dir)
    # 删除封面文件
    ...
```

## 版本兼容矩阵（2026-05 更新）

| 场景 | Android | 桌面端 |
|------|---------|--------|
| 读取 `storage='db'` 且 `body_text` 非空 | 直接读数据库 | 直接读数据库 |
| 读取 `storage='file_gzip'` | 优先读 `.txt.gz`，缺失回退 `body_text` → 旧 `body` 列 → 占位文本 | 优先读 `.txt.gz`，缺失回退 `body_text` → 旧 `body` 列 → 占位文本 |
| 正文全部缺失 | 返回 EMPTY_CHAPTER_TEXT_PLACEHOLDER | 返回相同占位文本 |
| 新建书籍 | 写入 `.txt.gz`，`body_text` 写空 | 推荐写入 `.txt.gz`，`body_text` 写空 |
| 打开 v6 旧数据库 | 正常读取，可选择触发瘦身 | 正常读取，兼容模式工作 |
| 打开 pre-v6 数据库（含旧 `body` 列） | 检测 `body` 列，优先迁移 `body` → `body_text`，后续按 v7 规则读取 | 检测 `body` 列，按回退优先级读取 |
| 打开 v7 新数据库 | 正常（原生支持） | 正常（本文档规则） |
| 全量备份 | 章节正文按书籍打包为 `chapters_<bookId>.zip` | 推荐同样使用 ZIP 打包格式 |
| 全量恢复 | 优先解压 `chapters_*.zip`，回退散文件 | 优先解压 `chapters_*.zip`，回退散文件 |
| 维护/瘦身 | 5 阶段流程（含缺失修复） | 参考本文档阶段说明 |
| 健康检查 | 启动时检查 `books`/`chapters` 表存在性 | 建议同样执行启动前健康检查 |

## 启动时数据库健康检查（2026-05 新增）

Android 端在 SplashActivity 启动时新增数据库健康检查，桌面端强烈建议实现等效逻辑：

```python
def is_database_healthy_for_startup(db_path):
    """快速检查数据库核心表是否存在"""
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master "
            "WHERE type='table' AND name IN ('books','chapters')"
        )
        count = cursor.fetchone()[0]
        conn.close()
        return count >= 2
    except Exception as e:
        log.warning(f"Database health check failed: {e}")
        return False
```

**使用场景**：
- 应用启动时，在打开 reader/书架之前执行此检查。
- 若返回 `False`（数据库文件损坏、表缺失等），跳过自动打开上次阅读书籍的逻辑，直接进入书架首页。
- 防止损坏的数据库导致 NullPointerException 或 Cursor 异常崩溃。
- 此检查非常轻量（仅查询 `sqlite_master`），不会显著增加启动时间。

**桌面端注意事项**：
- SQLite 文件可能被外部工具修改或损坏，每次打开前都应执行检查。
- 若检查失败，提示用户数据库可能已损坏，建议从备份恢复或重建数据库。

## 从 v6 迁移到 v7

Android 端迁移由 `ReaderDatabaseHelper.onUpgrade()` 自动执行：

1. 确保 `body_html` 列存在（v6 已存在）。
2. 添加 `body_text_path`、`body_text_storage`、`body_text_size` 列（`ALTER TABLE ADD COLUMN`，带默认值，已有数据不受影响）。
3. 已有章节保持 `storage='db'` 不变，正文仍在数据库内。
4. 用户手动触发的"优化数据库存储"才执行导出 + 清空 + VACUUM。

桌面端若从 v6 数据库升级：

- 执行相同的 `ALTER TABLE ADD COLUMN` 语句。
- 无需主动瘦身。v6 数据库的 `body_text` 仍然有效，`storage` 默认值为 `'db'`。
- 新建章节时建议使用外置模式（`storage='file_gzip'`），使后续同步和备份更高效。

## 设置体系与跨平台同步

PacilRead 的设置系统分为两层：Android 私有设置（SharedPreferences）和跨平台通用设置。WebDAV 备份/恢复通过 JSON 格式同步 Android 私有设置，桌面端需理解此格式以正确读写设置。

### 存储架构

```
Android SharedPreferences (pacil_read_settings.xml)
├── 同步范围控制（书架/文件/UI/主题/背景图/阅读统计 + 远端清理）
├── WebDAV 连接信息（URL/目录/用户名/密码 —— 仅本机，不同步）
├── 阅读器偏好（字体/间距/翻页/TTS/主题/背景……）
├── 书架布局（视图模式/导航样式/侧边栏……）
├── 自动阅读 & 自动夜间模式
├── 设备 ID（阅读统计用）
└── 桌面端 → 使用等效键值存储（JSON 文件 / SQLite 元表 / 平台原生配置）
```

Android 使用 `SharedPreferences`（XML 文件 `pacil_read_settings.xml`）。桌面端可使用任意等效存储，只要键名和值类型一致即可。

### 设置键名注册表

以下为全部设置键、类型、默认值和有效值。桌面端应使用相同键名以保持 JSON 格式兼容。

#### WebDAV 连接信息（本机保留，不参与同步恢复）

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `webdav_enabled` | boolean | `false` | 是否启用 WebDAV |
| `webdav_url` | string | `""` | WebDAV 服务器地址（自动补齐末尾 `/`） |
| `webdav_dir` | string | `"PacilRead/"` | 备份根目录（自动补齐首尾 `/`） |
| `webdav_settings_subdir` | string | `"android-settings/"` | 设置快照子目录 |
| `webdav_user` | string | `""` | 用户名 |
| `webdav_password` | string | `""` | 密码（明文存储，桌面端应考虑加密） |
| `webdav_last_full` | long | `0` | 上次全量备份时间戳 |
| `webdav_last_lite` | long | `0` | 上次增量备份时间戳 |

#### WebDAV 同步范围（本机保留，不参与同步恢复）

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `webdav_sync_bookshelf` | boolean | `true` | 同步书架元数据 + 章节正文 |
| `webdav_sync_files` | boolean | `true` | 同步书籍源文件 |
| `webdav_sync_ui_settings` | boolean | `true` | 同步 UI 偏好 |
| `webdav_sync_themes` | boolean | `true` | 同步自定义主题 |
| `webdav_sync_backgrounds` | boolean | `true` | 同步背景图片 |
| `webdav_sync_reading_stats` | boolean | `true` | 同步阅读统计 |
| `webdav_clean_remote_orphans` | boolean | `false` | 备份后清理远端未引用文件（2026-05 新增） |

**桌面端注意**：WebDAV 同步范围控制备份/恢复的选择性。例如，若用户只勾选 `webdav_sync_bookshelf`，则备份仅包含 `reader.db` + `chapter_text/`，不包含 `books/`、`covers/`、背景图等。桌面端应尊重这些开关。

#### 阅读器偏好（参与 Android 私有设置同步）

| 键名 | 类型 | 默认值 | 有效值 / 说明 |
|------|------|--------|------|
| `auto_open_last` | boolean | `false` | 启动时自动打开上次阅读的书籍 |
| `font_size_sp` | float | `18` | 字体大小（SP），范围 12-64 |
| `font_family` | string | `"system_default"` | `system_default` / `sans-serif` / `monospace` |
| `font_weight` | int | `400` | 字重，≤325→250, ≥550→700, 其他→400 |
| `reader_text_color` | string | `"theme_default"` | `theme_default` / `ink_brown` / `graphite` / `warm_gray` / `jade_ink` / `forest_ink` / `moon_white` / `custom` |
| `custom_text_color` | string | `""` | 自定义文字颜色（仅在 `reader_text_color=custom` 时生效），格式 `#RRGGBB` 或 `#AARRGGBB` |
| `line_spacing_extra` | float | `8` | 行间距额外 SP，范围 0-28 |
| `letter_spacing` | float | `0` | 字间距，范围 0-1，精度 0.05 |
| `left_padding_dp` | int | `18` | 左边距 DP，范围 0-48 |
| `right_padding_dp` | int | `18` | 右边距 DP，范围 0-48 |
| `top_padding_dp` | int | `8` | 上边距 DP，范围 0-128 |
| `bottom_padding_dp` | int | `8` | 下边距 DP，范围 0-128 |
| `first_line_indent` | int | `2` | 首行缩进字符数，范围 0-8 |
| `paragraph_spacing_dp` | int | `4` | 段落间距 DP，范围 0-32 |
| `body_text_justify` | boolean | `true` | 正文两端对齐 |
| `chapter_title_visibility` | boolean | `true` | 显示章节标题 |
| `chapter_title_alignment` | string | `"left"` | `left` / `center` |

#### 阅读器 HUD 布局（参与同步）

| 键名 | 类型 | 默认值 | 有效值 |
|------|------|--------|--------|
| `hud_top_left` | string | `"title"` | 见下方 HUD 槽位取值表 |
| `hud_top_center` | string | `"none"` | |
| `hud_top_right` | string | `"time"` | |
| `hud_bottom_left` | string | `"chapter"` | |
| `hud_bottom_center` | string | `"none"` | |
| `hud_bottom_right` | string | `"page_and_progress"` | |
| `hud_top_margin` | int | `2` | HUD 顶边距 DP，范围 0-32 |
| `hud_bottom_margin` | int | `2` | HUD 底边距 DP，范围 0-32 |
| `hud_vertical_margin` | int | `2` | 统一垂直边距（兼容旧键，设置时同时写入 top/bottom） |

**HUD 槽位有效值**：`title`, `chapter`, `title_chapter`, `time`, `battery`, `time_and_battery`, `chapter_page`, `book_progress`, `page_and_progress`, `none`

**历史兼容**：`progress` 自动映射为 `book_progress`。

#### 翻页 / 阅读模式（参与同步）

| 键名 | 类型 | 默认值 | 有效值 |
|------|------|--------|--------|
| `flip_mode` | string | `"slide"` | `cover` / `slide` / `simulation` / `scroll` / `none` |
| `flip_speed` | string | `"medium"` | `slow` / `medium` / `fast` |
| `reader_slider_mode` | string | `"book"` | `book` / `chapter`（进度条按全书/按章节） |
| `volume_key_up_action` | string | `"page_up"` | `page_up` / `page_down` / `system` |
| `volume_key_down_action` | string | `"page_down"` | `page_up` / `page_down` / `system` |
| `reader_orientation_mode` | string | `"system"` | `system` / `portrait` / `landscape` |
| `reader_double_page_enabled` | boolean | `false` | 双页模式开关 |
| `reader_double_page_mode` | string | `"landscape"` | `landscape` / `always` / `landscape_or_tablet` |
| `reader_double_page_turn_step` | string | `"two"` | `one`（单页步进）/ `two`（双页步进） |

**历史兼容**：`flip` 自动映射为 `simulation`，`fade` 自动映射为 `scroll`。

#### 自动阅读 / 自动夜间（参与同步）

| 键名 | 类型 | 默认值 | 有效值 / 说明 |
|------|------|--------|------|
| `keep_screen_on` | boolean | `true` | 阅读时保持屏幕常亮 |
| `auto_page_seconds` | int | `10` | 自动翻页间隔秒数，范围 1-30 |
| `reader_menu_auto_hide` | boolean | `false` | 阅读菜单自动隐藏 |
| `reader_menu_persistent_actions` | boolean | `false` | 菜单常驻快捷操作 |
| `reader_auto_night_enabled` | boolean | `true` | 自动夜间模式开关 |
| `reader_auto_night_custom_policy` | string | `"ask"` | `ask`（首次询问）/ `override`（强制覆盖）/ `preserve`（保留自定义） |

#### TTS（参与同步）

| 键名 | 类型 | 默认值 | 有效值 / 说明 |
|------|------|--------|------|
| `tts_engine` | string | 有 MiMo Key→`"mimo"`，否则→`"system"` | `system` / `mimo` |
| `tts_rate` | float | `1` | 语速，范围 0.5-2.0 |
| `tts_mimo_api_key` | string | `""` | 小米 MiMo TTS API Key（参与同步，恢复时直接覆盖本地） |
| `tts_mimo_voice` | string | `"冰糖"` | `冰糖` / `茉莉` / `苏打` / `白桦` |
| `tts_system_engine` | string | `""` | 系统 TTS 引擎包名（Android 特有） |

#### 主题 / 外观（参与同步）

| 键名 | 类型 | 默认值 | 有效值 / 说明 |
|------|------|--------|------|
| `app_theme_mode` | string | `"system"` | `system`（跟随系统）/ `light` / `dark` |
| `reader_ui_theme_mode` | string | `"follow_app"` | `follow_app`（跟随应用）/ `system` / `light` / `dark` |
| `app_light_style_variant` | string | `"yunbai"` | `yunbai` / `yaobai` |
| `app_dark_style_variant` | string | `"yemu"` | `yemu` / `jiye` |
| `reader_theme` | string | `"paper"` | 阅读区主题名称（自定义主题在 `custom_themes` 表中） |
| `reader_background_path` | string | `""` | 背景图片绝对路径（同步时仅传文件名，恢复时 rebase 到本地背景图目录） |
| `background_blur_percent` | int | `0` | 背景模糊百分比，范围 0-100 |
| `glass_opacity_percent` | int | `80` | 毛玻璃不透明度，范围 20-100 |

#### 书架布局（参与同步）

| 键名 | 类型 | 默认值 | 有效值 |
|------|------|--------|--------|
| `bookshelf_view_mode` | string | `"card"` | `card` / `list` |
| `bookshelf_show_add_entry` | boolean | `true` | 书架显示添加入口 |
| `home_bottom_nav_style` | string | `"icons"` | `icons` / `text` |
| `home_nav_portrait_mode` | string | `"auto"` | `auto` / `bottom` / `sidebar` |
| `home_nav_landscape_mode` | string | `"auto"` | `auto` / `bottom` / `sidebar` |
| `home_sidebar_presentation` | string | `"slide"` | `slide` / `fixed_wide` |
| `home_fixed_sidebar_style` | string | `"full"` | `full` / `icons` |
| `transition_motion_mode` | string | Android 14+→`"fluid"`，否则→`"simple"` | `simple` / `fluid` |

#### 其他（参与同步）

| 键名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `reading_time_tracking_enabled` | boolean | `false` | 阅读时间统计开关 |
| `reading_stats_device_id` | string | 自动生成 UUID | 阅读统计设备标识（本机保留，不参与同步恢复） |

### Android 私有设置同步 JSON 格式

WebDAV 备份/恢复通过 `android-settings.json` 文件同步 Android 私有设置。该文件位于 WebDAV 的 `<settings_subdir>/android-settings.json`（默认路径：`PacilRead/android-settings/android-settings.json`）。

JSON 格式：

```json
{
  "platform": "android",
  "schemaVersion": 1,
  "auto_open_last": false,
  "font_size_sp": 18.0,
  "font_family": "system_default",
  "font_weight": 400,
  "reader_text_color": "theme_default",
  "line_spacing_extra": 8.0,
  "...": "... 其他 ANDROID_PRIVATE_SYNC_KEYS 中包含的键 ...",
  "reader_background_file": "my_background.jpg"
}
```

### JSON 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `platform` | string | 固定为 `"android"`。桌面端若需同步自己的设置，应使用自己的平台标识（如 `"desktop"` / `"windows"` / `"macos"`），避免与 Android 设置冲突。 |
| `schemaVersion` | integer | 当前为 `1`。用于未来格式演进时做版本兼容判断。 |
| `reader_background_file` | string | 仅文件名（如 `my_background.jpg`），不是完整路径。恢复时拼接到本地背景图目录。若为空字符串，恢复时清除背景设置。 |
| 其他字段 | 混合 | 全部来自 `ANDROID_PRIVATE_SYNC_KEYS` 白名单（共 55 个键），不在白名单中的键不会被导出。 |

### 同步范围与键分类

设置键分为三类：

**A 类 — 参与 Android 私有设置同步**（`ANDROID_PRIVATE_SYNC_KEYS`，55 个键）：
- 阅读器偏好（字体/间距/翻页/TTS/主题）
- 书架布局
- HUD 配置
- 自动阅读/夜间模式

**B 类 — 本机保留，不参与同步恢复**：
- WebDAV 连接信息（`webdav_url`, `webdav_user`, `webdav_password`, `webdav_dir`, `webdav_settings_subdir`）
- 同步范围开关（`webdav_sync_bookshelf`, `webdav_sync_files`, `webdav_sync_ui_settings`, `webdav_sync_themes`, `webdav_sync_backgrounds`, `webdav_sync_reading_stats`, `webdav_clean_remote_orphans`）
- 备份时间戳（`webdav_last_full`, `webdav_last_lite`）
- 设备 ID（`reading_stats_device_id`）

**设计意图**：WebDAV 连接信息每台设备可能不同（不同用户/不同服务器），强制同步会导致恢复后连接信息被覆盖。同样，阅读统计设备 ID 用于区分不同设备的阅读时长，不应跨设备共享。

**C 类 — 浮点精度特殊处理**（`FLOAT_SYNC_KEYS`，4 个键）：
- `font_size_sp`, `line_spacing_extra`, `tts_rate`, `letter_spacing`

这 4 个浮点键在 JSON 导入时强制以 `Float` 类型写入。其他数字键（如 padding、indent）以 `Integer` 类型写入。桌面端处理 JSON 时需注意数字类型区分：
- Python：`json.load()` 默认将带小数点的数字解析为 `float`，不带小数点解析为 `int`，通常自然符合要求。
- 静态类型语言：应检查 JSON 数值是否包含小数点来判断写入 float 还是 int。

### 桌面端设置存储方案建议

桌面端有两种策略：

**方案一：模拟 SharedPreferences（推荐，兼容性最好）**

```
使用 JSON 文件存储全部设置（键名与 Android 完全一致）。
WebDAV 恢复时：
  1. 下载 android-settings.json
  2. 提取 A 类键写入本地设置（略过 B 类键）
  3. 处理 reader_background_file：下载对应背景图到本地目录，更新 reader_background_path

WebDAV 备份时：
  1. 导出 A 类设置到 JSON（platform 设为自己的平台标识）
  2. 上传 JSON + 引用的背景图文件
```

**方案二：独立平台设置 + 桥接层**

```
桌面端使用自己的设置键名体系。
WebDAV 恢复/备份时通过映射表转换键名。
```

**推荐方案一**，因为 WebDAV 同步格式已固定为 Android 的键名，模拟 SharedPreferences 可最大程度复用现有格式，减少映射错误。

### 设置快照的 WebDAV 路径规则

默认 WebDAV 目录结构：

```
<PacilRead/>                      ← webdav_dir（备份根，可配置）
├── reader.db                     ← 主数据库
├── chapter_text/                 ← 章节正文
├── covers/                       ← 封面
├── books/                        ← 源文件（可选）
└── <android-settings/>           ← webdav_settings_subdir（可配置，默认 android-settings/）
    ├── android-settings.json     ← Android 私有设置快照
    └── backgrounds/              ← 背景图（仅设置快照引用的背景图存于此目录）
        └── my_background.jpg
```

背景图路径恢复逻辑：
1. 读取 `android-settings.json` 中的 `reader_background_file` 字段。
2. 从 WebDAV 的 `<settings_subdir>/backgrounds/<reader_background_file>` 下载背景图。
3. 写入本地背景图目录（Android: `getFilesDir()/backgrounds/`，桌面端: `<data_dir>/backgrounds/`）。
4. 更新 `reader_background_path` 为本地绝对路径。
5. 若 `reader_background_file` 为空字符串，清除本地背景设置。

### 桌面端恢复设置时保留的本地键

从 WebDAV 恢复 Android 设置时，以下键 **不应被覆盖**（保留本地值）：

- 所有 `webdav_*` 开头的键（连接信息和同步范围）
- `reading_stats_device_id`

Android 端 `importAndroidPrivateSettingsJson()` 通过 `ANDROID_PRIVATE_SYNC_KEYS` 白名单过滤实现。桌面端应使用相同的白名单过滤逻辑。

### 全量备份中设置的处理顺序

```
备份时：
  1. 先上传 reader.db + 资源文件
  2. 再导出 Android 私有设置 JSON 并上传
  3. 上传引用的背景图

恢复时：
  1. 先下载 reader.db + 资源文件
  2. 再下载 android-settings.json
  3. 根据 JSON 中的 reader_background_file 下载背景图
  4. 导入设置（仅导入白名单键）
  5. 刷新 UI 反映新设置
```
