## [2026-07-28 19:11] | Task: 整理公开文档导航与阅读布局

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 参考成熟文档站整理 ActSpace 文档模块：顶部使用少量分类 Tab，左侧展示当前分类的文档列表，内容信息从仓库文档中整理。

### 🛠 Changes Overview

**Scope:** `packages/site` 公开文档模块、官网设计规范

**Key Actions:**

- **[Docs Navigation]**: 增加“开始使用 / 工作原理 / 能力指南 / 开发者”四个文档 Tab，并让左侧列表只展示当前领域。
- **[Responsive Layout]**: 调整三栏阅读布局的收口顺序，常见桌面分屏保留左栏，手机宽度才切换为折叠导航。
- **[Docs Search]**: 将标题搜索从左栏移到文档顶部，并以静态结果浮层搜索全部公开文档的标题与摘要。
- **[Visual Hierarchy]**: 文档首页和文章标题收敛为工具手册密度，当前页面改用中性 selected surface。
- **[Model Setup]**: 快速开始移除已过时的 `.env` 配置步骤，改为 App 内“服务商 → 模型”的配置路径，并补充 DuckCoding。

### 🧠 Design Intent (Why)

文档分类负责切换知识领域，左侧列表负责定位当前领域的文章，右侧目录只服务当前页面。这个层级可以在内容较少时保持清楚，也为后续从内部 `docs/` 中筛选并重组更多公开内容保留稳定导航结构。

### 📁 Files Modified

- `packages/site/src/components/docs/DocsTabs.astro`
- `packages/site/src/components/docs/DocsSidebar.astro`
- `packages/site/src/components/docs/DocsToc.astro`
- `packages/site/src/lib/docs-navigation.ts`
- `packages/site/src/scripts/docs-search.ts`
- `packages/site/src/pages/docs/index.astro`
- `packages/site/src/pages/docs/[...slug].astro`
- `packages/site/src/content/docs/getting-started.md`
- `packages/site/src/content/docs/configure-a-model.md`
- `docs/design-docs/website-introduction-site-design.md`

### ✅ Validation

- `pnpm --filter @actspace/site check` 在并发 release 改动出现前通过：40 个文件，0 错误、0 警告。
- `pnpm --filter @actspace/site test` 通过：7/7。
- `pnpm --filter @actspace/site build` 通过：22 个静态页面生成完成。
- `pnpm check:docs`、`pnpm check:frontend-theme` 与 `git diff --check` 通过。
- 浏览器验证 1280px 三栏、958px 左栏保留、390px 折叠导航、文档搜索和深色主题；各宽度均无页面级横向滚动。
