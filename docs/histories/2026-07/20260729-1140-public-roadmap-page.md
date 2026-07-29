## [2026-07-29 11:40] | Task: 增加公开开发计划页面

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 将已确认的开发计划 Demo 更新到官网；已完成项目从公开发布记录中整理，未完成项目包含 Agent Room、手机端与云端协同、记忆、评估、上下文可视化和 Computer Use。

### 🛠 Changes Overview

**Scope:** `docs/roadmap.md`、`packages/site`、官网设计与发布文档

**Key Actions:**

- **[Roadmap Source]**: 新增 Markdown 任务清单作为开发计划唯一事实来源，复选框决定状态，已完成条目携带完成日期。
- **[Public Page]**: 新增 `/roadmap` 静态页面、状态统计、未完成/已完成 Tab、紧凑列表和按六项追加的加载更多交互。
- **[Navigation]**: 在桌面、移动导航和页脚资源中加入“开发计划”。
- **[Content Boundary]**: 根据公开 release 整理主要已交付能力；云端协同、Agent Room、记忆、评估、上下文可视化和 Computer Use 保持未完成。
- **[Validation]**: 增加 roadmap parser 测试，覆盖数据源加载、完成日期、任务格式、嵌套条目和重复标题。

### 🧠 Design Intent (Why)

开发计划需要让维护者通过简单的 Markdown 复选框更新状态，同时避免官网复制第二份任务数组。Release 与 history 用于确认已交付事实，但不适合在每次构建时自动推断产品级任务，因此最终由独立 roadmap 文档承担稳定的数据契约。

### 📁 Files Modified

- `docs/roadmap.md`
- `packages/site/src/lib/roadmap.ts`
- `packages/site/src/lib/roadmap/source-path.ts`
- `packages/site/src/lib/test/roadmap.test.ts`
- `packages/site/src/pages/roadmap.astro`
- `packages/site/src/scripts/roadmap.ts`
- `packages/site/src/components/SiteHeader.astro`
- `packages/site/src/components/SiteFooter.astro`
- `docs/design-docs/website-introduction-site-design.md`
- `docs/releases/feature-release-notes.md`

### ✅ Validation

- `pnpm test:site`：3 个测试文件、17 条测试通过。
- `pnpm check:site`：46 个 Astro 文件，0 errors / warnings / hints。
- `pnpm build:site`：23 个静态页面构建成功，包含 `/roadmap/index.html`。
- `pnpm check:docs`、`pnpm check:frontend-theme` 与 `git diff --check` 通过。
- UI 按用户要求留给本地手动验收，未执行浏览器自动操作。
