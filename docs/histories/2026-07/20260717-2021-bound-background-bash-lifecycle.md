## [2026-07-17 20:21] | Task: 收紧后台 Bash 生命周期

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 后台 Bash 任务统一默认最多运行 30 分钟；单会话最多 8 个；相同 `cwd + command` 不重复启动；每个新用户 turn 首次模型调用前固定注入一次运行任务清单。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、Bash 设计文档

**Key Actions:**

- **后台生命周期上界**：任务从进程启动开始计时，达到 30 分钟后复用进程组终止机制，并通过终态通知说明达到最大运行时间。
- **会话准入限制**：单会话最多同时运行 8 个后台任务；达到上限时返回现有任务清单，不创建新的后台进程。
- **任务去重**：相同 session 内规范化后的 `cwd + command` 已在运行时，返回原 `taskId` 与输出路径。
- **turn 感知**：每个新用户 turn 首次模型调用前注入一次 running 清单；同一内部 Agent loop 不重复注入。
- **回归覆盖**：增加最大运行时间、数量上限、任务去重和首次清单注入测试。

### 🧠 Design Intent (Why)

保留后台任务跨 turn 存活和模型主动终止进程的能力，同时通过统一、机械的时长、数量和身份约束，避免 dev server、watcher 等进程被遗忘或重复启动。运行清单按用户 turn 注入一次，使模型在继续任务时能感知现有进程，又不会在内部多轮工具循环中反复污染上下文。

### 📁 Files Modified

- `packages/agent-core/src/tools/tools/bash/task-registry.ts`
- `packages/agent-core/src/tools/tools/bash/executor.ts`
- `packages/agent-core/src/tools/tools/bash/definition.ts`
- `packages/agent-core/src/tools/tools/bash/index.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools/test/bash-background.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `docs/design-docs/agent-bash工具设计文档.md`

### ✅ Verification

- `pnpm --filter @actspace/agent-core typecheck`：通过。
- Bash + background + bridge 定向测试：98/98 通过。
- `pnpm check:docs`：通过。
- `git diff --check`：通过。
- agent-core 全量测试（沙盒外）：808/809 通过；唯一失败为已有 `subprocess.test.ts` 超时子进程输出断言，与本次改动无关。
