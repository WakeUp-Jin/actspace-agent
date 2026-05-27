## [2026-05-27 12:55] | Task: 接入 Tailwind 并迁移 Usage Statistics 样板

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 先执行 Tailwind 接入计划：接入 Tailwind，使用“全局样式 + Tailwind”的架构，并先完成 Usage Statistics 页面相关任务。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer、前端设计文档、execution plan、history。

**Key Actions:**

- **Tailwind 接入**：为 desktop renderer 安装 `tailwindcss` 和 `@tailwindcss/vite`，并接入 Vite plugin。
- **ESM 配置修复**：将 `packages/desktop/vite.config.ts` 改为 `vite.config.mts`，避免 ESM-only Tailwind Vite plugin 被 CJS require。
- **样式入口拆分**：新增 `styles/index.css`、`tokens.css`、`tailwind.css`、`base.css`，建立 `--act-*` token 和 Tailwind `@theme inline` 映射。
- **Usage 样板迁移**：将 `UsageStatisticsPage` 从 `.usage-*` 全局 CSS 迁移到 Tailwind utility class，并保留金额弹窗、工具详情弹窗、左侧工具调用卡、Token 总数大卡和缓存效率卡。
- **旧样式清理**：删除 `styles.css` 中已不再引用的 `.usage-*` 样式块，降低旧 CSS 残留。
- **交互细节补丁**：为 composer textarea 补回局部 `focus-visible` 覆盖，避免全局 focus 样式产生浅蓝边框。
- **窗口标题栏安全距离**：Usage 页面根节点增加基于 `--window-chrome-strip-height` 的顶部 padding，避免侧边栏展开或收起时页面标题与 Token 卡片顶部重叠。
- **验证**：通过 desktop typecheck、build、test，并用 Electron 窗口真实点击验证 Usage 页、金额弹窗和工具详情弹窗。

### 🧠 Design Intent (Why)

Tailwind 的价值不只是少写 CSS，而是让布局、间距、状态和响应式就近表达在组件里；全局 CSS 只保留 token、base 和系统级边界。Usage Statistics 页面已有明确原型和反馈，适合作为第一块样板，验证 Tailwind v4、Vite plugin、token 映射和 Electron 实际渲染是否能一起工作。

### 📁 Files Modified

- `packages/desktop/package.json`
- `pnpm-lock.yaml`
- `packages/desktop/vite.config.mts`
- `packages/desktop/tsconfig.json`
- `packages/desktop/src/renderer/main.tsx`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/tokens.css`
- `packages/desktop/src/renderer/styles/tailwind.css`
- `packages/desktop/src/renderer/styles/base.css`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `docs/exec-plans/active/actspace-tailwind-style-architecture.md`
