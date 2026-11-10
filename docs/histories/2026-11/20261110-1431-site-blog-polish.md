## [2026-11-10 14:31] | Task: 官网博客列表与文章页样式调整

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 我感觉博客的样式还有点问题，你看看要如何调整一下呢？

### 🛠 Changes Overview

**Scope:** `apps/site`（博客列表、博客文章页、Markdown 构建期插件）

**Key Actions:**

- **头条补摘要**：列表头条的标题右侧原先只有一行标题，空了一大块。现在标题下加摘要（最多三行）和「约 N 分钟阅读」。摘要每篇都渲染、只有 `.is-lead` 显示，切换分类后跟着头条走；普通卡片仍只列标题。
- **封面关键词不再折行**：字号从 `vw` 改成封面自己的容器宽度（`13.6cqw`）。之前 1100px 左右三列时「Team & Room」折成两行压在角色上，现在各断点比例一致。
- **封面关键词统一英文**：`调度与权限` → `Permissions`，`Bash 后台` → `Sandbox`。规范本来就写的是英文关键词，这两个中文词落到宋体上，和其他封面不是一套字。
- **文章头部**：元信息之间补上间隔点（规范写的是「分类 · 日期 · 作者 · 约 N 分钟」，实现里漏了）；摘要限制三行，有三篇的摘要是 300 多字的开场白，把头部撑得很高。
- **标题编号**：`一、发现` 这类中文数字编号之前不处理，h2 的编号是墨色、h3 的「1.1.」是紫色，层级反了。插件现在也拆中文数字（`hn-cjk`），博客里转紫并保留顿号；数字编号和标题文字的间距从 .1em 加到 .4em（原来是「1.1.Bash」贴在一起）。
- **漏出的星号**：`将**元信息（名称+描述）**加载` 这种紧贴中文标点的粗体，CommonMark 不认，页面上直接显示 `**`（三篇文章共四处）。插件在段落和列表项里把单个文本节点内成对的 `**…**` 补成 `strong`，原文不动。
- **正文细节**：无序列表方块从 `--site-accent-line` 改为紫色 50% 透明度（原来在画布上几乎看不见）；表格单元格顶对齐、行高 1.65，表格内改用 `overflow-wrap: break-word`，手机上行内代码不再被拦腰折断，放不下时表格横向滚动。
- **上一篇 / 下一篇缩略图**：插画放大 1.6 倍（原来角色只有十几像素），浅色封面加描边（原来在纸面卡片上看不出有缩略图）。

### 🧠 Design Intent (Why)

只修看得见的毛病，不动 Q2 列表和 R3 + M2 文章页的结构。头条加摘要改了「只放标题」这条，范围限定在头条：那一行右半边原本是空的，普通卡片保持原样。

没有做的：长文章的页内目录。规范里明确去掉了右侧栏，这属于加功能而不是修样式，留给用户决定。

### ✅ Verification

- `pnpm check`、`pnpm test`（33 个，新增 2 个插件用例）、`pnpm build` 通过。
- puppeteer 在 390 / 820 / 1100 / 1440 四个宽度跑了列表和 11 篇文章：没有横向滚动，正文里没有残留的 `**`，封面关键词都是单行；`?category=` 直达后头条和摘要落在新的第一篇上。

### 📁 Files Modified

- `apps/site/src/pages/blog/index.astro`
- `apps/site/src/pages/blog/[...slug].astro`
- `apps/site/src/styles/blog.css`
- `apps/site/src/styles/blog-article.css`
- `apps/site/src/lib/blog-presentation.ts`
- `apps/site/src/lib/markdown/prose-plugins.mjs`
- `apps/site/src/lib/test/markdown-plugins.test.ts`
- `apps/site/DESIGN.md`
