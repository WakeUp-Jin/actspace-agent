## [2026-07-25 21:06] | Task: 展示每轮 Token 与费用

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> Usage 的每日细目和会话明细增加费用；每条 Assistant 回复末尾在悬浮时显示本轮 Token 总计与价格，费用统一采用 USD。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs`

**Key Actions:**

- 新增 shared USD 折算函数，统一 `7.2 CNY = 1 USD` 的展示口径。
- `createMessageBlocks()` 按 `turnId` 聚合全部 `llm_usage`，只把结果挂到最终可见 Assistant 回复。
- Assistant 回复增加 hover/focus 尾栏，展示时间、Token、USD 预估费用和快捷操作。
- Usage 每日细目与会话明细增加费用列，并为小额费用保留最多 6 位小数。
- 补齐 selector、消息尾栏、Usage 表格回归测试和相关设计文档。

### 🧠 Design Intent (Why)

Agent turn 可能包含多次模型调用。只展示最终正文那次调用会漏掉工具调用和失败重试已经产生的成本，因此费用必须从持久化 `llm_usage` 事实按 turn 聚合，再投影到最终回复和统计页。

### 📁 Files Modified

- `packages/shared/src/usage-cost.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/design-docs/frontend/front-usage-statistics.md`
