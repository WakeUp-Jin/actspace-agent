## [2026-07-03 09:37] | Task: 修复 write_file 完成态预览

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 用户截图反馈写入工具在调用后显示为空白框，希望确认写入工具设计规范，并修复完成后应显示写入行数与 diff 的状态。

### Changes Overview

**Scope:** `packages/agent-core`, `packages/shared`

**Key Actions:**

- **[Runtime preview]**: `tool_finished` 流式事件现在为普通工具生成最终 `ToolUiPreview`，不再只有 SubAgent 才带完成态 preview。
- **[Write preview]**: `write_file` 完成后会通过最终 diff preview 带出 `additions`、`deletions` 和 `diff`，前端可从 running 的 `Write file...` 切换到 `Write file +N` 折叠态。
- **[Session restore]**: `session-selectors` 恢复 `write` preview 时保留 `streamingContent` 字段，避免恢复链路和实时链路展示语义分叉。
- **[Tests]**: 补充 bridge 回归测试锁定 `tool_finished.preview`，补充 shared selector 测试锁定 `streamingContent` 透传。

### Design Intent

写入工具的实时展示和持久化恢复都应该消费同一份 typed preview。此前 `tool_started` 能生成 running preview，但 `tool_finished` 没有给普通工具补最终 preview，导致前端在完成态仍拿着空 diff / 0 行统计的 running 数据渲染，表现为写入工具下方空白框。

修复点放在 bridge 的事件映射层，让完成事件复用 `createToolUiPreview()`，保持 `tool_result.uiPreview` 与 `tool_finished.preview` 的语义一致。

### Files Modified

- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/shared/src/test/session-selectors.test.ts`
