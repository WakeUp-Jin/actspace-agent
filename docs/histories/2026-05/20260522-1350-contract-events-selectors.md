## [2026-05-22 13:50] | Task: implement frontend/backend contract layer

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 嗯嗯开始执行吧

### Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs/exec-plans`, `docs/histories`

**Key Actions:**

- **[Shared contracts]**: 扩展 `SessionEvent`、`RuntimeStreamEvent`、`MessageBlock`、`ContextUsageSnapshot`、`SessionDiffSummary`、`ToolUiPreview` 等共享契约。
- **[Selectors]**: 新增 `session-selectors`，支持旧 `turn_result` 展开、`SessionEvent[] -> MessageBlock[]`、最新 Context snapshot 提取、会话级 diff 聚合。
- **[Persistence compatibility]**: `writeSessionResult` 改为逐条写入 `SessionEvent`，读取时兼容旧 `turn_result` 包装格式。
- **[Runtime output]**: mock runtime 新写入 `assistant_message`，工具结果补充 `uiPreview`、`modelOutput`、结构化错误和 token 估算字段。
- **[Renderer boundary]**: 当前 renderer 不再直接解析 raw `SessionEvent`，改为通过 shared selector 消费 `MessageBlock`。
- **[Build boundary]**: 为 renderer 的 Vite 构建增加 `@actspace/shared` 到 TS 源入口的 alias，避免 Rollup 对 CommonJS 聚合导出的命名导出分析失败。

### Design Intent

这轮不是做高保真 UI，而是先把前后端数据边界立稳。后端可以继续按 `llm-agent-dev` 重建内部 Agent loop，但长期持久化只写稳定 `SessionEvent`，前端只消费派生出来的 UI ViewModel。这样后续前端还原和后端重构可以并行推进，不会再次因为 raw runtime event 与 UI 组件耦合导致空白或返工。

### Verification

- `pnpm typecheck`
- `pnpm build`

### Files Modified

- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/package.json`
- `packages/agent-core/src/agent.ts`
- `packages/agent-core/src/context.ts`
- `packages/agent-core/src/persistence.ts`
- `packages/agent-core/src/tools.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/vite.config.ts`
- `tsconfig.base.json`
- `docs/exec-plans/active/actspace-parallel-contracts-and-fixtures.md`
- `docs/histories/2026-05/20260522-1350-contract-events-selectors.md`
