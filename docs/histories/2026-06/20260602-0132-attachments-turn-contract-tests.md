## [2026-06-02 01:32] | Task: attachments turn contract tests

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行 `02` 附件计划，先确认任务已执行到哪一步，再完成剩余收尾。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `packages/agent-core`, `docs`

**Key Actions:**

- **[Renderer tests]**: 补充 Composer `Attach files` 菜单、Electron bridge 选择文件、无 preload fallback、拖拽添加、删除附件和发送 payload 的测试覆盖。
- **[Streaming tests]**: 补充 App 层测试，确认附件会进入 `RunTurnInput.attachments`，并且图片预分析以 runtime-only `media_analysis` 工具行显示。
- **[Agent-core tests]**: 补充 adapter / bridge 测试，锁定附件清单和图片分析摘要进入模型输入、结构化写入 `user_message.payload`，且不生成普通 `tool_call` / `tool_result` 历史事件。
- **[Tool contract]**: 修正 `read_file` 描述，使其与实际读边界和附件路径注入一致，允许读取用户明确提供的本地路径。
- **[Plan sync]**: 更新附件执行计划的进度与验证记录，明确 Electron 真实桌面验收仍待补。

### 🧠 Design Intent (Why)

附件链路跨 renderer、preload/main、agent-core 和 session 持久化，单点测试容易漏掉契约漂移。本轮用分层测试把“UI pending attachments -> RunTurnInput -> 模型输入 -> user_message payload -> runtime-only 工具行”的边界钉住，同时避免把图片预分析误持久化成普通工具日志。

### 📁 Files Modified

- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `packages/agent-core/src/test/adapters.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/agent-core/src/tools/tools/read-file/definition.ts`
- `packages/agent-core/src/tools/test/read-boundary.test.ts`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/02-attachments-ipc-and-turn-contract.md`
