# 移动端书架云端阅读进度 UI 适配

## 目标

打开书架时立即展示本地书籍，随后在后台预取云端阅读进度。预取过程只更新书架标题下方的状态文字，不阻塞搜索、切换视图、打开书籍等操作。

桌面端采用以下约定，移动端应保持一致：

- 按当前书架排序预取前 6 本书。
- 每本书的云端进度检查结果缓存 5 分钟。
- 云端进度较新，或本地仍是第 0 章第 0 字符时，才应用云端进度。
- 远端进度文件不存在时静默跳过。
- 网络、HTTP 或 JSON 解析失败时继续展示本地进度，并短暂显示失败提示。
- 同步期间显示 `正在同步云端阅读进度 2/6...`。
- 任一失败发生后显示 `云端进度同步失败，已展示本地进度`，约 3 秒后恢复书籍数量。

## 当前移动端基础

移动端已有可复用实现，不需要重写同步协议：

- `BookshelfActivity.scheduleBookshelfProgressPrefetch()` 已按排序结果截取前 6 本并顺序预取。
- `WebDavProgressSyncCoordinator.BOOKSHELF_PREFETCH_LIMIT` 已设为 `6`。
- `WebDavProgressSyncCoordinator` 已提供 5 分钟新鲜期缓存、同一本书并发去重、远端新旧判断和本地落盘。
- `WebDavClient.downloadProgress()` 已负责 WebDAV 路径兼容、文件下载和 JSON 解析。

本次移动端只需补充书架 UI 反馈。

## BookshelfActivity 补丁清单

在 `BookshelfActivity` 增加以下状态：

```java
private static final long PROGRESS_PREFETCH_FAILURE_HINT_MS = 3000L;
private final Handler mainHandler = new Handler(Looper.getMainLooper());
private Runnable clearProgressPrefetchStatusRunnable;
private boolean progressPrefetchRunning;
private int progressPrefetchCurrent;
private int progressPrefetchTotal;
private boolean progressPrefetchFailed;
```

增加一个统一刷新标题下方文字的方法。普通状态继续使用当前书籍数量；预取状态优先显示同步进度；失败提示优先级最高。

```java
private void updateBookshelfStatsText() {
    if (progressPrefetchFailed) {
        statsText.setText("云端进度同步失败，已展示本地进度");
        return;
    }
    if (progressPrefetchRunning) {
        statsText.setText(String.format(
                Locale.SIMPLIFIED_CHINESE,
                "正在同步云端阅读进度 %d/%d...",
                progressPrefetchCurrent,
                progressPrefetchTotal
        ));
        return;
    }
    statsText.setText(String.format(
            Locale.SIMPLIFIED_CHINESE,
            "共 %d 本书籍",
            allBooks.size()
    ));
}
```

在 `scheduleBookshelfProgressPrefetch()` 中保留现有候选书籍、协调器调用和最终 `refreshBooks(false)` 逻辑，只补 UI 状态：

1. 创建 `candidates` 后，在主线程设置 `progressPrefetchRunning = true`、总数和初始进度。
2. 每次调用 `syncBookProgressIfNeeded()` 前，在主线程更新当前进度为 `index + 1`。
3. 捕获单本书异常时保留现有日志，并记录本轮存在失败。
4. 循环完成后，在主线程结束运行态；有失败时显示 3 秒失败提示，否则恢复书籍数量。
5. 若云端进度实际落盘，继续调用已有的 `refreshBooks(false)` 刷新卡片章节和日期。

建议增加两个小方法集中处理完成状态：

```java
private void finishBookshelfProgressPrefetch(boolean failed) {
    progressPrefetchRunning = false;
    progressPrefetchFailed = failed;
    updateBookshelfStatsText();
    if (!failed) {
        return;
    }
    if (clearProgressPrefetchStatusRunnable != null) {
        mainHandler.removeCallbacks(clearProgressPrefetchStatusRunnable);
    }
    clearProgressPrefetchStatusRunnable = () -> {
        progressPrefetchFailed = false;
        updateBookshelfStatsText();
    };
    mainHandler.postDelayed(
            clearProgressPrefetchStatusRunnable,
            PROGRESS_PREFETCH_FAILURE_HINT_MS
    );
}
```

书架本地加载、筛选条件变化、卡片刷新完成后，原本直接写入 `statsText` 的位置改为调用 `updateBookshelfStatsText()`，避免覆盖正在显示的云端同步状态。

## 不要修改

- 不要为书架预取调用 `showLoading()` 或显示整页 `layout_loading` 遮罩。
- 不要等待云端预取完成后才展示本地书架。
- 不要修改 `WebDavProgressSyncCoordinator` 的前 6 本限制和 5 分钟缓存。
- 不要修改移动端 `progressOffset` 语义。移动端继续使用章节字符偏移。
- 不要把远端 404 当作失败提示；远端没有对应进度文件属于正常情况。

## 验收清单

1. WebDAV 未开启时，打开书架只显示本地书籍数量，不出现同步提示。
2. WebDAV 已开启且书架有书时，本地卡片先出现，标题下方随后显示同步进度。
3. 超过 6 本书时，同一轮最多检查 6 本。
4. 云端进度较新时，预取完成后卡片章节和日期刷新。
5. 5 分钟内反复返回书架时，协调器跳过重复网络检查。
6. 远端文件不存在时不显示失败。
7. 断网或 HTTP 异常时，书架保持可操作，失败提示约 3 秒后恢复书籍数量。
8. 从书架打开已预取书籍时，阅读器继续按字符偏移定位，不出现页码和字符偏移混用。
