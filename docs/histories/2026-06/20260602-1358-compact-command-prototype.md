## [2026-06-02 13:58] | Task: /compact command UI prototype

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望先讨论并设计 `/compact` 命令触发压缩后的前端 UI。后端逻辑已存在，当前需要一个放在 `docs/design-docs/public` 下的 HTML 原型，展示执行前、执行中、执行完成三种状态，并同时考虑浅色和深色主题。

### Changes Overview

**Scope:** `docs`

**Key Actions:**

- **新增原型**：添加 `docs/design-docs/frontend/compact-command-states.html`，同屏展示 `/compact` 消息流事件在浅色 / 深色主题下的三态。
- **补设计索引**：更新 `docs/design-docs/frontend/README.md` 与 `docs/design-docs/frontend/README.md`，让该原型可从前端设计文档入口追踪。
- **新增执行计划**：添加 `docs/exec-plans/active/20260602-compact-command-ui.md`，拆分 `/compact` 命令入口、手动压缩 IPC、消息块映射、三态 UI 组件和验证路径。
- **登记 active plan**：更新 `docs/exec-plans/README.md`，把 `/compact` 命令前端接入加入当前进行中的计划列表。

### Design Intent

`/compact` 既可能由用户手动触发，也可能未来自动触发，因此原型把它设计为消息流中的系统执行事件，而不是 Composer 上方的浮层。执行中状态使用高对比任务卡和进度条，保留主动触发的执行感；完成态收束为简短结果，不提供展开详情。

### Files Modified

- `docs/design-docs/frontend/compact-command-states.html`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/frontend/README.md`
- `docs/exec-plans/active/20260602-compact-command-ui.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-06/20260602-1358-compact-command-prototype.md`

## [2026-06-02 20:27] | Task: /compact command real integration

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户批准继续执行 `/compact` 命令前端接入计划，要求按 M1-M4 顺序完成契约、后端入口、消息块、UI、文档、验证和归档。

### Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs`

**Key Actions:**

- **契约接入**：新增 `CompactContextInput` / `CompactContextResult`，扩展 `RuntimeStreamEvent` 与 `ContextCompactionPayload`，让手动压缩具备 started/progress/finished/failed 生命周期。
- **后端入口**：`ContextManager.compactNow()` 跳过自动阈值但复用 `HistoryCompactor`；`compactContextWithAgent()` 生成手动压缩事件、快照和状态；desktop main 通过 `context:compact` 持久化结果。
- **消息块与 renderer 状态**：`createMessageBlocks` 将 `context_compaction` 映射为主消息流系统块；renderer 识别 exact `/compact`，不调用普通 `runTurn`，并处理 compaction runtime segment。
- **UI 与主题**：新增 `CompactCommandBlock`，覆盖 pending/running/completed/skipped/failed；组件仅使用语义 Tailwind 类和既有语义 token；mock fixture 加入 manual 完成态和 running 示例。
- **验证与归档**：补 shared selector、agent-core compact、desktop renderer、desktop main 持久化测试；更新设计文档；完成计划移入 `docs/exec-plans/completed/`。

### Design Intent

`/compact` 是上下文管理系统事件，不是用户想让 LLM 回答的自然语言，也不是工具调用。因此 renderer 在发送前分流命令文本，后端以独立 IPC 与流式事件表达执行过程，最终只把 `context_compaction` 和 `context_snapshot` 作为可恢复事实写入 session。这样既保持聊天历史可读，也避免命令文本污染 LLM conversation。

### Verification

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core exec vitest run src/context src/engine`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/desktop exec vitest run src/main/test src/renderer/test`
- `pnpm --filter @actspace/desktop typecheck`
- `rg -n "text-black|bg-black|bg-white|text-\\[#|bg-\\[#|border-\\[#|rgba\\(" ...`：`CompactCommandBlock` 相关改动无主题相关颜色字面量命中。
- Browser mock：实际 renderer 深色主题下确认 `Context compacted` 与 `Compacting context` 可见；390px 窄屏下两块不横向溢出，长文案按设计省略，进度条可读。浅色实际截图未完成：Browser 安全策略禁止打开 `file://` 原型，当前 mock UI 未暴露稳定的主题切换入口；浅色覆盖依赖语义 token 扫描与组件测试。

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/engine/compact-context.ts`
- `packages/desktop/src/main/context-compact.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/ConversationView.tsx`
- `packages/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`
- `docs/design-docs/model-context/agent-context-compression.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/exec-plans/completed/20260602-compact-command-ui.md`
