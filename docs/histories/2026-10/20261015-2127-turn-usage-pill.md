## [2026-10-15 21:27] | Task: 回复尾部本轮用量胶囊与弹窗（含花费）

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS）`

### 📥 User Query

> 最终回复之后的本轮 token 用量统计参考 DeepSeek Harness 的字段和样式重做，点开弹窗里增加「花费」。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/client`、`apps/desktop`（renderer、mock）、`docs`

**Key Actions:**

- **本轮用量字段**：`MessageBlock` assistant 的 `usage` 从「总 token + USD」扩成 `TurnUsageSummary`（未缓存输入、缓存读写、输出、推理、提供方/模型、花费、算不出价格的请求数、是否预估）；`LlmUsagePayload` 增加 `costBasis`。
- **投影**：`chat.ts` 的 `llm_usage` 改为每次请求一条——成功的取 `step/end`，失败重试的取 `llm/retry`，没有 usage 的 `step/end` 不记；提供方/模型取计价快照，花费口径复用 `activityCost`（算不出价格的不再当 $0 计入）。
- **界面**：尾栏改成 DSH 布局（操作图标 → 「用量 … tok」胶囊 → 时间），胶囊点开「本轮用量」弹窗，末行是花费（预估标灰、部分未知/未知）；最新一轮尾栏一直显示，更早的轮次悬停才出现；480px 以下胶囊只留图标。
- **复用**：统计弹窗内容抽成 `components/stats/StatDialog.tsx`，输入框状态栏胶囊和本轮用量胶囊共用。
- **Mock**：`?mock=turn-deliverables` 三轮回复带用量（第 2 轮没有价格），mock journal 支持带 usage 的 `step/end`。

### 🧠 Design Intent (Why)

原来的尾栏只有一段「时间 · 总 token · 花费」文字，看不出缓存命中和输入输出构成。照 DSH 把 token 明细收进一个可点的胶囊，花费作为弹窗最后一行；有请求算不出价格时宁可显示「部分未知」，也不给一个偏小的金额。

### 📁 Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/test/session-selectors.test.ts`
- `packages/client/src/sessions/chat.ts`
- `packages/client/src/test/chat-turn-usage.test.ts`（新增）
- `apps/desktop/src/renderer/components/conversation/TurnActions.tsx`
- `apps/desktop/src/renderer/components/conversation/TurnUsagePill.tsx`（新增）
- `apps/desktop/src/renderer/components/conversation/turn-usage.ts`（新增）
- `apps/desktop/src/renderer/components/conversation/TurnView.tsx`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/stats/StatDialog.tsx`（新增）
- `apps/desktop/src/renderer/components/composer/ComposerStatsPills.tsx`
- `apps/desktop/src/renderer/mock/mock-db.ts`
- `apps/desktop/src/renderer/mock/scenarios/turn-deliverables.ts`
- `apps/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `apps/desktop/src/renderer/test/turn-usage.test.ts`（新增）
- `scripts/native-button-baseline.json`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/FRONTEND_VERIFICATION.md`
