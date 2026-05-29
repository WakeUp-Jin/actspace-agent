## [2026-05-29 11:33] | Task: Usage 页增加 DeepSeek 预额卡

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 在 Usage 页面左栏增加一个 DeepSeek 预额展示，只显示类似 `¥19.65 CNY` 的大数字余额、单位和刷新能力；支持自动刷新。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/desktop`, `docs`

**Key Actions:**

- **[IPC 契约]**: 新增 `DeepSeekBalanceSnapshot`，renderer 只接收已裁剪的余额展示模型。
- **[Main 请求]**: 在 Electron main 进程通过 `DEEPSEEK_API_KEY` 调用 DeepSeek `GET /user/balance`，优先展示 CNY 余额。
- **[Usage UI]**: 在 Usage 左栏顶部新增极简 `DeepSeek 预额` 卡片，只展示大数字余额、币种和刷新按钮。
- **[空态保留]**: Usage 统计账本为空时，左栏仍显示预额卡，右侧保留原有“暂无 Usage 数据”空态。
- **[刷新策略]**: 进入 Usage 自动刷新一次，页面停留时每 5 分钟自动刷新，手动点击刷新按钮可立即拉取。
- **[文档同步]**: 更新 Usage 设计规范和安全文档，记录 UI 范围与 API Key 边界。

### 🧠 Design Intent (Why)

余额是账户状态，不属于 token usage 聚合账本，所以放在左栏顶部作为轻量侧栏仪表盘入口。DeepSeek API Key 必须留在 main/agent-core 安全边界，renderer 不能直接请求外部接口，也不能接触鉴权头或原始响应。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `docs/design-docs/frontend-ui/usage-statistics/设计规范.md`
- `docs/SECURITY.md`
