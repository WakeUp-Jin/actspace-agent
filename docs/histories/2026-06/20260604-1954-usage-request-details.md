## [2026-06-04 19:54] | Task: Usage Request Details

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 在 Usage 页面底部新增全宽列表，展示时间、workspace 名字、sessionId、模型和 token 用量；Token 悬浮展示 Cache Read/Input/Output/Total，不展示 Cache Write；顶部会话 hover 卡增加 sessionId。

### Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs/design-docs`

**Key Actions:**

- **[Usage data model]**: 在 `UsageStatisticsSnapshot` 增加 `requestRows`，按 `sessionId + turnId` 聚合同一轮用户输入内的多次 `llm_usage`。
- **[Usage UI]**: 在 Usage 页面底部新增跨两栏的“会话明细”表格，按最新模型调用时间倒序展示 workspace、sessionId、模型、Tokens 和模型调用次数。
- **[Token hover]**: Tokens 单元格 hover/focus 时显示固定定位小卡片，展示 Cache Read、Input、Output、Reasoning（如有）和 Total，明确不展示 Cache Write。
- **[Session hover]**: 顶部当前会话悬浮卡新增完整 `sessionId:` 行。
- **[Regression tests]**: 补充聚合器与 renderer 测试，覆盖 turn 级合并、最近排序、workspace label、Token hover 和 sessionId hover 展示。
- **[Docs sync]**: 更新 Usage Statistics 设计规范，说明底部明细表的数据粒度、排序、hover 和 Cache Write 边界。

### Design Intent

`llm_usage` 仍保持一次模型调用一条事实事件，避免丢失多模型、多调用和缓存命中细节；Usage 底部表格只在聚合视图层按 turn 折叠，匹配用户理解的一轮输入。Cache Write 没有可靠 token 字段，因此 UI 不用 `cacheMissTokens` 伪装，避免账本展示误导。

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/usage-statistics.ts`
- `packages/agent-core/src/persistence/test/usage-statistics.test.ts`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/SessionHoverPreview.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `packages/desktop/src/renderer/test/fixtures/usageStatisticsFixture.ts`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend/front-usage-statistics.md`

## [2026-06-05 01:01] | Follow-up: Request Row Pagination

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 会话明细每一次 10 条，支持分页查询。

### Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs/design-docs`

**Key Actions:**

- **[IPC contract]**: 在 `UsageStatisticsGetInput` 增加 `requestRowsPage.page`，并在 snapshot 返回 `requestRowsPage` 元信息。
- **[Data pagination]**: `agent-core` 在完整聚合、稳定排序后对 `requestRows` 做每页 10 条切片；summary、模型分布、每日明细仍基于完整时间窗。
- **[Usage UI]**: 会话明细底部增加上一页 / 下一页分页控件，显示当前页、总页数、当前行号范围和总行数。
- **[Regression tests]**: 补充后端分页测试和 renderer 分页按钮测试，锁定“只分页明细，不分页账本”的行为。
- **[Docs sync]**: 更新 Usage Statistics 设计规范，说明 `requestRows` 当前页、`requestRowsPage` 元信息和翻页规则。

### Design Intent

分页是底部明细表的视图查询能力，不是账本聚合范围。先从全部事实事件得到完整统计，再只对 `requestRows` 切页，可以避免翻页时主统计大卡、模型分布、每日明细跟着变小。

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/usage-statistics.ts`
- `packages/agent-core/src/persistence/test/usage-statistics.test.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `packages/desktop/src/renderer/test/fixtures/usageStatisticsFixture.ts`
- `docs/design-docs/frontend/front-usage-statistics.md`
