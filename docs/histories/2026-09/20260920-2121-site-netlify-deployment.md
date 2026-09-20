## [2026-09-20 21:21] | Task: 官网接入 Netlify Git 自动部署

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-6
- **Runtime**: Codex desktop

### 📥 User Query

> 将 site 官网博客修改为 Netlify 部署，明确需要增加哪些配置、是否需要流水线。

### 🛠 Changes Overview

**Scope:** 官网部署配置、CI、部署文档。

- 新增根目录 `netlify.toml`，从 monorepo 根构建，仅发布 `apps/site/dist`；Node 24，pnpm 版本沿用根 packageManager。
- 使用根路径 `/`，构建命令优先读取显式 SITE_URL，否则采用 Netlify 内置主站 URL。
- 使用 Git diff 跳过不影响官网的提交，覆盖官网源码、release/roadmap 文档与依赖配置；首次部署、历史缺失与同一 commit 重试继续构建。
- GitHub Pages 调整为手动备用，现有 CI 的站点构建改为验证根路径。
- 同步 Netlify 首次连接、域名绑定、重新部署与备用 Pages 的操作说明。

### 🧠 Design Intent (Why)

官网采用 Netlify 自带的 Git 构建发布流程，避免再维护 GitHub Actions 上传凭据。构建目录和发布目录分离，允许构建读取根文档，同时仅发布静态产物。GitHub CI 与 Netlify 部署独立，主线门禁通过分支保护配置。

本次属于简单部署配置调整，不单独生成学习文档。

### 📁 Files Modified

- `netlify.toml`
- `.github/workflows/site-pages.yml`
- `.github/workflows/ci.yml`
- `docs/CICD.md`
- `apps/site/CONTENT_SOURCES.md`

### Validation

- `pnpm check:site`：56 个文件，0 errors/warnings/hints。
- `pnpm test:site`：4 个测试文件，23 项测试通过。
- 模拟 Netlify URL 回退并设置 SITE_BASE=/ 的生产构建通过，生成 44 个页面；本地 Node 22.22.2，真实 Netlify Node 24 尚待验证。
- 44 个 HTML 的根路径与 canonical，以及 sitemap/robots 主站 URL 检查通过。
- TOML 解析通过；ignore 命令通过真实 Git 历史的相关/无关改动、首次部署、缺失历史、同 commit 重试检查。
- `pnpm check:docs`、`pnpm check:actions`、`git diff --check` 通过。
- 产物链接审计发现首页指向 `/_astro/skill-invocation.Cdf9NTNA.png` 的资源不存在，未改动对应页面；因此不能声称所有页面资源已完整验收。构建另有已有 Markdown 代码语言大小写导致的 Shiki fallback 提示。
- 未提交或推送；未连接 Netlify 账户。真实依赖安装、线上构建、发布、域名和 HTTPS 验收仍待完成。
