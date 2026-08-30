## [2026-08-29 04:35] | Task: 重构 DSH 风格 Agent Loop 核心

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 在不改动当前工具具体实现逻辑的前提下，将 ActSpace 对齐 DeepSeek Harness 的 Session、Agent Loop Cordis 插入事件和通知模型，并先打通 CLI run 的单次无头任务。

### 🛠 Changes Overview

**Scope:** `packages/session/journal`、`packages/session/persistence`、`packages/cordis-adapter`、`packages/tools/runtime`、`packages/core/agent-loop`、`packages/runtime`、`packages/subagent`、`apps/cli`、Desktop durable projection、设计与执行文档。

**Key Actions:**

- **Session kernel**: 将核心持久化事件收敛为 DSH 13 种，保留扩展事件目录并更新 relation/recovery/compaction replay。
- **Cordis surface**: 新增 scoped EventHub，提供 9 个 Agent Loop 干预面、5 个通知面和生命周期 drain。
- **Agent Loop**: 按 `turn/start → step/start → request/header/context → assistant/chunk/message → tool/call/result → step/end → turn/end` 写入事实，并接入 retry/error/abort 和 tool hooks。
- **CLI run**: Runtime 在 post-commit 后派发 `session/event`，退出前追加 `session/end-seed`，CLI artifact trace 使用真实 Journal 事件。
- **Tool boundary**: 保留 read/list/edit/bash/Browser Bridge 等工具的定义、schema、executor、artifact、redaction 和 ordered commit 行为；只替换权限、审批、事件和 Host shell 接口。

### 🧠 Design Intent (Why)

Session Journal 成为唯一 durable truth，live progress 和通知只是派生通道。核心事件使用稳定、可回放的 DSH 事实模型；Cordis 干预面通过 scope 隔离插件影响，Tool Runtime 继续承载现有工具 kernel，避免把成熟的具体工具实现与编排层一起重写。

### 📁 Files Modified

- `packages/session/journal/src/core-codecs.ts`
- `packages/session/journal/src/invariant-validator.ts`
- `packages/session/persistence/src/recovery.ts`
- `packages/session/persistence/src/session.ts`
- `packages/cordis-adapter/src/events.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/runtime/src/runtime/session-controller.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/projection/durable-session.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `docs/design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-agent-loop-cordis-surface.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-boundary.md`
