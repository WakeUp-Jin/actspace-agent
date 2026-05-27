## [2026-05-27 10:27] | Task: Legacy tool result recovery

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> Usage 页面显示 `usage-statistics:get` 失败，错误为 `Cannot read properties of undefined (reading 'kind')`，需要修复旧 session 数据导致的统计加载问题。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`

**Key Actions:**

- **[Recovery guard]**: `createSessionDiffSummary` 在处理 `tool_result` / `diff_preview` 时先验证 preview 是否存在且包含合法 `kind`。
- **[Renderer message guard]**: `createMessageBlocks` 对旧版不带 `uiPreview` 的 `tool_result` 生成通用 tool message，避免 renderer 直接从 events 恢复消息时白屏。
- **[Regression coverage]**: 为旧版不带 `uiPreview` 的 `tool_result` 增加恢复测试，确保 session 恢复、Usage 统计读取链路和 renderer 消息块恢复不再被旧数据打断。

### 🧠 Design Intent (Why)

早期 session.jsonl 中存在没有 `uiPreview` 的 `tool_result`。恢复 diff summary 和 renderer message blocks 时都不应假设所有工具结果都有 UI preview，否则会让 `session:get`、`usage-statistics:get` 或前端启动渲染旧 events 时失败。兼容策略是跳过无法参与 diff 汇总的旧工具结果，同时用 summary/output 生成通用 tool message 保留可见信息。

### 📁 Files Modified

- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/persistence/test/recovery.test.ts`
