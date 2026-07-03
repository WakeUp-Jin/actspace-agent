## [2026-07-03 09:55] | Task: Fix Bash timeout return

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> Bash 工具超时后应该直接返回结果，让 Agent Loop 继续循环；先补充超时机制，后台运行等更大改造后续再讨论。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`

**Key Actions:**

- **[Timeout return]**: `runProcess` 超时后先发送 `SIGTERM`，短暂宽限后升级 `SIGKILL`，并在超时终止路径上保证 Promise resolve。
- **[Process group kill]**: 非 Windows 平台以 detached process group 启动子进程，优先对进程组发信号，覆盖 shell 子进程继续持有 stdout/stderr 的场景。
- **[Regression test]**: 新增 shell 子进程忽略 `SIGTERM` 的 streaming 模式测试，锁定超时后必须返回当前已捕获输出。

### 🧠 Design Intent (Why)

Bash 工具之前只在 timeout 时调用 `child.kill("SIGTERM")`，如果 shell 启动的子进程继续运行或继续持有 pipe，`close` 可能不触发，导致工具调用没有 `tool_finished`，Agent Loop 卡在工具执行中。新的实现把 timeout 变成确定性的工具结果：尽量终止进程树，同时返回已捕获输出和 `timedOut` 状态。

### 📁 Files Modified

- `packages/agent-core/src/tools/subprocess/run-process.ts`
- `packages/agent-core/src/tools/test/subprocess.test.ts`
