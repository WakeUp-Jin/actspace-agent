## [2026-07-03 10:42] | Task: Preserve Bash failure output

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> Bash 工具超时后已经能返回，但 UI 里仍显示 `Tool execution failed`，需要继续看最新日志并修掉失败输出丢失的问题。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`

**Key Actions:**

- **[Failure render]**: Tool scheduler 对失败结果也允许执行 `renderResult`，避免 Bash 已捕获的 `stdout/stderr` 被通用 `error` 文案覆盖。
- **[Model output]**: Agent loop 和 bridge 在失败工具结果里优先使用 rendered string `data`，让模型下一轮能看到真实编译/运行错误。
- **[UI preview]**: Desktop streaming Bash preview 不再硬编码 `Tool execution failed`，保留 typed preview 里的真实失败输出。
- **[Run log preview]**: `[agent-run] tool finished` console 摘要改为使用同一套工具输出文本，方便从 `logs/latest-dev.log` 排障。
- **[Regression tests]**: 新增失败 Bash 的 model output、UI preview、run log 输出断言。

### 🧠 Design Intent (Why)

这次最新日志说明超时链路已经恢复：Bash 命令超时后会产生 `tool_finished`，Agent Loop 也会继续下一轮。真正的新问题是失败工具结果在后处理、模型消息、bridge preview 和桌面 UI 几层被当成普通错误处理，只保留 `error` 字段，丢掉了 Bash 结果里的真实 `output`。

Bash 这类工具的失败输出通常就是下一步诊断所需的主信息。退出码只说明失败，`stdout/stderr` 才说明为什么失败。因此失败结果也必须经过渲染，并作为 model-visible output、UI preview 和日志摘要的一等数据保留下来。

### 📁 Files Modified

- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/loop.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/desktop/src/renderer/App.tsx`
