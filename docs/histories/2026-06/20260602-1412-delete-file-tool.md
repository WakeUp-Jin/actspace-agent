## [2026-06-02 14:12] | Task: Add delete_file Tool

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 执行 `03-delete-file-tool.md` 计划，完成 `delete_file` 工具、审批 UI、测试与文档收尾。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/shared`, `packages/desktop`, `docs`

**Key Actions:**

- **Tool runtime**: 新增 `delete_file`，只删除 workspace 内普通文件，缺失路径、越界、目录和不存在文件返回可读错误。
- **Approval safety**: 默认 `ask` 审批，审批通过只执行当前一次；`delete_file` 不接受 `allow_similar`。
- **Preview and recovery**: 补齐 `delete` preview、streaming preview、bridge summary、`MessageBlock` 和 session 恢复。
- **Renderer UI**: pending approval 使用 `DeleteFileBlock`，普通 running/completed/failed/denied 复用轻量工具行。
- **Docs and tests**: 更新工具预览规范、模块地图、execution plan 进度，并补充 agent-core、desktop、shared 相关测试。

### 🧠 Design Intent (Why)

删除文件属于不可逆写操作，不能继续让模型默认走 `bash rm` 或被相似审批扩大权限范围。单独建模 `delete_file` 可以把路径守卫、一次性审批、前端确认块和 session 恢复统一到 typed tool preview 契约里，让用户在删除发生前看到明确且不可误解的确认动作。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/delete-file/*`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/streaming-preview-extractors.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/session-selectors.ts`
- `packages/desktop/src/main/approval-registry.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/messages/DeleteFileBlock.tsx`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
