# 官网 V5：文档、博客与更新日志改版

## 目标

把 2026-10-25 抽卡确认的三版原型落到 `apps/site`，首页不动：

| 页面 | 原型 |
|---|---|
| 文档 | A4 小舞台 |
| 博客列表 | Q2 排印封面 + 角色插画，只列标题 |
| 博客详情 | R3 封面色头部 + M2 正文 + 上一篇 / 下一篇 |
| 更新日志 | U1 时间轴 |

原型里的 Markdown 处理在浏览器里跑（图片转 figure、提示块、代码卡、中英空格）。这次改成构建时的 Sätteri hast 插件，文档和博客共用。

## 范围

- 包含：
  - `apps/site` 中的文档布局、博客列表、博客详情、更新日志页面与样式。
  - Markdown 插件与自有 Shiki 主题。
  - `blog-presentation.ts` 补关键词与封面色表。
  - 更新日志条目补中英空格。
  - 删除不再使用的博客筛选脚本与样式。
  - 更新 `apps/site/DESIGN.md`。
  - 执行记录与 history。
- 不包含：
  - 首页（含首页更新条的「产品更新」胶囊）、开发计划页、404。
  - 文章与文档原文内容。
  - 深色模式。
  - 文档搜索。
  - 「这页有帮助吗」反馈机制：原型里只有文字，没有可用的提交方式，所以不做。

## 背景

- 相关文档：
  - `apps/site/DESIGN.md`：「Markdown 正文渲染」「文档」「博客列表」「博客详情」「更新日志」五节，已按 V5 改写。
  - 原型在 `docs/design-docs/site-v5/demos/`：
    - `docs-A4-mini-stage.html` + `docs-a-base.css`
    - `blog-final.html` + `blog-r.css`
    - `md-render.css`（`.m2`）+ `md-pipeline.js`
    - `updates-U1-timeline.html` + `updates-shared.css`
- 相关代码路径：
  - `apps/site/astro.config.mjs`
  - `src/layouts/DocsLayout.astro`
  - `src/pages/blog/index.astro`
  - `src/pages/blog/[...slug].astro`
  - `src/pages/updates/index.astro`
  - `src/components/updates/UpdateTimeline.astro`
  - `src/lib/blog-presentation.ts`
  - `src/lib/releases/render-inline-markdown.ts`
  - `src/styles/{prose,blog,editorial}.css`
  - `src/scripts/{docs-copy,blog-sort}.ts`
- 已知约束：
  - Sätteri 用户 hast 插件在 Shiki 高亮之后、图片标记与标题 id 之前运行（`@astrojs/markdown-satteri` 0.3.4）。插件可以返回新节点替换原节点，`text` 访问器可以 `setProperty(value)`。这一点已用小脚本验证过。
  - 文档正文里有中文锚点链接，例如 `#产品理念`。标题编号拆分必须保持标题的 textContent 不变，文档标题也不能补中英空格。
  - 站点只有浅色。代码高亮改为单一自有主题。

## 风险

- 风险：插件替换段落后，Astro 的本地图片优化标记（`__ASTRO_IMAGE_`）丢失，导致文章图变成原 PNG 或破图。
  - 缓解方式：替换时复用原 `img` 节点。构建后检查博客文章 HTML 里的图片仍是 `/_astro/*.webp`，`blog-assets` 测试照常通过。
- 风险：中英空格误改代码或链接地址。
  - 缓解方式：只改 text 节点；祖先里有 `pre` / `code` 时跳过，文档标题也跳过。为纯函数和插件写单元测试。
- 风险：删掉搜索、排序、视图切换属于功能减少。
  - 缓解方式：用户已确认 Q2 列表，规范写明这一点；`?category=` 直达保留。

## 里程碑

1. **T1 Markdown 插件。**新增以下文件：
   - `src/lib/markdown/cjk-spacing.mjs`：纯函数 `spaceCjk`，以及给 hast 树补空格的 `spaceHastTree`（`.mjs` 是因为 `astro.config.mjs` 要直接引用）。
   - `src/lib/markdown/prose-plugins.mjs`：结构插件负责 figure、callout、引用空段落、标题编号拆分、代码卡；另一个插件负责中英空格。
   - `src/lib/markdown/shiki-theme.mjs`：按 M2 配色写的 TextMate 主题。

   在 `astro.config.mjs` 注册，删掉 github-light/dark。测试放在 `src/lib/test/markdown-plugins.test.ts`。
2. **T2 代码复制脚本。**`src/scripts/code-copy.ts` 绑定 `.code-copy` 并取消按钮的隐藏状态，替代 `docs-copy.ts`（删除该文件）。
3. **T3 文档 A4。**改写 `DocsLayout.astro`：
   - 三栏布局、小舞台标题区（更新日期、阅读分钟、复制页面）。
   - 上一篇 / 下一篇，页脚「在 GitHub 上编辑 ↗」。
   - 页内目录「本页内容」加滚动高亮，移动端保留可折叠目录。

   样式放在 `src/styles/docs.css`（含文档正文 `.docs-prose`），`prose.css` 删除。阅读分钟数复用 `readingTime`。
4. **T4 博客列表 Q2。**
   - `blog-presentation.ts` 增加 `key` 和 `coverColors`。
   - 改写 `blog/index.astro`（分类单选、头条、封面 tile）。
   - `blog.css` 只保留列表样式；删除 `scripts/blog-sort.ts`。
5. **T5 博客详情。**
   - 改写 `blog/[...slug].astro`：R3 头部、`.md-m2` 正文、上一篇 / 下一篇。
   - 新增 `src/styles/blog-article.css`，含头部和 M2；删除 `editorial.css`。
6. **T6 更新日志 U1。**
   - 改写 `UpdateTimeline.astro` 和 `updates/index.astro`：月份行、时间轴、分类筛选、「最新」。
   - 新增 `src/styles/updates.css`。
   - `render-inline-markdown.ts` 在 sanitize 之后补中英空格，并补测试。
7. **T7 验证与收尾。**
   - 运行 check / test / build。
   - 在 1440×900、1100×800、390×844（iframe 探针）三种尺寸截图，并与原型对照。
   - 执行记录、history，计划移入 `completed/`，更新 README。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/site check`
  - `pnpm --filter @actspace/site test`
  - `pnpm --filter @actspace/site build`
- 手工检查：
  - dev 服务器（8765）上用 headless Chrome 截图以下页面：
    - `/docs/`、`/docs/bash/`（有代码与表格）
    - `/blog/`、`/blog/?category=多智能体`
    - `/blog/write-and-edit/`（代码、图片、提示块）
    - `/updates/`
  - 每页截 1440、1100 两个宽度，再用 iframe 探针检查 390 宽：`scrollWidth <= clientWidth`。
  - 在浏览器里点：分类切换、更新日志筛选、代码复制、复制页面、上一篇 / 下一篇、移动端目录折叠。
- 观测检查：
  - 构建产物里博客正文图片仍是 webp。
  - 文档中文锚点（`/docs/what-is-actspace/#产品理念`）仍能定位。

## 进度记录

- [x] 设计规范 `apps/site/DESIGN.md` 按 V5 改写。
- [x] T1 Markdown 插件与主题。
- [x] T2 代码复制脚本。
- [x] T3 文档 A4。
- [x] T4 博客列表 Q2。
- [x] T5 博客详情。
- [x] T6 更新日志 U1。
- [x] T7 验证与收尾：check / test / build 通过，截图与 390 探针、交互探针完成。
- [x] 2026-10-25 用户视觉验收通过，计划移入 `completed/`，提交并开 PR。

## 决策记录

- 2026-10-25：三处原型均由用户确认（文档 A4、博客终版、更新日志 U1）。用户要求按顺序推进：先改规范，再写计划，最后实施。
- 2026-10-25：Markdown 结构变换放在构建时的 hast 插件里，不在浏览器里跑。这样首屏不闪，无 JS 也成立，文档和博客共用；样式按容器分开。
- 2026-10-25：标题编号拆分保留原分隔符文本（博客用 CSS 隐藏），保证锚点 slug 不变。
- 2026-10-25：实施中修正：只有文档标题跳过中英空格，因为文档有 `#产品理念` 这类站内锚点链接；博客标题照常补空格。frontmatter 标题与摘要在渲染时调用 `spaceCjk`。
- 2026-10-25：文档标题保持 A4 原型的衬线；博客、更新日志标题用无衬线（用户在博客轮明确不要宋体标题）。

## 执行模式

- **交互模式**：用户在线，视觉结果需要用户对照原型确认。

## 执行文档

执行开始时创建 `docs/exec-runs/20261025-site-v5-docs-blog-updates/execution-process.md` 与 `execution-summary.md`。
