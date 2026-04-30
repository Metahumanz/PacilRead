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

### 读取章节正文

桌面端应按以下优先级读取章节正文：

```
1. 若 body_text_storage = 'file_gzip' 且 body_text_path 非空：
   → 读取 files/chapter_text/<body_text_path>，GZIP 解压后返回。
   → 若文件缺失，回退到第 2 步。

2. 若 body_text 非空：
   → 直接使用 body_text（兼容旧数据库）。

3. 两者皆无正文：
   → 该书章节标记为"正文缺失"，UI 提示用户重新导入。
```

参考伪代码：

```python
def get_chapter_body(chapter_row, data_dir):
    # data_dir 为桌面端数据根目录（相当于 Android getFilesDir()）
    if chapter_row.body_text_storage == 'file_gzip' and chapter_row.body_text_path:
        path = os.path.join(data_dir, 'chapter_text', chapter_row.body_text_path)
        if os.path.exists(path):
            with gzip.open(path, 'rt', encoding='utf-8') as f:
                return f.read()
        # 文件缺失，回退到数据库正文
    if chapter_row.body_text:
        return chapter_row.body_text
    return None  # 正文缺失
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
├── reader.db              # SQLite 数据库（必需）
├── chapter_text/           # 外置章节正文（必需，存在外置正文时）
│   └── book_<id>/
│       └── chapter_<id>.txt.gz
├── covers/                 # 封面图片（必需）
│   └── <cover_hash>.jpg
└── books/                  # 原始源文件（可选，仅用于保留导入用源文件）
    └── <title>.<ext>
```

- `reader.db` 是必需的，包含所有元数据。
- `chapter_text/` 目录：只要数据库中存在任意 `storage='file_gzip'` 的行，该目录即视为必需。缺失将导致对应章节正文无法恢复。
- `covers/`：封面图片，缺失不影响阅读但书架显示将缺少封面。
- `books/`：从 v7 开始降级为可选备份项。原始源文件不再作为阅读必需数据，仅用于用户希望保留导入源文件以备日后重新导入的场景。

### Android 上传示例（WebDAV full backup）

Android 全量备份调用 `WebDavClient.put()` 依次上传：

1. `reader.db`
2. `chapter_text/` 下所有文件（递归）
3. `covers/` 下所有文件
4. `books/` 下所有文件（如果用户勾选）

### 桌面端上传注意事项

桌面端上传时，确保：

- `reader.db` 最先上传，因为它是目录索引。
- `chapter_text/` 的相对路径结构与数据库中的 `body_text_path` 值保持一致。例如数据库存 `book_3/chapter_17.txt.gz`，则文件应位于 `chapter_text/book_3/chapter_17.txt.gz`。
- 路径分隔符统一使用正斜杠 `/`（WebDAV 和 ZIP 均使用正斜杠）。
- 上传时先创建 `chapter_text/` 目录（`MKCOL`），再为每本书创建 `book_<id>/` 子目录。
- 遍历数据库 `SELECT id, body_text_path FROM chapters WHERE body_text_storage='file_gzip' AND body_text_path IS NOT NULL`，逐文件上传。

## 全量下载与恢复规则

桌面端从远程拉取完整备份时，建议按以下顺序：

```
1. 下载 reader.db → 解析 books 和 chapters 行。
2. 下载 chapter_text/ → 放入对应本地目录。
3. 下载 covers/ → 放入对应本地目录。
4. 下载 books/ → 可选，放入对应本地目录。
```

恢复后校验：

- 遍历所有章节，检查 `storage='file_gzip'` 的行：对应的 `.txt.gz` 文件是否存在。
- 若文件缺失且 `body_text` 为空 → 该章节标记为"正文缺失"。
- 若文件缺失但 `body_text` 非空 → 正常（旧数据库兼容行，正文从数据库读取）。
- 数据库路径中的 `body_text_path` 值若为绝对路径，应将其 rebase 到本地数据目录。兼容 v7 时数据库仅存储相对路径，但处理旧数据时需防御。

## 深度瘦身流程

Android"优化数据库存储"按钮执行以下步骤。桌面端若需实现等效功能，可参考此流程：

```
1. 遍历所有存储模式为 'db' 的章节行。
2. 对每行：
   a. 读取 body_text 内容。
   b. 计算目录 files/chapter_text/book_<bookId>/，若不存在则创建。
   c. 将内容经 GZIPOutputStream 写入 chapter_<chapterId>.txt.gz。
   d. 解压校验：读取压缩文件并与原始 body_text 逐字节比对。
   e. 校验通过后：
      - UPDATE body_text_storage = 'file_gzip'
      - UPDATE body_text_path = 'book_<bookId>/chapter_<chapterId>.txt.gz'
      - UPDATE body_text_size = <原始字节数>
      - UPDATE body_text = ''
3. 清空所有 body_html：
   UPDATE chapters SET body_html = '' WHERE body_html != ''。
4. 执行 PRAGMA wal_checkpoint(TRUNCATE) 将 WAL 写入主文件。
5. 执行 VACUUM 回收磁盘空间。
6. 刷新数据库和各存储目录的空间占用统计，更新 UI 显示。
```

**注意事项**：
- 瘦身过程中若被中断，已完成的章节 `storage` 已更新为 `'file_gzip'`，未完成的仍为 `'db'`。再次点击按钮时跳过已完成章节即可继续。
- VACUUM 期间禁止其他写入操作。如果无法获取排他锁，跳过 VACUUM 并提示用户稍后重试。
- 清空 `body_html` 和 `body_text` 后，数据库文件体积应显著减小（通常减少 60%-90%，取决于正文占比）。

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

## 版本兼容矩阵

| 场景 | Android | 桌面端 |
|------|---------|--------|
| 读取 `storage='db'` 且 `body_text` 非空 | 直接读数据库 | 直接读数据库 |
| 读取 `storage='file_gzip'` | 优先读 `.txt.gz`，缺失回退 `body_text` | 优先读 `.txt.gz`，缺失回退 `body_text` |
| 新建书籍 | 写入 `.txt.gz`，`body_text` 写空 | 推荐写入 `.txt.gz`，`body_text` 写空 |
| 打开 v6 旧数据库 | 正常读取，可选择触发瘦身 | 正常读取，兼容模式工作 |
| 打开 v7 新数据库 | 正常（原生支持） | 正常（本文档规则） |
| 全量备份 | 包含 `chapter_text/` | 包含 `chapter_text/` |
| 全量恢复 | 下载全部目录，校验外置文件存在性 | 下载全部目录，校验外置文件存在性 |

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
