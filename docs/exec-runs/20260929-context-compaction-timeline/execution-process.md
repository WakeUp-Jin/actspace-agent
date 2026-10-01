# 对话流里的上下文压缩 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260929-context-compaction-timeline.md`
- **执行模式**：交互
- **开始时间**：2026-09-29 18:30
- **结束时间**：2026-09-29 22:30

## 执行时间线

### 步骤 1：调研与设计确认

- **操作**：梳理 v1/v2 压缩链路；参考 Codex / opencode / Cursor 的压缩呈现；产出 HTML demo 与用户确认（只做「进行中」与「完成后」，手动与自动不区分，中文文案，摘要可展开）。
- **影响文件**：`docs/design-docs/frontend/context-compaction-demo.html`、计划文件。
- **决定**：用户中途提出 Codex 式消息队列托盘，经确认拆为独立功能；本计划压缩中不能发送，停止按钮置灰。

### 步骤 2：T1 契约 + T5 Selector

- **操作**：`RuntimeStreamEvent` 收敛为 `context_compaction_started / finished / failed`，删除 `context_compaction_progress`；`ContextCompactionPayload` 增加 `durationMs`、`summary`；`MessageBlock.context_compaction` 收敛为 `running | completed | failed`。`contextCompactionBlock` 丢弃 skipped，failed 带原因，completed 带条数 / 耗时 / 摘要。
- **影响文件**：`packages/shared/src/session.ts`、`session-selectors.ts`、`test/session-selectors.test.ts`。
- **验证**：shared 测试通过。

### 步骤 3：T2 压缩插件与 loop

- **操作**：`compact(session, observer?)` / `maybeCompact(session, usage, observer?)` 在选出区域后调用 `onStarted`；loop 新增 `autoCompact`，发出 `compaction-started / finished / failed` live 事件，失败只上报不抛出。
- **影响文件**：`packages/compaction/src/plugin.ts` 及测试；`packages/core/agent-loop/src/loop.ts`、`testing.ts`、新增 `test/auto-compaction.test.ts`。
- **验证**：compaction 7 项、agent-loop 27 项通过。

### 步骤 4：T3 Stream adapter

- **操作**：`FixedRendererStreamAdapter` 映射三种 live 事件为 renderer stream 事件。
- **影响文件**：`apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts`、`test/runtime-v2-tool-stream.test.ts`。

### 步骤 5：T4 Chat 投影

- **操作**：`indexActiveSurface` 改为 `showsMessage / showsToolCall`：有效 Surface 中的节点，或被 replace 的 `sourceEventSeqs` 覆盖的节点都显示；摘要 replace 节点不再投影为 `user_message`；`compaction/end` payload 补 `removedCount = end - start`、`durationMs`（start/end 事件时间差）、`summary`（同 compactionId 的 replace 节点文本），去掉写死的 `trigger: "manual"`。
- **影响文件**：`packages/client/src/sessions/chat.ts`、`apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts`。
- **决定**：耗时做成 durable，历史回放也显示（偏离 demo 的「历史回放无耗时」），因为手动压缩完成后页面会重载 durable 投影，live 耗时会在完成瞬间消失。
- **验证**：投影测试 20 项通过；新用例断言旧消息保留、分隔线带 `removedCount: 2 / durationMs: 12000 / summary`。

### 步骤 6：T6 组件 + T8 Composer

- **操作**：重写 `CompactCommandBlock`（计时、不确定进度条、可展开摘要 + 复制、失败 + 重试）；`CompactionRetryContext` 提供重试入口，避免穿过 `renderMessage` 位置参数；Composer 增加 `isCompacting`（停止按钮 `aria-disabled` + 「压缩完成后可继续」）与 `statusNotice`；`ConversationView`、`WorkbenchLayout` 透传。
- **影响文件**：`CompactCommandBlock.tsx`、`Composer.tsx`、`ConversationView.tsx`、`WorkbenchLayout.tsx`、`styles/markdown.css`。

### 步骤 7：T7 App 接线

- **操作**：手动 `/compact` 直接 running（带 `startedAt`）；IPC 抛错 → 失败块（清洗 Electron 包装前缀）；skipped → Composer 提示 3 秒；运行结束时若压缩失败，按会话保留失败块直到该会话下一次发送；重试沿用最近一次发送选项；stream handler 适配新事件；`isCompacting` 由 streaming 块推导。
- **影响文件**：`apps/desktop/src/renderer/App.tsx` 及 `app-streaming-user-message`、`compact-command-block`、`conversation-view-tooltip` 测试与 `workbenchFixture.ts`。

### 步骤 8：验证

- 包：shared 138、compaction 7、client 10、agent-loop 27 全部通过；client typecheck 通过。
- Desktop：renderer 与 electron typecheck 通过（仅既有 `editor-poc.test.tsx` 缺 prosemirror 依赖报错）；全量 vitest 935/936 通过。
- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 通过。
- 浏览器 fixture（临时 `compaction-check.html`，截图后已删除）在浅色 / 深色下查看 running、completed 展开、failed、Composer 置灰与提示：截图 `compaction-light.png`、`compaction-dark.png`。

## 遇到的问题

- **问题**：失败分隔线在截图中是灰色。
  - **原因**：`text-text-faint` 与 `text-on-danger` 同时出现，生效取决于 Tailwind 生成顺序。
  - **应对**：颜色类按状态二选一，不再叠加。
- **问题**：摘要面板里的 Markdown 标题比对话正文还大。
  - **应对**：`.compact-command-summary .markdown-prose` 下把标题收敛到正文档位。
- **问题**：loop 测试中自动压缩不触发。
  - **原因**：fixture 使用 `EMPTY_LLM_USAGE`，token 为 null，`compactionUsage` 返回 null。
  - **应对**：`runToolStreamFixture` 增加 `usage` 选项。

## 跳过或推迟的事项

- 消息队列 / Steer：用户决定单独立项。
- 压缩失败持久化：journal 无失败事件类型，本次不新增。
- Electron 实机验收：需要人工，见执行摘要。
- `src/main/test/workspace-git-context-service.test.ts` 的「non-repository」用例在当前沙箱失败（git 返回 failed 而非 not_repository），与本次改动无关，未处理。
