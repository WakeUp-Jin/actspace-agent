# ActSpace 官网与内容站 V1 实施计划

## 目标

在 `packages/site` 交付一个可独立开发、完整静态构建并通过 GitHub Pages 发布的 ActSpace 中文官网。站点必须落实 `Cloudfield & Ink / 云境与墨色` 设计语言，包含主页、公开文档、博客和更新页；更新数据只来自根目录 release 文档，公开内容与内部工程文档保持明确边界。

## 范围

### 包含

- 新建 Astro 静态站点 workspace：`packages/site`。
- 实现 `/`、`/docs`、`/docs/**`、`/blog`、`/blog/**`、`/updates`。
- 实现浅色、深色和 system 三态主题；所有组件只消费网站语义 token。
- 使用 C Cloud Expanse 作为主页连续 Hero 背景。
- 使用仓库现有真实桌面截图建立产品展示和文档首页。
- 使用 Astro Content Layer 管理公开 Docs 与 Blog Markdown。
- 构建时解析 `docs/releases/feature-release-notes.md`，生成更新页和主页最新三条更新。
- 为 release 解析、内容 schema 和稳定 URL 生成补充自动化测试。
- 新增 GitHub Pages workflow，完整 checkout monorepo 后构建和部署站点。
- 为站点补充 CI、SEO、可访问性、响应式和基础性能验证。
- 同轮更新设计文档、history、质量记录或其他因实现而过期的说明。

### 不包含

- 用户账号、登录、云端同步、CMS、数据库或评论系统。
- 在线运行 Agent、网页版桌面应用或虚构的云端执行能力。
- 未建立真实下载通道前的一键下载按钮。
- 没有真实检索链路的“向 AI 提问”。
- 多语言空壳、PR preview、第三方分析和默认遥测。
- 把 `docs/design-docs`、`docs/histories`、`docs/exec-plans` 或其他内部文档整体公开。
- 为缺失素材伪造产品截图；Browser 能力首版进入能力索引和公开文档，只有获得真实脱敏截图后才进入截图切换组。

## 背景

### 必读文档

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/website-introduction-site-design.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- `docs/FRONTEND.md`
- `docs/PLANS_GUIDE.md`
- `docs/CICD.md`
- `docs/SECURITY.md`
- `docs/SUPPLY_CHAIN_SECURITY.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/coding-standards/README.md`

### 现有事实

- `pnpm-workspace.yaml` 已覆盖 `packages/*`，无需新增 workspace glob。
- 当前仓库 Node.js 为 `v22.22.2`，满足 Astro 7 要求的 `>=22.12.0`。
- Astro 当前实施基线固定为 `7.1.3`，内容集合使用 `src/content.config.ts`、`defineCollection()` 和 `glob()` loader。
- `docs/releases/feature-release-notes.md` 是功能更新的唯一事实来源。
- 已确认 Hero 母版位于外部设计工作区，实施时必须复制进仓库后再引用：
  - `/Users/wakeup-jin/Desktop/wakeup-Jin-wiki/actspace-agent-hero-generator/actspace-agent-hero-images/C-cloud-expanse.png`
- 已有 HTML demo 只作为视觉与交互参考，不直接作为生产源码复制：
  - `/Users/wakeup-jin/.codex/visualizations/2026/07/27/019fa1a0-0dd2-7d60-a5fe-ba90aef58052/actspace-site-demo/index.html`
- 可公开候选截图位于 `docs/assets/readme/`。实施前逐张检查用户名、路径、会话正文和其他个人信息；不合格素材不得复制进站点。

### 技术基线

- `astro@7.1.3`
- `@astrojs/check@0.9.9`
- `@astrojs/sitemap@3.7.3`
- `typescript@6.0.3`，与 Astro 自身验证版本保持一致，不采用尚未验证的 TypeScript 7。
- `vitest@4.1.10`
- Release AST：
  - `unified@11.0.5`
  - `remark-parse@11.0.0`
  - `remark-gfm@4.0.1`
  - `mdast-util-to-string@4.0.0`
  - `remark-rehype@11.1.2`
  - `rehype-stringify@10.0.1`
  - `rehype-sanitize@6.0.0`
- 不引入 React、Vue、Svelte 或客户端 SPA runtime。

### 站点地址与 base 契约

- 默认 GitHub Pages 地址：`https://wakeup-jin.github.io/actspace-agent/`。
- `astro.config.mjs` 从环境变量读取：
  - `SITE_URL`，默认 `https://wakeup-jin.github.io`。
  - `SITE_BASE`，默认 `/actspace-agent`。
- 所有内部 URL 由 `src/lib/site-path.ts` 的 `sitePath()` 统一添加 `import.meta.env.BASE_URL`，组件不得手写 `/actspace-agent`。
- 自定义域名部署时设置 `SITE_URL=https://<domain>`、`SITE_BASE=/`，并在确定域名后单独添加 `public/CNAME`。

## 目标目录与文件契约

```text
packages/site/
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── public/
│   ├── brand/
│   │   ├── favicon.svg
│   │   └── og-default.svg
│   └── robots.txt
└── src/
    ├── assets/
    │   ├── hero/cloud-expanse.png
    │   ├── screenshots/
    │   └── blog/visible-runtime-space.svg
    ├── components/
    │   ├── blog/
    │   ├── docs/
    │   ├── home/
    │   ├── updates/
    │   ├── SiteHeader.astro
    │   ├── SiteFooter.astro
    │   ├── ThemeControl.astro
    │   └── SeoHead.astro
    ├── content/
    │   ├── blog/
    │   └── docs/
    ├── layouts/
    │   ├── BaseLayout.astro
    │   ├── BlogArticleLayout.astro
    │   └── DocsArticleLayout.astro
    ├── lib/
    │   ├── content.ts
    │   ├── docs-navigation.ts
    │   ├── site-path.ts
    │   ├── reading-time.ts
    │   └── releases/
    │       ├── model.ts
    │       ├── parse-release-notes.ts
    │       ├── render-inline-markdown.ts
    │       └── source-path.ts
    ├── pages/
    │   ├── index.astro
    │   ├── 404.astro
    │   ├── blog/
    │   │   ├── index.astro
    │   │   └── [...slug].astro
    │   ├── docs/
    │   │   ├── index.astro
    │   │   └── [...slug].astro
    │   └── updates/index.astro
    ├── scripts/
    │   ├── copy-code.ts
    │   ├── product-showcase.ts
    │   ├── reveal.ts
    │   ├── site-header.ts
    │   └── theme.ts
    ├── styles/
    │   ├── global.css
    │   ├── prose.css
    │   └── tokens.css
    └── content.config.ts
```

目录按真实使用创建，不预先保留空目录。

## 数据契约

### Docs frontmatter

```ts
interface PublicDocFrontmatter {
  title: string
  description: string
  group: "getting-started" | "core-concepts" | "guides" | "contributing"
  order: number
  updatedAt: Date
  draft: boolean
}
```

首批公开文档文件固定为：

```text
src/content/docs/what-is-actspace.md
src/content/docs/getting-started.md
src/content/docs/configure-a-model.md
src/content/docs/agent-turn.md
src/content/docs/context.md
src/content/docs/tools-and-approvals.md
src/content/docs/browser.md
src/content/docs/skills.md
src/content/docs/kairos.md
src/content/docs/contributing.md
```

内容只引用当前仓库可以证明的能力，不把内部设计稿原文直接公开。

### Blog frontmatter

```ts
interface BlogFrontmatter {
  title: string
  description: string
  publishedAt: Date
  updatedAt: Date
  authors: string[]
  tags: string[]
  draft: boolean
  cover: string
}
```

首篇文章实现为：

```text
src/content/blog/context-is-an-interface.md
```

题目为“为什么我们把 Context 当成界面，而不是隐藏的 Prompt”，从可观察性、工具披露、缓存与压缩解释可见运行空间，不重复 release 表格。

### ReleaseEntry

```ts
interface ReleaseEntry {
  date: string
  month: string
  area: string
  userValueHtml: string
  summaryHtml: string
  anchor: string
  sourcePath: "docs/releases/feature-release-notes.md"
}
```

解析约束：

- 从 `import.meta.url` 向上解析 monorepo 根目录，不依赖 `process.cwd()`。
- 只处理 `## YYYY-MM` 下表头完全匹配“日期 / 功能域 / 用户价值 / 变更摘要”的 GFM table。
- 校验四列、必填字段、`YYYY-MM-DD`、日期所属月份。
- 同月数据按日期倒序；同日保持源文件顺序。
- `anchor` 使用 `release-${date}-${dayIndex}`，同日序号从 1 开始，避免标题改动破坏 URL。
- 单元格只允许普通文本、inline code、emphasis、strong 和安全链接；通过 `rehype-sanitize` 去除原始 HTML、脚本和危险 URL。
- 错误消息包含源路径、月份和 AST `position.start.line`。
- 解析错误必须让测试和生产构建失败。

## 主题与视觉契约

- `tokens.css` 定义 light 和 dark 的 Canvas、Canvas Soft、Surface、Ink、Body、Muted、Line、Operational、Operational Soft、Warning、Danger。
- `html[data-theme="light"]`、`html[data-theme="dark"]` 与 `@media (prefers-color-scheme: dark)` 共同支持 light、dark、system-light、system-dark。
- 主题初始化脚本在首个绘制前写入 `data-theme`，避免明显闪烁；用户选择存入 `localStorage`。
- 组件 CSS 不出现 `text-black`、`bg-white` 或绕过语义 token 的主题颜色字面量。
- Hero 反色文字、品牌 SVG 和外部品牌色属于限定例外，并在同一组件附近注明语义。
- Operational emerald 只表达运行、连接或成功，不作为普通营销 CTA。
- Hero 是单一连续媒体层，背景覆盖标题、能力索引和产品窗口，并在截图下方保留视觉缓冲后再进入正文。
- Blog 使用编辑式卡片和衬线标题；Homepage、Docs 和控件保持无衬线产品语言。
- 所有动效尊重 `prefers-reduced-motion`；关闭动画后内容不隐藏。

## 资产处理

1. 把 C Cloud Expanse 母版复制为 `src/assets/hero/cloud-expanse.png`。
2. 首轮按用户决定不引入 Sharp：直接输出仓库内 PNG，并为每张图片声明固有宽高、首屏 eager 与非首屏 lazy。AVIF / WebP 响应式转换留到页面结构和视觉验收完成后的独立性能优化。
3. 从 `docs/assets/readme/` 选择通过脱敏检查的真实截图复制到 `src/assets/screenshots/`：
   - `home.png`：Hero 主产品窗口与 Docs 首页。
   - `context-controle.png` 或 `tool-permission2.png`：Context。
   - `design-tool.png` 或 `tool-permission2.png`：Tools / Approval。
   - `kairos.png`：Kairos。
   - `usage2.png`：Usage。
   - `review3.png`：Review。
4. 复制前检查截图中的用户名、本机绝对路径、API Key、真实 session 内容和敏感仓库；必要时选择同能力的另一张已有截图，不对敏感区域做不可复现的手工涂抹。
5. 首版产品切换组展示 Context、Tools、Kairos、Usage、Review。Browser 保留在 Hero 能力索引、核心价值和公开文档中；得到真实脱敏 Browser 截图后再加入切换组，禁止用其他截图冒充。
6. 使用仓库 wordmark SVG 生成站点品牌标识；favicon 和默认 OG 使用独立、可读的小尺寸构图。

## 里程碑

### 里程碑 1：工程地基与静态契约

修改范围：

- `packages/site/package.json`
- `packages/site/astro.config.mjs`
- `packages/site/tsconfig.json`
- `packages/site/src/content.config.ts`
- `packages/site/src/lib/site-path.ts`
- 根 `package.json`
- `pnpm-lock.yaml`
- `.gitignore`（只在 Astro 产物尚未覆盖时修改）

任务：

1. 创建私有 package `@actspace/site`。
2. 添加 `dev`、`check`、`test`、`build`、`preview` 脚本。
3. 根 `package.json` 新增 `dev:site`、`check:site`、`test:site`、`build:site`，不改变现有桌面端 `dev` 的含义。
4. 配置静态输出、sitemap、`site`、`base`、Markdown heading slug 和 syntax highlighting。
5. 建立 Docs / Blog Content Layer schema；draft 内容在生产构建中排除。
6. 增加最小 BaseLayout、404 和 route smoke 页面，使第一阶段可完成生产构建。

验证：

```bash
pnpm install
pnpm check:site
pnpm build:site
```

预期：生成 `packages/site/dist`，默认 base 下静态路径正确，不出现服务端 adapter。

### 里程碑 2：设计系统、共享布局和主页

修改范围：

- `packages/site/src/styles/**`
- `packages/site/src/layouts/BaseLayout.astro`
- `packages/site/src/components/SiteHeader.astro`
- `packages/site/src/components/SiteFooter.astro`
- `packages/site/src/components/ThemeControl.astro`
- `packages/site/src/components/SeoHead.astro`
- `packages/site/src/components/home/**`
- `packages/site/src/pages/index.astro`
- `packages/site/src/scripts/theme.ts`
- `packages/site/src/scripts/site-header.ts`
- `packages/site/src/scripts/reveal.ts`
- `packages/site/src/scripts/product-showcase.ts`
- `packages/site/src/assets/**`

任务：

1. 建立主题 token、排版、focus、reduced motion 和响应式基础。
2. 实现 skip link、透明 Hero Header、滚动后 surface Header、移动菜单和主题控制。
3. 实现连续 Hero、标题、CTA、能力索引和真实产品窗口。
4. 实现产品判断、三个核心价值、产品切换组、架构、开源和最终 CTA。
5. 产品切换使用原生 button / tab 语义；无 JavaScript 时所有能力内容仍按顺序可读。
6. 暂不写死最新更新和博客卡片，分别调用里程碑 3、4 的数据函数后显示。

视觉基准：

- Desktop：1440 × 1000。
- Tablet：1024 × 900。
- Mobile：390 × 844。
- Hero 截图宽度在桌面约为 viewport 的 80%–90%。
- 三个断点都不能产生页面级横向滚动。

### 里程碑 3：Release 数据地基和更新页

修改范围：

- `packages/site/src/lib/releases/**`
- `packages/site/src/lib/releases/test/**`
- `packages/site/src/components/updates/**`
- `packages/site/src/pages/updates/index.astro`
- `packages/site/src/components/home/LatestUpdates.astro`

测试 fixture：

- 合法的多月份表格。
- 同日多条并保持源顺序。
- 错误列数。
- 非法日期。
- 日期与月份标题不一致。
- 缺少必填单元格。
- 单元格中的 inline code、emphasis、strong、安全链接。
- 原始 HTML、`javascript:` URL 和脚本被清理。

验证：

```bash
pnpm test:site -- parse-release-notes
pnpm build:site
```

预期：主页最新三条与 `/updates` 使用同一解析结果；修改错误 fixture 会得到包含文件、月份和行号的失败信息。

### 里程碑 4：公开文档

修改范围：

- `packages/site/src/content/docs/**`
- `packages/site/src/lib/docs-navigation.ts`
- `packages/site/src/components/docs/**`
- `packages/site/src/layouts/DocsArticleLayout.astro`
- `packages/site/src/pages/docs/index.astro`
- `packages/site/src/pages/docs/[...slug].astro`
- `packages/site/src/styles/prose.css`
- `packages/site/src/scripts/copy-code.ts`

任务：

1. 编写十篇首批公开文档，内容从 README、CONTRIBUTING 和已实现代码事实重新组织。
2. 实现 Cursor 式任务入口 Docs 首页。
3. 实现 Claude Code 式分类导航、正文和本页目录。
4. 上一篇 / 下一篇只在同分组内移动。
5. 移动端使用可访问抽屉或 `<details>` 收起导航和 TOC。
6. 代码块提供复制按钮和文字成功反馈。
7. 首版不显示假搜索框；导航和 URL 完全可用。

### 里程碑 5：博客

修改范围：

- `packages/site/src/content/blog/**`
- `packages/site/src/assets/blog/**`
- `packages/site/src/lib/reading-time.ts`
- `packages/site/src/components/blog/**`
- `packages/site/src/layouts/BlogArticleLayout.astro`
- `packages/site/src/pages/blog/index.astro`
- `packages/site/src/pages/blog/[...slug].astro`

任务：

1. 创建第一篇真实文章和原创 SVG 封面。
2. 实现三列 / 两列 / 单列卡片网格。
3. 实现顶部分类筛选；首版文章数量少，不增加 Grid/List 切换和复杂筛选栏。
4. 实现 600–680px 阅读列、文章元数据、结构化数据和相关文章。
5. Homepage 仅在有非 draft 文章时显示最新三篇。

### 里程碑 6：SEO、安全、CI 与部署

修改范围：

- `packages/site/src/components/SeoHead.astro`
- `packages/site/public/brand/**`
- `packages/site/public/robots.txt`
- `.github/workflows/ci.yml`
- `.github/workflows/site-pages.yml`
- `package.json`
- `docs/CICD.md`
- `docs/design-docs/website-introduction-site-design.md`（仅同步真实实现偏差）

部署 workflow：

```text
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
withastro/action@e84f40bd8d2caa9e768ec82ad30dd81f0b280853 # v6
actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5
```

workflow 约束：

- 触发：push `main` 和 `workflow_dispatch`。
- 权限：顶层 `contents: read`；deploy job 额外 `pages: write`、`id-token: write`。
- checkout 完整仓库，`persist-credentials: false`。
- Astro action `path: .`，使用根 `pnpm-lock.yaml` 和 pnpm 10.33.0，通过 `build-cmd` 构建站点并上传 `packages/site/dist`。
- build 环境显式设置默认 `SITE_URL` 和 `SITE_BASE`。
- build 成功后才运行 deploy；使用 `github-pages` environment 和部署 URL 输出。
- GitHub 仓库 Pages Source 需要由维护者在 Settings → Pages 选择 GitHub Actions；workflow 不能代替该仓库设置。
- `.github/workflows/ci.yml` 增加显式 `pnpm check:site`、`pnpm test:site`、`pnpm build:site`，确保 PR 在部署前验证站点。

SEO 与安全：

- 每页唯一 title、description、canonical、Open Graph、Twitter card。
- Sitemap 和 robots 使用最终 `site` / `base`。
- Blog 输出 Article JSON-LD；不虚构评分、价格和下载量。
- 外部链接统一 `target="_blank" rel="noreferrer noopener"`。
- Markdown 不启用任意 raw HTML 脚本执行。
- 不读取 `.env`、logs、session、用户数据或本地应用数据作为站点内容。

### 里程碑 7：验收、文档和收尾

自动验证：

```bash
pnpm check:site
pnpm test:site
pnpm build:site
SITE_URL=https://wakeup-jin.github.io SITE_BASE=/actspace-agent pnpm build:site
pnpm check:frontend-theme
pnpm check:docs
pnpm check:repo
pnpm check:secrets
pnpm check:actions
git diff --check
```

浏览器验收：

- 主页、Docs 首页、Docs 文章、Blog 首页、Blog 文章、Updates、404。
- 1440 × 1000、1024 × 900、390 × 844。
- light、dark、system-light、system-dark。
- Tab 键遍历 Header、移动菜单、主题控制、产品 tab、更新折叠、代码复制。
- `prefers-reduced-motion: reduce` 下页面内容完整。
- 检查页面级横向滚动、图片尺寸、alt、heading 层级和 console error。
- 使用 `pnpm --filter @actspace/site preview --host 127.0.0.1 --port 8765` 验证生产构建，而不只验证 dev server。
- 再用 `SITE_BASE=/actspace-agent` 的构建结果验证所有内部链接和静态资源路径。

文档收尾：

- 更新本 plan 的进度与决策记录。
- 新增 `docs/histories/2026-07/<timestamp>-implement-actspace-site-v1.md`。
- 对照 `docs/QUALITY_SCORE.md` 更新与官网、CI 或公开内容质量直接相关的状态。
- 检查本次实现是否命中 learnings 规则；若 release Markdown AST、base path 或静态渐进增强形成可迁移知识，按 `docs/learnings/WRITING_GUIDE.md` 新增学习文档。
- 全部验收完成后把本 plan 移到 `docs/exec-plans/completed/`。

## 风险与缓解

### Hero 体积导致 LCP 过高

- 风险：1920 × 1600 PNG 为 3 MB 左右。
- 缓解：母版放 `src/assets` 并声明固有尺寸；首轮先完成页面，部署前记录真实 LCP。Sharp 与 AVIF / WebP 按用户决定暂缓，后续作为独立性能优化接入。

### GitHub Pages base path 破坏内部链接

- 风险：开发环境根路径正常，但项目站部署在 `/actspace-agent/`。
- 缓解：所有内部路径通过 `sitePath()` 和 Astro `BASE_URL` 生成；本地额外完成真实 base 构建验收。

### Release 表格格式变化导致静默缺数据

- 风险：弱解析器会忽略错误行并生成不完整页面。
- 缓解：AST 表头精确匹配、schema 校验、行号错误、错误 fixture 和构建失败。

### 公开内容泄漏内部信息

- 风险：截图、设计文档或 release 摘要可能包含本机路径、真实会话或内部说明。
- 缓解：只复制明确选中的公开内容；截图逐张审查；站点构建不 glob 根 `docs/`，仅显式读取 release 文件。

### 站点工程拖慢桌面开发链路

- 风险：把站点加入默认 Electron dev 或桌面打包会增加无关耗时。
- 缓解：保留根 `dev` 和桌面 release 语义；站点使用独立 root scripts，CI 明确调用站点检查。

### 设计 demo 与生产实现分叉

- 风险：直接复制单页 HTML 会带入字面量颜色、data URL 和不可维护脚本。
- 缓解：demo 只作为构图参考；生产代码重新按 Astro layout、semantic token 和渐进增强组件实现。

## 回退策略

- 站点是独立 workspace，出现问题时可以回退 `packages/site`、站点 root scripts 和 Pages workflow，不影响 Desktop / Agent Core runtime。
- 部署 workflow 与现有 release workflow 分离；Pages 失败不会发布桌面制品，也不会修改 GitHub Release。
- Release parser 只读源文件，不回写 `docs/releases/feature-release-notes.md`。
- 自定义域名没有确定前不提交 CNAME，避免错误接管域名。

## 进度记录

- [x] 设计规范定稿并进入设计索引。
- [x] 核对 workspace、素材、release 数据源和现有 CI/CD。
- [x] 核对 Astro 7 Content Layer 与 GitHub Pages 官方部署方式。
- [x] 固定首版依赖基线、Action SHA、目录和验证契约。
- [x] 用户批准本 execution plan。
- [x] 完成里程碑 1：工程地基与静态契约。
- [x] 完成里程碑 2：设计系统、共享布局和主页。
- [x] 完成里程碑 3：Release 数据地基和更新页。
- [x] 完成里程碑 4：公开文档。
- [x] 完成里程碑 5：博客。
- [x] 完成里程碑 6：SEO、安全、CI 与部署。
- [x] 完成里程碑 7：完整验收和文档收尾。

## 决策记录

- 2026-07-27：使用 Astro 7.1.3 静态输出和 Content Layer，避免引入客户端 SPA runtime。
- 2026-07-27：默认部署目标为 GitHub project Pages `/actspace-agent/`，通过 `SITE_URL` / `SITE_BASE` 为未来自定义域名保留无代码切换路径。
- 2026-07-27：公开 Docs 和 Blog 使用站点内内容集合；release 更新继续只从根目录唯一 Markdown 事实源读取。
- 2026-07-27：产品展示只使用真实、脱敏截图；首版不因缺少 Browser 截图而冒充或生成虚假产品 UI。
- 2026-07-27：站点 CI 显式加入现有 workflow，Pages 部署使用独立 workflow，并对所有 Action 固定 commit SHA。
- 2026-07-27：用户批准 implementation plan；创建 `packages/site`，完成 Astro 7 静态构建、Content Layer schema、base-path helper 和独立 root scripts。
- 2026-07-27：站点脚本显式设置 `ASTRO_TELEMETRY_DISABLED=1`，避免本地与 CI 写用户偏好目录，并保持首版无第三方遥测。
- 2026-07-27：按用户决定暂不引入 Sharp；首轮使用带固有尺寸和加载策略的 PNG，AVIF / WebP 转换延后，不阻塞页面实现。
- 2026-07-27：Astro 官方 Pages Action 从 monorepo 根执行，避免 `path: packages/site` 丢失根 lockfile；通过 `build-cmd` 和 `out-dir` 精确指向站点。
- 2026-07-27：浏览器验收发现 HTML 图片固有高度覆盖响应式截图比例，统一补 `img { height: auto; }` 并调整 Hero 垂直节奏；同时接通 Shiki 深色语法色与 `data-theme`。
- 2026-07-27：完成 production preview 的 1440px / 390px、light / dark、文档搜索、产品 Tab、更新页、404 和控制台验收，execution plan 归档。
