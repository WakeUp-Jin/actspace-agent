# 官网首页改版与全站轻量统一 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260926-site-homepage-redesign.md`
- **执行模式**：交互
- **开始时间**：2026-09-26 08:05
- **结束时间**：2026-09-26 08:45（T10 待用户截图）

## 执行时间线

### 步骤 0：确认与基线

- **操作**：开工前向用户确认紫色规则（全站唯一强调色、每屏最多两处大面积），用户同意。重新读取 demo 当前版本。记录基线。
- **验证**：`check` 0/0/0；`test` 23 个通过（交接里写的 17 个已过时）；`build` 45 页。

### 步骤 1：T9 提前 + T1 Token 与字体

- **操作**：grep 发现 `--site-hero-*`、`--site-inverse-*`、`--site-backdrop` 只被 `components/home/*` 与 `DocsTabs` 引用，而这些正是 T9 要删的文件，于是先逐个 grep 确认 T9 文件零引用后删除，再重写 `tokens.css` 为单个 `:root`。
- **影响文件**：`tokens.css`、`global.css`（`::selection`）；删除 14 个文件（见摘要）。
- **决定**：`--site-page` 保留实际生效的 1600px 版本（第二个 `:root` 覆盖后的值），而不是 demo 的 1280px，避免文档、博客版宽变化。`--site-focus` 保留为 `var(--site-accent)` 的别名，旧引用不用改。
- **验证**：`grep -rn "site-hero-\|site-inverse-" src` 为空；`check` 通过。

### 步骤 2：T3 页头、按钮、链接、页脚

- **操作**：导航紫条、页头模糊、按钮 gap 10px + 箭头动效 + 按下缩放、`.text-link` 同步；页脚改为一行 Logo + 导航 + 版权；共享 `.site-tag`、`.nowrap`、`.arrow`。
- **影响文件**：`global.css`、`SiteFooter.astro`。

### 步骤 3：T4 首页结构 + T5 展示区

- **操作**：重写 `index.astro`；`screenshots.json` 新增 36 `review-workspace.png`，`context-detail.png` 标 `needs-retake`；`FeatureShowcase.astro` 加 16:10 底板、进度条、“了解 X”空格规则；`showcase.css` 重写；`showcase.ts` 同步进度条与媒体查询。
- **决定**：
  - 底板里的图最初用 `width:auto + max-width:100cqw + max-height:100cqh`，但懒加载图片未加载时宽度可能塌成 0。改为构建期从图片元数据写入 `--shot-ratio`，`.product-shot { width: min(100cqw, 100cqh * ratio) }`，加载前就占住正确尺寸。
  - 增强态媒体查询加上 `min-height: 700px`（CSS 与脚本同一条件），矮屏退回顺序流，落实计划里的风险应对。
- **验证**：`check` 0/0/0。

### 步骤 4：T2 Logo 透明化

- **操作**：一次性 Node + sharp 脚本（未入库）：
  - 背景：从四边 flood fill，条件为 `d = max(255−r, 254−g, 251−b) ≤ 14`（实测背景约 `(255,254,251)`，d 基本 ≤ 7）。
  - 边缘带：背景向内扩 3px。
  - 只对边缘带像素，分别以深色圆环 `(40,42,50)` 和浅紫 `(180,162,227)` 为前景，把像素投影到“白 → 前景”连线上反解 α，取残差小的那个；α < 0.04 记为 0，> 0.97 记为 1；其余反预乘恢复颜色。
  - 带外像素一律 α = 1。
- **决定**：没有采用计划写的“按亮度算 alpha”——浅紫身体亮度约 0.68，会只剩约 30% 不透明。
- **影响文件**：`src/assets/brand/actspace-logo.png`（覆盖）、`actspace-logo-source.png`（原图）、`public/media/actspace-logo.png`。
- **验证**：`sips -g hasAlpha` 为 yes；在深色、画布色、浅紫底上 3 倍放大检查，无白晕、无发灰；页头页脚截图无白框。未启用 multiply 回退。

### 步骤 5：T6–T8 文档、博客、更新日志

- **操作**：`DocsLayout.astro` 删除被覆盖的 `--site-focus` 旧规则，当前项加紫色内边线与字重 500；`prose.css` 链接紫色下划线、h2/h3 600；`blog.css` 复选框紫色、卡片悬停紫边上移；`UpdateTimeline.astro` 使用 `.site-tag`，`global.css` 加 `:target` 高亮与 h2 600。
- **决定**：`:target` 高亮最初用左侧 3px 线，但更新日志条目没有左内边距，线会贴住日期。改为 `:target` 时左右各外扩 24px（负外边距 + 同等内边距，文字不动）的浅紫圆角底，2.4s 后淡出。

### 步骤 6：截图对照与修正

- **操作**：重写 `/tmp` 下的 CDP 截图脚本（滚动改为 `behavior: 'instant'`，因为 `html` 设了平滑滚动）。首页 1440/1100/760/390，文档/博客/更新日志 1440，文档 390，更新日志锚点跳转。
- **发现并修正**：
  1. 增强态 `.showcase-step` 仍继承基础的 `.9fr / 1.1fr` 两列，文字栏只有约 200px → 增强态改为单列。
  2. 底板里显示了图注，把图片顶偏 → 展示区 `showCaption={false}`（alt 仍在）。
  3. 1100px 下 h1“空间”单独成第三行（demo 同样如此）→ 流体字号 6vw 改为 5.6vw，1440 仍封顶 80px。
- **验证**：修正后各宽度与 demo 一致；截图底部的黑色胶囊是 Astro dev toolbar，不属于页面。

### 步骤 7：T11 文档同步

- **影响文件**：`apps/site/DESIGN.md`、`SHOWCASE_PLAN.md`、`SCREENSHOTS.md`、计划进度与索引、history、学习速记。

## 遇到的问题

- **问题**：计划 T1 要删的 token 仍有引用。
  - **原因**：引用者全是 T9 待删的旧组件。
  - **应对**：T9 提前与 T1 一起做。
- **问题**：亮度法去白底会误伤浅紫。
  - **应对**：改用前景/背景混合反解 α，见步骤 4。

## 跳过或推迟的事项

- T10 真实截图：需要用户在应用里拍，已在 `SCREENSHOTS.md` 写明要求；截图到位前沿用现有图。
- 删除 `components/home/` 后，`src/assets/hero/cloud-expanse.png`、`screenshots/context-and-approval.png`、`workbench-home.png`、`usage-overview.png`、`kairos-runtime.png` 已无引用，计划没包含删素材，保留待用户决定。
- 博客详情“复制链接 ↗”是按钮而非链接，计划明确不改博客详情，保留。
