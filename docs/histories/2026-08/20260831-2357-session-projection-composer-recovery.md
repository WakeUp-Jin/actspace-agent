## [2026-08-31 23:57] | Task: 修复 Session 投影滞后导致的输入框消失

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 模型完成最终回复后，Desktop 用户输入框没有渲染出来。

### Changes Overview

**Scope:** `packages/client`、`apps/desktop`、`docs`

**Key Actions:**

- **Revision-aware refresh**：Desktop Session Bridge 收到选中 Session 的更高 Journal revision 时，自动去重刷新 snapshot 和 projections。
- **Overlay lifecycle**：durable snapshot 追上 live event 后清理临时 live overlay。
- **Composer recovery**：即使 Composer projection 暂时落后，只要已有对话内容，Conversation 仍保持完成消息和 follow-up 输入框可见。
- **Regression coverage**：增加 Bridge revision 刷新测试和 Conversation stale-phase 测试。

### Design Intent (Why)

Session Journal 是唯一事实源，live event 只提供进度提示，不能成为 UI 的第二份持久状态。输入框的渲染必须能容忍 projection 短暂落后，并在 snapshot 追上 Journal revision 后恢复一致。

### Files Modified

- `packages/client/src/sessions/live-overlay.ts`
- `packages/client/src/sessions/session.ts`
- `apps/desktop/src/renderer/session/desktop-session-bridge.ts`
- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/test/session-store.test.ts`
- `apps/desktop/src/renderer/test/turn-output-artifacts.test.tsx`

### Validation

- `pnpm --filter @actspace/client build`：通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- Desktop targeted tests：17/17 通过。
- 全量 Desktop 测试：80 个测试文件、533 个断言全部通过。

## Follow-up | 2026-09-02

上一轮修复了 Session snapshot 刷新和 Composer 的降级显示，但真实运行中仍发现：follow-up 用户消息在流式期间可见，模型完成后却从消息流消失。本轮继续沿着“Session Journal 是唯一事实源”的路径修复了持久化投影。

### Additional Root Cause

`AgentLoopService.followup()` 会先把用户输入写入 Inbox；随后 `agent/inbox/spliced` 的 `claim` 事件将这条 Inbox 消息物化为 Surface user node。由于 `AgentLoop` 已经拿到 `inboxClaimed`，不会再次追加普通 `user/message`。Desktop 固定 Renderer projection 之前只处理 `user/message`，因此完成后的 durable projection 只有 assistant 消息，临时 streaming overlay 清理后用户消息就消失了。

### Additional Changes

- `fixed-renderer-projection.ts` 现在把带有 `operation: "claim"` 的 `agent/inbox/spliced` 事件按其 Surface append node 投影为 `user_message`。
- 新增回归测试，覆盖“Inbox claim 用户消息 + assistant 最终消息”在流结束后仍同时存在。

### Additional Validation

- 先临时恢复旧条件运行回归测试：按预期失败，用户消息缺失。
- 恢复修复后 targeted Desktop tests：3 个测试文件、22 个断言通过。
- `@actspace/client` tests：2 个测试文件、4 个断言通过。
- `pnpm run check:docs`、`git diff --check`：通过。
- Desktop 全量测试当前为 77/80 文件通过、531/536 断言通过；失败项来自既有的 Context 空值、测试仓库无 commit、Provider 设置异步夹具问题，并非本次 projection 回归。
- Desktop typecheck 仍被既有 `legacy-llm-adapter.ts` 的 `contextWindow` 类型错误阻断。

## Follow-up | 2026-09-03

真实 Desktop 验收继续发现：模型最终回复完成时，整个工作区会出现一次短暂闪烁。问题不是 Session 内容再次丢失，而是完成态交接同时触发了 live overlay、后台 projection refresh、loading 状态切换、逐项 projection 更新和同步滚动/尺寸重算。

### Completion Handoff Stabilization

- `ClientSessionStore.batch()` 将同一 Journal revision 的 durable snapshot 与 projection values 作为单次 renderer notification 提交，避免中间半成品状态被 UI 消费。
- 后台 refresh 使用 `beginRequest({ preserveReady: true })`，已有 durable snapshot 时保持 ready，避免完成态出现 loading 空档。
- Conversation 的同步 viewport effect 不再因 `isStreaming` 单独变化而执行滚动；消息或真实尺寸变化仍会触发贴底逻辑。

### Validation

- `@actspace/client` tests：6/6 通过。
- Desktop targeted Session/streaming tests：29/29 通过。
- `@actspace/client` 与 Desktop typecheck：通过。
- 全量 Desktop 测试：80 个测试文件、546 个断言通过；此前的 Context/Trajectory/Composer 夹具失败在重建 `@actspace/client` 制品后消失。
- `pnpm run check:docs` 仍被既有未登记计划 `20260901-actspace-trajectory-session-view` 阻断，本轮未改动用户的计划索引。

## Follow-up | 2026-09-05

真实 Desktop 验收仍观察到模型最终回复完成后短暂闪烁。沿着 Journal → projection → React key 的链路继续追踪后，发现这次不是刷新时序，而是同一条用户消息在两个阶段使用了不同身份：流式 overlay 使用 `turn:<agentRunId>:user:0`，而 Inbox claim 的 durable projection 因事件缺少 `agentRunId`，退化成 `turn:system:user:0`。完成态清理 overlay 后，React 将用户消息视为新节点并重新播放入场动画。

### Durable Identity Handoff

- 固定 Renderer projection 在预扫描 Journal 时建立 Inbox `messageId` → `turn/start` 的 run/turn 映射。
- `target: next-turn` 绑定 claim 后继的 turn；`target: next-step` 绑定 claim 前一条活动 turn。
- `identityFor()` 使用该映射生成与 streaming overlay 相同的 `renderKey`，从而保持完成态交接时的节点身份稳定。
- 新增 next-turn 与 next-step 回归测试，并保留 Inbox claim 的 durable user message 覆盖。

### Validation

- 先在旧实现上运行回归测试：按预期得到 `turn:system:user:0`，测试失败。
- 修复后固定 Renderer projection：8/8 测试通过。
- `apps/desktop` typecheck：通过。
- 未进行 Electron/UI 手动验收；需要用户重新运行真实 Desktop 场景确认视觉闪烁已消失。
