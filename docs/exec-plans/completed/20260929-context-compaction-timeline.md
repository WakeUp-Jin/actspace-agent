# 对话流里的上下文压缩：进行中、分隔线与摘要

## 目标

让手动 `/compact` 和自动压缩在对话流里呈现为同一套 UI：进行中显示「正在压缩上下文 · 已用时间」和不确定进度条；完成后留一条可展开的分隔线「上下文已压缩 · N 条消息 · 12s」，展开可看到模型拿到的摘要；失败显示红色分隔线和「重试」；无需压缩只在 Composer 上方提示一次。被压缩的旧消息继续显示，不再被一张摘要用户卡片替换。

设计稿：`docs/design-docs/frontend/context-compaction-demo.html`（2026-09-29 与用户确认）。

## 范围

- 包含：
  - 压缩插件在真正开始压缩时通知观察者；Agent loop 把自动压缩的开始、完成、失败作为 live 事件发出，自动压缩失败不再让已完成的回合变成失败。
  - Desktop stream adapter 把 live 事件映射为 `context_compaction_started / finished / failed`。
  - Chat 投影：被压缩替换的旧消息与工具继续显示；摘要节点不再投影成 `user_message`，而是挂到 `context_compaction` 事件的 `summary`；补 `durationMs`、`removedCount`。
  - `MessageBlock.context_compaction` 契约收敛为 `running | completed | failed`，去掉 trigger / stage / progress / summaryText 等不再显示的字段。
  - `CompactCommandBlock` 重写：计时、可展开摘要、失败重试；中文文案，手动与自动不区分。
  - App：手动 `/compact` 发出即进入 running；skipped 走 Composer 提示；压缩期间停止按钮置灰。
  - 规范文档、demo、测试、history 同步。
- 不包含：
  - 消息队列 / Steer（用户决定单独立项，参考截图：Composer 上方托盘）。压缩期间仍不能发送。
  - 中止进行中的压缩（用户决定：压缩中不可停止）。
  - 失败结果持久化。压缩失败只在渲染进程内按会话保留到该会话下一次发送；刷新或重启后不保留（journal 没有失败事件类型，新增事件类型超出本次范围）。
  - 上下文占用环的阈值刻度（用户决定不做）。

## 背景

- 相关文档：`docs/design-docs/frontend/front-中间消息区规范.md`「Context Compaction 组件」；`docs/FRONTEND_VERIFICATION.md`；`docs/design-docs/frontend/front-主题与配色规范.md`。
- 相关代码路径：
  - `packages/compaction/src/plugin.ts`（`maybeCompact` / `compact`）
  - `packages/core/agent-loop/src/loop.ts`（`AgentLoopLiveEvent`，`maybeCompact` 调用点在 `turn/end` 之后）
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts`
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`（`compactContext`）
  - `packages/client/src/sessions/chat.ts`（`projectChatEvents`、`indexActiveSurface`）
  - `packages/shared/src/session.ts`（`RuntimeStreamEvent`、`ContextCompactionPayload`、`MessageBlock`）
  - `packages/shared/src/session-selectors.ts`（`contextCompactionBlock`）
  - `apps/desktop/src/renderer/App.tsx`、`components/messages/CompactCommandBlock.tsx`、`components/ConversationView.tsx`、`components/Composer.tsx`、`components/WorkbenchLayout.tsx`
- 已知约束（2026-09-29 调研）：
  - v2 后端从未发出 `context_compaction_*` stream 事件，running 态在 v2 中不可见；手动压缩一直停在淡色 `/compact`。
  - 自动压缩发生在 `turn/end` 之后、`run-state completed` 之前，用户看到回复结束但会话仍忙碌，没有任何说明。
  - 投影把 trigger 写死为 `manual`；压缩后旧消息从界面消失，摘要显示成一张用户卡片。
  - Surface 只有 append / replace 两种操作，只有压缩会 replace，因此"不在有效 Surface 中的 append 节点"即"已被压缩的节点"。

## 风险

- 风险：显示被压缩的旧消息后，用户消息上的操作（批注、fork 等）可能作用于已不在有效 Surface 中的节点。
  - 缓解：只改变显示；检查 UserMessage / AssistantReply 上依赖有效 Surface 的操作，若存在则对被压缩节点禁用并在进度中记录。
- 风险：`MessageBlock` 契约收敛会波及 fixture 与测试。
  - 缓解：同一轮更新 `workbenchFixture.ts`、`compact-command-block.test.tsx`、`session-selectors.test.ts`、`conversation-view-tooltip.test.tsx`、`app-streaming-user-message.test.tsx`。
- 风险：自动压缩失败被吞掉后问题不可见。
  - 缓解：live `compaction-failed` 事件带错误信息显示在对话流；loop 仍写诊断日志。
- 回退：各任务独立提交范围清晰；回退时整体 revert 本计划改动即可，journal 格式不变，无数据迁移。

## 任务

- [x] T1 契约（`packages/shared/src/session.ts`）
  - `ContextCompactionPayload` 增加 `durationMs?: number`、`summary?: string`。
  - `RuntimeStreamEvent`：`context_compaction_started { sessionId, agentRunId, startedAt }`；`context_compaction_finished { sessionId, agentRunId, payload }`；`context_compaction_failed { sessionId, agentRunId, error }`；删除 `context_compaction_progress` 与 trigger / stage / progress 字段。
  - `MessageBlock` `context_compaction`：`status: "running" | "completed" | "failed"`，字段 `startedAt?`、`removedCount?`、`durationMs?`、`summary?`、`errorMessage?`、`createdAt`。
- [x] T2 压缩插件与 loop
  - `CompactionPlugin.compact(session, observer?)` / `maybeCompact(session, usage, observer?)`：选出压缩区域后调用 `observer.onStarted({ entryCount })`，无区域时不调用。
  - `AgentLoopLiveEvent` 增加 `compaction-started`、`compaction-finished { removedCount, durationMs }`、`compaction-failed { message }`；loop 调用点 try/catch，失败发 live 事件后继续发 `completed`。
  - 测试：`packages/compaction/src/test/compaction.test.ts` 覆盖 observer 调用；loop 测试覆盖失败不改变回合结果（按现有测试文件就近补）。
- [x] T3 Stream adapter：`fixed-renderer-stream-adapter.ts` 映射三种 live 事件；补 `apps/desktop/src/main/test` 对应单测。
- [x] T4 Chat 投影（`packages/client/src/sessions/chat.ts`）
  - 被压缩替换的 user / assistant / tool 事件继续投影；摘要 replace 节点不投影为 `user_message`。
  - `compaction/end` → `context_compaction` payload：`removedCount = end - start`、`durationMs = end.time - start.time`、`summary` 取同一 `compactionId` 的 replace 节点文本。
  - 更新 `runtime-v2-fixed-renderer-projection.test.ts:139` 用例为新行为。
- [x] T5 Selector：`contextCompactionBlock` 输出新 `MessageBlock` 字段；更新 `session-selectors.test.ts`。
- [x] T6 组件：重写 `CompactCommandBlock`（running 计时 + 不确定进度条；completed 分隔线按钮展开摘要，耗时取自 journal 的 start/end 时间差，历史回放同样显示；failed 红色分隔线 + 重试）；`ConversationView` 透传 `onRetryCompaction`；更新 `compact-command-block.test.tsx`。
- [x] T7 App 接线：手动 `/compact` 直接 running；compacted 以 durable 投影为准；skipped → Composer 提示「对话还很短，暂时不需要压缩」；failed → 本次 stream 显示失败块；重试走同一 `/compact` 路径；stream handler 适配新事件；向 Composer 传 `isCompacting`。
- [x] T8 Composer：`isCompacting` 时停止按钮 `aria-disabled`，tooltip「压缩完成后可继续」；新增 `statusNotice` 提示行。
- [x] T9 文档：更新 `front-中间消息区规范.md` Context Compaction 一节与 demo（去掉排队内容）；exec-runs 两份文档；history。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/compaction test`、agent-loop 所在包测试、`pnpm --filter @actspace/client test`、`pnpm --filter @actspace/shared test`
  - Desktop：`apps/desktop` 下 vitest 定向跑 `compact-command-block`、`runtime-v2-fixed-renderer-projection`、stream adapter、`app-streaming-user-message`、`conversation-view-tooltip`
  - 各受影响包 typecheck；`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`（若存在）
- 手工检查：浏览器 mock（`docs/FRONTEND_VERIFICATION.md`）看 running / completed 展开 / failed 三态，浅色与深色；Electron 实机手动 `/compact` 与长会话触发自动压缩（人工门禁）。

## 决策记录

- 2026-09-29：手动与自动压缩 UI 完全一致，不再区分 trigger（用户确认）。
- 2026-09-29：进行中和完成都放在对话流；不做上下文占用环预警（用户确认）。
- 2026-09-29：消息队列单独立项，采用 Composer 上方托盘形态；本计划压缩期间不能发送（用户确认）。
- 2026-09-29：压缩中停止按钮置灰，不支持中止压缩（用户确认）。
- 2026-09-29：旧消息在分隔线上方照常显示，不置灰；摘要只在分隔线展开后显示。
- 2026-09-29：完成分隔线的耗时改为 durable（`compaction/end.time - compaction/start.time`），历史回放也显示耗时；demo 原先的「历史回放无耗时」作废。原因：手动压缩完成后页面会重新载入 durable 投影，只靠 live 耗时会在完成瞬间消失。
- 2026-09-29：失败重试沿用该会话最近一次发送的模型选项，走同一 `/compact` 路径。
- 2026-09-29：摘要面板复用 `MarkdownProse`，在 `.compact-command-summary` 下把标题收敛到正文档位（浏览器截图发现原标题比对话正文大）。

## 完成状态

- 2026-09-29：T1–T9 已实现，自动化与浏览器 fixture 截图（浅色 / 深色）通过。剩余人工门禁：Electron 实机手动 `/compact` 与长会话自动压缩，见执行摘要。

## 执行模式

- **交互模式**：涉及 loop live 事件契约与投影行为变化，人在线逐步推进。

## 执行文档

`docs/exec-runs/20260929-context-compaction-timeline/`：`execution-process.md`、`execution-summary.md`。
