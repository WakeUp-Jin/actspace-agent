## [2026-07-27 23:00] | Task: 实现 ActSpace 官网与公开内容站

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 按已定稿规范开始实现 ActSpace 介绍网站。工程位于 `packages/site`，包含主页、文档、博客和更新页；使用 C Cloud Expanse 主视觉，暂不引入 Sharp，并通过 GitHub Actions 部署。

### 🛠 Changes Overview

**Scope:** `packages/site`、root workspace scripts、GitHub Actions、架构与交付文档

**Key Actions:**

- **[Site Foundation]**: 新增 Astro 7 静态 workspace、Content Layer schema、语义主题 token、共享 Header/Footer/SEO、GitHub project Pages base-path helper 和无第三方遥测的构建脚本。
- **[Homepage]**: 以 C Cloud Expanse 和真实脱敏桌面截图实现连续 Hero、产品判断、三项核心价值、产品能力切换、开源架构、最新更新、最新博客和最终 CTA。
- **[Updates]**: 使用 GFM Markdown AST 解析 `docs/releases/feature-release-notes.md`，校验表头、日期、月份和必填字段，生成稳定锚点、按月时间线与首页最近三条；补 7 个 parser 测试。
- **[Docs]**: 建立 10 篇首批公开文档、文档首页、三栏文章布局、标题搜索、移动端折叠导航、当前页目录、Shiki 双主题与代码复制。
- **[Blog]**: 建立 Claude 风格卡片列表、窄阅读文章页、原创 SVG 封面、阅读时长、Article JSON-LD，并在有已发布文章时接入首页。
- **[Delivery]**: CI 显式检查、测试和构建官网；新增固定完整 SHA 的 Astro + GitHub Pages workflow，从 monorepo 根安装依赖并发布 `packages/site/dist`。
- **[Visual QA]**: 在生产预览中验收 1440px 与 390px、浅色与深色、文档搜索、产品 Tab、404 和控制台；修复图片固有高度导致的 Hero 覆盖，以及深色代码高亮对比度。

### 🧠 Design Intent (Why)

官网需要从一次性介绍页升级为长期内容产品，因此主页、公开文档、博客和更新记录共享同一套静态交付、主题与导航契约，同时保持各自不同的阅读语法。Release 继续以仓库 Markdown 为唯一事实来源，避免网站复制出第二份更新文案。站点从 monorepo 根构建，既能读取 release 数据，也能复用根 lockfile；Sharp 和响应式衍生图在真实部署性能测量前暂缓，先保证结构、内容与视觉正确。

### 📁 Files Modified

- `packages/site/**`
- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/site-pages.yml`
- `docs/ARCHITECTURE.md`
- `docs/CICD.md`
- `docs/QUALITY_SCORE.md`
- `docs/design-docs/website-introduction-site-design.md`
- `docs/exec-plans/completed/20260727-actspace-site-v1.md`
- `docs/learnings/2026-07/static-content-sites-need-build-contracts.html`

### ✅ Validation

- `pnpm check:site`、`pnpm test:site`、GitHub Pages base-path production build、`pnpm typecheck`、`pnpm build` 通过。
- `pnpm check:frontend-theme`、`pnpm check:docs`、`pnpm check:repo`、`pnpm check:secrets`、`pnpm check:actions` 与 `git diff --check` 通过。
- 生产预览完成首页、文档、博客、更新日志、404、深色主题、移动端与主要交互验收，控制台无错误。
- 完整 `pnpm test` 在沙箱外重跑后仅余一个与本次站点改动无关的 `agent-core` 旧断言：`manager.test.ts` 仍期望旧的权限拒绝文案；其余 842 个 `agent-core` 测试通过。
