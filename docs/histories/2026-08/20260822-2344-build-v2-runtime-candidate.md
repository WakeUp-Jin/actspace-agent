## [2026-08-22 23:44] | Task: 建立 ActSpace v2 Runtime 候选并校准完整交付计划

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### User Query

> 在已确认的 v2 插件化设计上生成完整执行计划；产品只做一次完整交付，Session 只使用 raw JSONL，未确认项采用评审推荐。

### Changes Overview

**Scope:** `agent-runtime`、`shared/runtime-v2`、`desktop`、`agent-cli`、`docs`

**Key Actions:**

- 建立 NodeNext ESM `@actspace/agent-runtime`、Runtime v2 Host DTO 与 P00-P15 总控计划。
- 实现 raw JSONL Session、LLM/Tool/Prompt/Agent/Subagent/Projection/RuntimeHandle 候选和 131 个 Runtime 行为测试。
- 实现显式 trusted plugin source、codec-first discovery、Behavior service admission、Composition 与 Startup Validation 候选。
- 接入 Desktop candidate 的 typed IPC、fixed renderer 和 snapshot/cursor replay；接入 CLI run/chat，并让 run 默认使用真正的内存 Session。
- 保留 v1 为正式默认，校准 P03/P09/P12-P14 为“执行中”，不越过 P15 no-return gate。

### Design Intent

内部工作包用于隔离风险和积累可复核证据，不构成分阶段产品发布。外部依赖、真实 Electron/Provider/Browser、managed CLI 和工具 parity 未通过前，候选实现不能被包装成完整 v2，也不能删除 v1、Kairos、fs-watch 或 SEA。

### Files Modified

- `packages/agent-runtime/`
- `packages/shared/src/runtime-v2/`
- `packages/desktop/src/main/runtime-v2/`
- `packages/desktop/src/renderer/RuntimeV2Root.tsx`
- `packages/agent-cli/src/runtime-v2/`
- `docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/`
- `docs/exec-runs/actspace-v2-*`

### Validation

- Agent Runtime：33 files、131 passed，2 个 gated real-package smoke skipped by default。
- Agent Runtime strict TypeScript：通过。
- CLI v2 mock：2 files、8/8 tests。
- `pnpm check:docs`：通过。
- fresh dependency install、真实 Cordis/pi-ai、Desktop tests/package、managed CLI、Provider/Browser/TTY：尚未通过，保持发布阻断。

### Follow-up: 2026-08-23

- 把 LLM route 的 retry policy 归属落实到 AgentLoop：每次 wire attempt 使用 one-shot PreparedCall；失败只在没有 observable delta 时写入 `llm/error`、`llm/retry`、`llm/retry-started`，checkpoint 失败或 abort 会 fail-closed。
- 两个 provider backend 统一读取公开错误对象的 status、provider code 和 `Retry-After`，保留 scoped proxy legacy backend，SDK 内部 retry 仍关闭。
- Cordis admission 增加 ESM/types/peer/family root/forbidden HMR 检查；使用 DSH 已构建发布包通过真实 Loader/Timer/Include/Group lifecycle smoke。registry install 和 packaged gate 仍未伪造通过。
- 新增 `check:v2-legacy-removal`，并将新 Tool scheduler 改名为 `ToolExecutionScheduler`，避免把旧 v1 symbol 带入最终 cutover 扫描。
- 修复 RuntimeHandle、TrustedBootCandidate、CLI 和 Desktop disposer 的失败重试语义：清理失败不会永久缓存 rejected promise；下一次 dispose 会继续未完成的资源清理。
- Desktop/CLI 的 `inspect_image` 已接入 Session-owned artifact reader 与 vision-model fail-closed 解析；执行记录同步移除过时的“未实现”描述。

### Follow-up Validation

- `agent-runtime`：33 files、131 passed，2 个 gated real-package smoke skipped by default；runtime typecheck passed。
- CLI/Desktop v2 isolation typechecks passed；CLI/approval/artifact focused tests 4 files、6 passed。
- repo script tests 11 passed；`check:docs`、`check:repo`、`check:secrets`、`check:v2-legacy-removal`、`git diff --check` passed。
- `pnpm install --lockfile-only` remains blocked by registry DNS; escalated retry was rejected by approval service 503. Browser check additionally lacks pnpm-restored `tsc/esbuild`.
- `pnpm install --frozen-lockfile --offline` validates root override/importer metadata but remains blocked because the five published Cordis package records are unavailable locally; no fabricated integrity values were added.
