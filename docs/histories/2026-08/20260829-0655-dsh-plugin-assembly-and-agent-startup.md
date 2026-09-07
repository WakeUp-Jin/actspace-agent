## [2026-08-29 06:55] | Task: 将 CLI 组装与 Agent 启动切换到 DSH 风格

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 新建独立设计规范和执行计划，并按 DSH 的 `cordis.yml + Include + Cordis Loader + apply(ctx)` 模型实现插件组装、Agent 创建和 durable followup；不要修改旧核心计划 P00/P04。

### 🛠 Changes Overview

**Scope:** Cordis adapter、Boot、AgentLoop、Runtime、CLI 和执行文档。

**Key Actions:**

- 新增真实 `cordis.yml` Boot seam，由 Loader/Include 加载 trusted Behavior；新 Behavior ABI 接受真实 Cordis Context，并拒绝旧 `activate()` 协议。
- 新增 `AgentLoopService` 与 Managed Agent facade，使输入先进入 durable inbox，再 claim 并启动 turn；Runtime RunController 改由 Service 驱动。
- 将 Agent Loop/Tool 的 EventHub-shaped kernel API 桥接到真实 Cordis Context，使插件可以用 `ctx.on()` 接收插入点和通知。
- CLI 默认不再读取 `runtime-v2/plugins.json`，改为加载仓库内 `apps/cli/cordis.yml`；保留现有工具 executor 和 Session 内核。
- 增加真实 Cordis lifecycle、Behavior、followup 顺序与构建后 CLI persistent smoke 验证。

### 🧠 Design Intent (Why)

把 Host 从自定义 Manifest/activate 激活协议中抽离，让 Cordis Loader 和插件自己的 `apply(ctx)` 管理组合与生命周期；同时确保用户输入在执行前先成为 durable inbox 事实，避免重连或失败时丢失输入。

### 📁 Files Modified

- `apps/cli/cordis.yml`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `packages/boot/src/dsh-boot.ts`
- `packages/boot/src/trusted-boot.ts`
- `packages/cordis-adapter/src/behavior-loader.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/events.ts`
- `packages/core/agent/src/inbox.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/run-controller.ts`
- `docs/exec-runs/20260829-actspace-dsh-plugin-assembly-and-agent-startup/`
