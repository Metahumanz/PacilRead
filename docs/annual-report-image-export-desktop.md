# 桌面端年度报告图片版导出实现说明

本文说明桌面端如何在现有年度报告 HTML/JSON 导出基础上增加 PNG 图片版年度报告。目标是和移动端保持同一产品口径：支持「阅读杂志感」和「Wrapped 风格」两套模板，并在导出前选择浅色或深色。

## 目标

- 新增年度报告 PNG 导出，用于本地保存和社交分享。
- 保留现有 HTML/JSON 导出能力，不改变阅读统计数据口径。
- 图片尺寸固定为 `1080 x 1920`，便于手机相册、聊天软件和社交平台展示。
- 支持四种组合：杂志浅色、杂志深色、Wrapped 浅色、Wrapped 深色。
- 标签/系列只从已同步的书籍元数据读取，不新增标签/系列管理 UI。

## 现有基础

- 年度报告数据结构在 `src/utils/readingInsights.ts`：
  - `AnnualReadingReport`
  - `buildAnnualReadingReport(rows, books, year)`
  - `buildAnnualReportHtml(report)`
- 年度报告导出入口在 `src/composables/useReadingStats.ts`：
  - `createAnnualReadingReport(year?)`
  - `exportAnnualReadingReport(format: 'html' | 'json')`
- 统计页按钮入口在 `src/components/ReadingStatsView.vue`：
  - 当前已有「导出 HTML」和「导出 JSON」按钮。
- Electron 侧已有文本保存能力：
  - `window.electronAPI.dialog.saveTextFile(...)`
  - 类型声明在 `src/vite-env.d.ts`。

## 推荐实现

新增图片导出函数：

```ts
export type AnnualReportImageTemplate = 'magazine' | 'wrapped'
export type AnnualReportImageTheme = 'light' | 'dark'

export async function exportAnnualReadingReportImage(options: {
  template: AnnualReportImageTemplate
  theme: AnnualReportImageTheme
  year?: number
}): Promise<void>
```

实现流程：

1. 调用 `createAnnualReadingReport(options.year)` 获取 `AnnualReadingReport`。
2. 将报告数据、模板、主题传给隐藏渲染组件。
3. 使用 DOM/CSS 渲染一张固定尺寸卡片。
4. 使用 `html-to-image` 转为 PNG。
5. 调用 Electron IPC 保存二进制文件。

建议新增依赖：

```bash
npm install html-to-image
```

建议新增组件：

```text
src/components/reports/AnnualReportImageCard.vue
```

该组件只负责图片内容渲染，不负责保存文件。推荐 props：

```ts
interface AnnualReportImageCardProps {
  report: AnnualReadingReport
  template: 'magazine' | 'wrapped'
  theme: 'light' | 'dark'
}
```

组件根节点固定尺寸：

```css
.annual-report-image {
  width: 1080px;
  height: 1920px;
  overflow: hidden;
}
```

渲染时将组件挂到屏幕外容器，例如：

```css
.report-export-stage {
  position: fixed;
  left: -99999px;
  top: 0;
  width: 1080px;
  height: 1920px;
  pointer-events: none;
}
```

## Electron 保存 IPC

现有 `saveTextFile` 不适合 PNG。建议新增二进制保存接口：

```ts
saveBinaryFile: (options: {
  defaultPath: string
  dataUrl: string
  filters?: Array<{ name: string; extensions: string[] }>
}) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>
```

主进程处理要点：

- 使用 `dialog.showSaveDialog` 选择保存路径。
- 从 `data:image/png;base64,...` 中取出 base64 内容。
- 使用 `Buffer.from(base64, 'base64')` 写入文件。
- 默认文件名：

```text
PacilRead-2026-年度报告-magazine-light.png
PacilRead-2026-年度报告-wrapped-dark.png
```

同时更新 `src/vite-env.d.ts` 中的 `ElectronAPI.dialog` 类型声明。

## 模板设计

### 阅读杂志感

适合 PacilRead 的默认模板，安静、精致、偏阅读手账/杂志页。

内容结构：

- 顶部：`PACILREAD · YEAR IN READING`、年份标题、年度总结句。
- 中部：四个指标卡片，展示阅读时长、阅读字数、阅读天数、最长连续。
- 下部：Top 书籍、常读作者、常读标签、常读系列。
- 底部：12 个月月度趋势图和生成来源。

浅色建议：

- 背景：暖白、纸张色。
- 文字：深灰、墨色。
- 强调色：墨绿、赭色、低饱和蓝。

深色建议：

- 背景：深墨、深棕灰。
- 文字：柔白、暖灰。
- 强调色：青绿、柔金、低亮度蓝。

### Wrapped 风格

适合更强分享感的模板，使用大数字、强对比色块和节奏感布局。

内容结构：

- 顶部：`PACILREAD WRAPPED`。
- 主视觉：年度阅读小时数或总字数大数字。
- 中部：最长连续、完成书籍、阅读天数三个高对比指标。
- 下部：年度 Top 书籍、作者/标签 chip、月度节奏条。
- 底部：PacilRead Mobile/Desktop 品牌和年份。

浅色建议：

- 背景：明亮浅底。
- 强调色：蓝紫、绿色、橙色。
- 卡片：白底或浅色半透明。

深色建议：

- 背景：近黑、深紫黑。
- 强调色：亮蓝紫、荧光绿、暖橙。
- 卡片：深色高对比面板。

## UI 流程

在 `ReadingStatsView.vue` 顶部导出按钮区新增「导出图片」按钮，仅全局统计页显示，单书详情页不显示。

点击后弹出导出选项：

- 模板：
  - 阅读杂志感
  - Wrapped 风格
- 主题：
  - 浅色
  - 深色

默认选择：

- 模板默认 `magazine`。
- 主题默认跟随当前 App 明暗模式；如果无法可靠判断，则默认 `light`。

确认后调用：

```ts
await exportAnnualReadingReportImage({
  template: selectedTemplate,
  theme: selectedTheme,
})
```

无年度数据时：

- 不进入保存流程。
- 提示「今年还没有足够的阅读统计」。

## 排版规则

- 书名、作者、标签、系列必须设置最大行数和省略号。
- 大数字区域不能被单位文字挤压。
- 月度趋势在 12 个月均为 0 时显示最小占位条或空状态文案。
- 中文字体使用系统字体栈即可，不额外打包字体。
- 图片导出时不要依赖页面当前滚动位置。
- 导出节点必须在截图完成后销毁，避免残留隐藏 DOM。

## 测试清单

- 运行逻辑测试：

```bash
npm run test:logic
```

- 运行构建或至少类型检查 + Vite 构建：

```bash
npm run build
```

- 手动验证：
  - 杂志浅色 PNG 可保存并打开。
  - 杂志深色 PNG 可保存并打开。
  - Wrapped 浅色 PNG 可保存并打开。
  - Wrapped 深色 PNG 可保存并打开。
  - 无数据时不导出并提示。
  - 少数据时布局不空洞。
  - 多数据时月度趋势正常。
  - 长书名、长作者、长标签、长系列不重叠、不越界。
  - 文件名包含年份、模板和主题。

## 与移动端保持一致

移动端本轮采用 Android Canvas 原生绘制 PNG；桌面端推荐 DOM/CSS + `html-to-image`。两端实现方式不同，但应保持以下一致：

- 数据口径一致：只使用 `AnnualReadingReport` 可表达的数据。
- 模板语义一致：`magazine` 和 `wrapped`。
- 主题语义一致：`light` 和 `dark`。
- 标签/系列只读取，不提供编辑 UI。
- 导出文件名包含年份、模板、主题。
