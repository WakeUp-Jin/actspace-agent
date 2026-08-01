## [2026-07-31 23:10] | Task: 提取宿主无关 Runtime 并交付双模式 CLI

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop worktree`

### User Query

> 保留 Agent Harness，把会话、Turn、事件、审批和持久化提取成可供 Desktop 与 CLI 共用的 Runtime；CLI 同时提供无头和交互模式，并可分发为单个平台单文件二进制。Web、Voice 和外部评估框架 Adapter 暂不实现。

### Changes Overview

**Scope:** `agent-core`、`desktop`、`agent-cli`、构建与 CI、架构/评估文档

**Key Actions:**

- **Host-neutral Runtime**: 新增实例级 Agent Runtime 和显式 Context / Model / Event / Approval / Workspace Ports，统一 Session 恢复、提交顺序、Abort、terminal event 和清理。
- **Desktop Adapter**: 保留 `runAndPersistTurn()` 兼容入口，改由 Electron Adapter 映射现有 IPC、Settings、审批和 workspace 服务。
- **CLI run / chat**: 无头模式提供 stdin、text / JSON / JSONL、稳定退出码、SIGINT 和评估 sidecar；交互模式提供 persistent Session、TTY 审批、Session lock、new/list/resume。
- **Single executable**: 使用 standalone esbuild bundle、Node SEA、postject 和内嵌 ripgrep，提供本机 smoke 与原生 CI 矩阵。
- **Regression contracts**: 增加 Runtime lifecycle、Host parity、CLI 真实进程、Terminal、Session lock、runtime asset 和 bundle 测试。

### Design Intent (Why)

Agent 的模型循环、Context 和工具执行属于 Harness；产品级 Session、审批、提交和生命周期属于 Runtime；Electron、TTY、stdout 和 SEA 只属于 Host Adapter。把三者分开后，新增 Web 或 Voice 不需要复制 Agent 后端，也不会让 UI 技术进入核心。

### Verification Boundary

- `shared` build 与 68 条测试通过；Agent Core build、Runtime / Bridge / Host parity 相关测试通过。
- Agent Core 全量在沙箱外运行后为 881 / 882 通过；剩余失败是 main 已存在的 `ToolManager` 旧断言仍期待原始拒绝原因，而实现已返回带安全上下文的拒绝消息，本轮未扩大范围修改。
- CLI typecheck、build 与 28 条测试通过（单独触发的二进制存在性测试默认跳过）；Desktop typecheck 与 678 条全量测试通过，跨工作区 Adapter 补充回归 2 条通过。
- docs、secrets、GitHub Actions 固定 SHA 与 `git diff --check` 通过。
- 本机 `darwin-arm64` SEA 已验证最小 PATH、只读二进制目录、并发首次启动、结构化输出、内嵌 ripgrep 和真实 PTY chat。
- 真实 Electron UI 与真实 provider 仍由用户验收；其他平台二进制必须等待各自原生 CI runner，不能从本机结果推断。

### Files Modified

- `packages/agent-core/src/runtime/`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/desktop/src/main/desktop-agent-runtime.ts`
- `packages/agent-cli/src/run.ts`
- `packages/agent-cli/src/chat.ts`
- `packages/agent-cli/src/runtime-adapter.ts`
- `packages/agent-cli/src/binary/`
- `scripts/build-agent-cli-binary.mjs`
- `.github/workflows/agent-cli-binaries.yml`
- `docs/design-docs/agent-runtime/agent-host-neutral-runtime-and-cli.md`

## [2026-08-01 09:35] | Task: 修复 Desktop 回归并完善 CLI 默认工作区

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop worktree`

### User Query

> 修复 Settings 空白和输入框发送无效的问题；CLI 省略 `--workspace` 时应使用当前目录。

### Changes Overview

**Scope:** `desktop renderer`、`agent-cli`、CLI binary smoke、设计与执行文档

**Key Actions:**

- **Settings Hook 稳定性**: 将整页 Settings 返回移动到 Workbench 全部 Hooks 之后，避免页面切换时 Hook 数量变化。
- **模型不可用反馈**: 无可用 provider model 时显示明确状态，并在发送按钮上说明需要先连接模型服务；仍保留安全的禁止发送行为。
- **CLI 当前目录默认值**: `run` 与 `chat` 在未传 `--workspace` 时使用启动进程的当前目录，显式无效路径仍严格报错。
- **分层回归**: 增加组件、函数、真实 Node 子进程和单文件二进制覆盖，并修正 macOS 临时目录真实路径断言。

### Design Intent (Why)

Settings 是同一 Workbench 组件的显示分支，不能改变父组件 Hook 调用序列。发送无效并非事件丢失，而是 provider model 不可用；界面应准确解释状态，而不是绕过模型校验。CLI 的交互使用应默认作用于当前项目，自动化仍可显式传入 workspace 获得稳定边界。

### Verification Boundary

- Desktop typecheck 与 681 条测试通过。
- CLI typecheck 与 31 条测试通过；真实子进程覆盖默认 cwd。
- 本机 `darwin-arm64` 单文件二进制重新构建并通过 smoke，覆盖默认 cwd。
- 真实 Electron 验证 Settings 可见与无模型阻塞提示；未调用真实 provider。

### Files Modified

- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/agent-cli/src/run.ts`
- `packages/agent-cli/src/chat.ts`
- `packages/agent-cli/src/args.ts`
- `packages/agent-cli/src/test/process-smoke.test.ts`
- `scripts/test-agent-cli-binary.mjs`
- `docs/design-docs/agent-runtime/agent-host-neutral-runtime-and-cli.md`

## [2026-08-01 09:58] | Task: 聚合 CLI Thinking 流式分片

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop worktree`

### User Query

> CLI 不应把模型 thinking 的每个流式分片分别打印成一行，需要聚合成可读输出。

### Changes Overview

**Scope:** `agent-cli` Terminal Host、Runtime/CLI 设计文档

**Key Actions:**

- **语义块聚合**: TerminalRenderer 缓存连续 `assistant_thinking_delta`，在工具、正式回复、诊断或 Turn 终态边界刷新为一个 `[thinking]` 块。
- **协议边界不变**: 不修改 `RuntimeStreamEvent` 和 `run --jsonl`，Desktop 与机器调用方继续获得原始细粒度事件。
- **回归覆盖**: 验证多个 delta 在边界前不产生终端行、工具边界只刷新一个块、Turn 结束不会丢失剩余 thinking。

### Design Intent (Why)

模型 token 或网络 chunk 的边界不是用户可读结构。事件协议应保留生产者粒度，TTY Host Adapter 再按连续 thinking phase 做 semantic framing，避免为了某个终端呈现而降低跨端事件能力。

### Verification Boundary

- CLI typecheck 通过，32 条测试通过；需要预先存在二进制的测试按设计跳过。
- 本机 `darwin-arm64` 单文件二进制重新构建并通过 smoke。
- 未调用真实 provider；thinking 的真实模型视觉节奏由用户继续验收。

### Files Modified

- `packages/agent-cli/src/terminal-renderer.ts`
- `packages/agent-cli/src/test/terminal-renderer.test.ts`
- `docs/design-docs/agent-runtime/agent-host-neutral-runtime-and-cli.md`
- `docs/exec-plans/active/20260731-agent-runtime-desktop-cli.md`
- `docs/learnings/2026-07/agent-harness-runtime-host-adapter-layering.md`
