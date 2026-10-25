## [2026-10-25 13:15] | Task: 官网 V5 文档、博客与更新日志改版

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

三版原型确认后（文档 A4、博客终版、更新日志 U1），用户要求先补设计规范，再写执行计划，然后实施。首页不动。

### 变更与动机

- **Markdown 构建期插件**：原型在浏览器里处理 Markdown，现在改为 Sätteri hast 插件，在构建时生成图片 figure、emoji 提示块、代码卡、标题编号拆分和中英空格。首屏不闪，无 JS 也成立，文档和博客共用。`src/lib/markdown/`
  - 图片复用原 `img` 节点，所以 webp 优化保留。
  - 文档标题不补空格，以免中文锚点 slug 改变。
  - 代码高亮换成单一浅色主题 `actspace-paper`。
- **文档 A4**：`DocsLayout.astro` + `docs.css`。三栏布局、标题舞台、上一篇 / 下一篇、页内目录高亮。删除 `prose.css`。
- **博客 Q2 / R3 / M2**：
  - 列表只保留封面和标题，分类改为单选，删除搜索、排序和视图切换。
  - 详情页由封面色头部、M2 正文和上一篇 / 下一篇卡片组成。
  - 删除 `editorial.css` 和 `blog-sort.ts`。
- **更新日志 U1**：月份 + 时间轴 + 类型筛选；发布说明的行内 Markdown 补中英空格。
- **规范**：`apps/site/DESIGN.md` 按 V5 改写，与实现一致。

### 验证与边界

- check 0 错误；test 31 项通过；build 生成 46 页。
- 390 宽溢出探针与交互探针通过。
- 用户视觉验收通过。未验证：真实浏览器里的剪贴板复制。

### Files Modified

- `apps/site/DESIGN.md`、`apps/site/astro.config.mjs`
- `apps/site/src/lib/markdown/{cjk-spacing,prose-plugins,shiki-theme}.mjs`、`apps/site/src/lib/test/markdown-plugins.test.ts`
- `apps/site/src/layouts/DocsLayout.astro`、`apps/site/src/styles/{docs,blog,blog-article,updates,global,media}.css`
- `apps/site/src/pages/blog/{index,[...slug]}.astro`、`apps/site/src/lib/blog-presentation.ts`
- `apps/site/src/pages/updates/index.astro`、`apps/site/src/components/updates/UpdateTimeline.astro`
- `apps/site/src/lib/releases/render-inline-markdown.ts` 及其测试
- `apps/site/src/scripts/{code-copy,image-loading}.ts`、`apps/site/src/components/MediaViewer.astro`
- 删除：`apps/site/src/styles/{editorial,prose}.css`、`apps/site/src/scripts/{blog-sort,docs-copy}.ts`
- `docs/exec-plans/completed/20261025-site-v5-docs-blog-updates.md`、`docs/exec-plans/README.md`、`docs/exec-runs/20261025-site-v5-docs-blog-updates/`
