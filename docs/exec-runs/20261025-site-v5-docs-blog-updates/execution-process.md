# 官网 V5：文档、博客与更新日志改版 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261025-site-v5-docs-blog-updates.md`
- **执行模式**：交互
- **开始时间**：2026-10-25
- **结束时间**：2026-10-25 13:15

## 执行时间线

### 步骤 1：设计规范与计划

- **操作**：改写 `apps/site/DESIGN.md`。新增「Markdown 正文渲染（V5）」「博客正文 M2」「文档（A4 小舞台）」「博客列表（Q2）」「博客详情（R3 头部 + M2 正文）」「更新日志（U1 时间轴）」，替换旧的文档、博客、更新日志章节。随后写执行计划，并在 README 登记。
- **影响文件**：`apps/site/DESIGN.md`、`docs/exec-plans/completed/20261025-site-v5-docs-blog-updates.md`、`docs/exec-plans/README.md`。

### 步骤 2：T1 Markdown 插件与主题

- **操作**：
  - 新增 `src/lib/markdown/cjk-spacing.mjs`：`spaceCjk`、`spacedTextValue`、`spaceHastTree`。
  - 新增 `prose-plugins.mjs`。
    - `proseStructure`：图片段落转 figure、emoji 段落转 callout、删除引用里的空段落、拆分标题编号、生成代码卡。
    - `proseCjkSpacing`：补中英空格。
  - 新增 `shiki-theme.mjs`（`actspace-paper` 单主题）。
  - 在 `astro.config.mjs` 注册以上插件，删除 github-light/dark。
- **影响文件**：以上 4 个文件，加新增的 `src/lib/test/markdown-plugins.test.ts`（7 例）。
- **决定**：
  - 结构变换放在构建时的 hast 插件里，不在浏览器里跑。这样首屏不闪，无 JS 也成立。
  - 图片 figure 复用原 `img` 节点，保留 Astro 的 webp 优化。
  - 文件用 `.mjs`，因为 `astro.config.mjs` 要直接引用。
- **验证**：插件测试通过；构建产物里文章图片仍是 `/_astro/*.webp`。

### 步骤 3：T2 代码复制

- **操作**：新增 `src/scripts/code-copy.ts`，文档和博客共用。删除 `docs-copy.ts`。
- **验证**：CLI 文档 4 个、write-and-edit 11 个复制按钮都已显示。

### 步骤 4：T3 文档 A4

- **操作**：
  - 改写 `DocsLayout.astro`：三栏布局、小舞台标题区、上一篇 / 下一篇、「在 GitHub 上编辑 ↗」、「本页内容」滚动高亮、移动端折叠目录。
  - 新增 `docs.css`，删除 `prose.css`。
  - 图片加载与 MediaViewer 的选择器从 `.docs-prose` 放宽为 `.prose`，博客也能放大看图。
- **影响文件**：`DocsLayout.astro`、`docs.css`、`image-loading.ts`、`MediaViewer.astro`、`media.css`。

### 步骤 5：T4 / T5 博客

- **操作**：
  - `blog-presentation.ts` 改为 `{category, cover, key}`，并增加 `coverColors`。
  - 列表页改为 Q2：分类单选、`?category=` 直达、头条。删除搜索、排序、视图切换和 `blog-sort.ts`。
  - 详情页改为 R3 头部 + `.md-m2` 正文 + 上一篇 / 下一篇卡片。
  - 新增 `blog-article.css`，删除 `editorial.css`。
- **影响文件**：`blog-presentation.ts`、`pages/blog/index.astro`、`pages/blog/[...slug].astro`、`blog.css`、`blog-article.css`。

### 步骤 6：T6 更新日志 U1

- **操作**：
  - 改写 `UpdateTimeline.astro` 和 `updates/index.astro`：月份行、时间轴、类型筛选、「最新」标记、`:target` 高亮。
  - 新增 `updates.css`；`global.css` 删除旧的 changelog 规则。
  - `render-inline-markdown.ts` 在 sanitize 之后补中英空格。
- **验证**：新增的发布说明测试通过。

### 步骤 7：T7 验证

- **操作**：
  - 在 dev 服务器（8765）上用 headless Chrome 截图：1440 宽 4 页，1100 宽博客分类页与文档，600 宽更新日志与文章。
  - 用 iframe 探针检查 390 宽下有无横向溢出，并检查交互。
- **验证**：见执行摘要。

## 遇到的问题

- **问题**：更新日志测试期望「在 `<code>中文cwd</code>`」之间有空格，实际没有补上。
  - **原因**：交界处只按首尾字符判断，而行内代码以中文开头。
  - **处理**：中文紧贴 `code` 元素时总是补空格。
- **问题**：`astro check` 报主题 `type` 是 `string`。
  - **处理**：用 JSDoc const 断言。
- **问题**：dev 页面上看不到代码卡和空格，但构建产物正确。
  - **原因**：旧的 dev 进程没有加载新配置。
  - **处理**：重启 dev 服务器，改用 astro 守护进程。
- **问题**：博客标题「FileWriteTool工具」没有补空格。
  - **原因**：最初所有标题都跳过空格处理。
  - **处理**：只跳过文档标题，因为文档有 `#产品理念` 这类锚点链接。frontmatter 标题与摘要在渲染时调用 `spaceCjk`。DESIGN.md 已同步。
- **问题**：1100 宽截图里 Bash 卡片没有角色图。
  - **原因**：headless 等待时间短，懒加载图片还没加载。延长等待后图片正常显示，不是代码问题。
