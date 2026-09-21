## [2026-09-20 21:56] | Task: 调整官网页头 GitHub 入口

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-5
- **Runtime**: Codex desktop

### 📥 User Query

> 参考同类产品页头，将导航移到 Logo 一侧，右侧增加 GitHub 图标并保留快速开始按钮；暂不增加翻译等未实现能力。

### 🛠 Changes Overview

**Scope:** `apps/site` 官网页头与响应式导航。

**Key Actions:**

- 桌面端将站内导航紧邻品牌放置，右侧增加带可访问名称的 GitHub 图标、分隔线和快速开始按钮。
- 移动端隐藏 GitHub 图标并将入口加入展开菜单；360px 以下隐藏品牌文字，避免 CTA 与菜单拥挤。
- 同步官网设计规范，不引入翻译、主题、登录或其他未实现入口。

### 🧠 Design Intent (Why)

减少页头与首屏重复的“开始使用”表达，同时让开源仓库成为稳定、易发现的次级入口。页头只呈现当前真实可用能力。

本次属于局部信息层级与响应式样式调整，不新增独立学习文档。

### 📁 Files Modified

- `apps/site/src/components/SiteHeader.astro`
- `apps/site/src/styles/global.css`
- `apps/site/DESIGN.md`
- `docs/histories/2026-09/20260920-2156-site-header-github.md`

### Validation

- `pnpm check:site`：56 个文件，0 errors/warnings/hints。
- `pnpm test:site`：4 个测试文件，23 项测试通过。
- `SITE_URL=https://example.com SITE_BASE=/ pnpm build:site`：44 个页面构建通过；另以 `SITE_BASE=/actspace-agent` 构建并通过本地预览检查。
- `git diff --check` 通过；宽屏预览确认 Logo、导航、GitHub 图标、分隔线和快速开始按钮的层级；移动断点通过源码检查确认菜单内 GitHub 入口与 360px 品牌收缩规则。
- 构建仍显示仓库已有的 Shiki 语言名称回退提示，未由本次页头改动引入。
