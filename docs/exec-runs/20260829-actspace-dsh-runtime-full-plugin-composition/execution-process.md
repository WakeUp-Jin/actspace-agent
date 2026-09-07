# ActSpace DSH 风格 Runtime 全量插件组装 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-dsh-runtime-full-plugin-composition/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29 10:19
- **结束时间**：2026-08-29 12:22

## 执行时间线

### 步骤 1：确认 Phase 1 基线和迁移边界

- **操作**：读取仓库协作、架构、计划与 Agent Runtime 规范，检查 `packages/boot`、`packages/cordis-adapter`、`packages/runtime`、CLI/Desktop Host Adapter 和 DSH 参考实现。
- **影响文件**：无。
- **决定**：Phase 1 采用兼容式地基。先把 Host facts、Context service lookup 和 RuntimeHandle facade 固定下来，不在本阶段提前迁移 Session/LLM/Tools/AgentLoop 的实例所有权。
- **验证**：变更前 `@actspace/cordis-adapter`、`@actspace/boot`、`@actspace/runtime` typecheck/test 全部通过。

### 步骤 2：建立统一 Host service contract

- **操作**：新增 `RuntimeHostServices`、稳定 Context service ID 和不可变 capability ceiling；CLI/Desktop 在 Cordis Include 挂载前构造同一 Host contract。
- **影响文件**：
  - `packages/runtime/src/runtime/host-services.ts`
  - `apps/cli/src/runtime-v2/host-adapter.ts`
  - `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- **决定**：Host service 只携带 descriptor、路径、capability 和外部端口；Session、LLM、Tools、AgentLoop 不进入 Host contract。
- **验证**：Runtime、CLI、Desktop typecheck 通过；Host contract 单测确认 capability snapshot 不受调用方后续修改影响。

### 步骤 3：让 RuntimeHandle 通过 Context facade 解析服务

- **操作**：新增 `RuntimeServiceFacade`；`RuntimeHandle` 不再直接保存 Session、RunController、Compaction 和 LLM 字段，而是按调用从 facade 解析。Phase 1 使用 Context bridge service，未迁移服务则使用兼容 fallback。
- **影响文件**：
  - `packages/runtime/src/runtime/runtime-facade.ts`
  - `packages/runtime/src/runtime/runtime-handle.ts`
  - `packages/runtime/src/runtime/boot.ts`
  - `packages/runtime/src/runtime/index.ts`
- **决定**：使用独立的 Host-facing Context service ID，避免与当前只暴露 class/module surface 的 `session.persistence`、`llm.service` 等过渡服务混淆。
- **验证**：Runtime facade 单测确认 Context service 优先、migration fallback 次之；RuntimeHandle 不暴露 raw Context。

### 步骤 4：补强 Loader settlement 和失败清理

- **操作**：`bootDshCordis` 增加 settlement 后 required service validation；缺少服务时不发布 Boot 结果并释放 partial root。Runtime DSH tree 当前要求 `actspace.runtime`、`core.agent`、`agent.loop`。
- **影响文件**：
  - `packages/boot/src/dsh-boot.ts`
  - `packages/boot/tests/cordis-config.spec.ts`
  - `packages/runtime/src/runtime/boot.ts`
- **决定**：required service 验证必须发生在 Loader settlement 之后、RuntimeHandle 发布之前；Host preparation 则必须发生在 Include 挂载之前。
- **验证**：Boot 7 tests 通过，包括 Host preparation 可见、required service 缺失、activation error、pending service 和 reverse cleanup。

### 步骤 5：Phase 1 回归与真实 CLI smoke

- **操作**：构建 CLI 依赖闭包并运行真实 CLI 进程 mock smoke。
- **影响文件**：无额外源码修改；构建更新本地 `dist/`。
- **验证**：
  - Runtime 3 tests 通过；
  - CLI 14 tests 通过；
  - Desktop typecheck 与现有 Desktop 测试通过；
  - `node apps/cli/dist/cli.js run --input "phase one smoke" --workspace . --mock --json` 返回 `ok: true`、`status: completed`、稳定 Session snapshot。

### 步骤 6：迁移基础领域服务的实例所有权

- **操作**：新增 Runtime-owned `cordis.yml`，通过真实 Include/Loader 组合 Session Journal、Session Runtime、LLM、Tool Runtime、Context、Prompt、Compaction、Core Tools、Browser Tools、Agent 和 AgentLoop。各 Behavior 在 `apply(ctx, config)` 中创建真实实例并注册 effect disposer；Host 只提供 route/credential、工具端口、Prompt source、Browser capability 和其他外部事实。
- **影响文件**：`packages/runtime/cordis.yml`、`packages/runtime/src/config-path.ts`、`packages/runtime/src/runtime/session-plugin.ts`、`packages/runtime/src/runtime/boot.ts`、LLM/Tools/Prompt/Context/Compaction/Session Journal 各 plugin，以及 CLI/Desktop Host Adapter。
- **决定**：默认 DSH 路径由 `bootDshClaimedRuntime()` 独占；旧构造器仅保留在显式 legacy 分支。CLI/Desktop 不再在默认启动路径中 `new LlmService()`、`new ToolRuntime()` 或直接注册 Core/Browser Tools。Session Runtime plugin 负责 SessionStore、recovery、flush、close 和 `session/event` 通知；通知仍在 Journal append 成功之后发出。
- **验证**：真实构建后的 CLI 进程 mock run 成功；persistent Journal 顺序包含 inbox enqueue/claim、turn/step、request、assistant、`session/end-seed`；`pnpm -r typecheck`、`pnpm -r test`、`check:docs`、`git diff --check` 全部通过。

### 步骤 7：Phase 3 Agent Registry、AgentLoop、Subagent ownership 迁移

- **操作**：`core.agent` Behavior 创建并发布 `AgentRegistry`；新增 Runtime Agent factory/runtime Behaviors，由 Context 注入 Session、LLM、Tools、Prompt、Compaction 和 Host policy，创建主 Agent、AgentLoop Service、RunController、Todo/Subagent tool registrations。Boot 不再创建 DSH 默认路径的 AgentLoop、Registry 或 Subagent provider。
- **影响文件**：`packages/core/agent/src/plugin.ts`、`packages/runtime/src/runtime/agent-host-port.ts`、`agent-factory-plugin.ts`、`agent-runtime-plugin.ts`、`packages/runtime/cordis.yml`、`packages/runtime/src/runtime/boot.ts`。
- **验证**：Runtime dependency-closure build 通过；实际 CLI mock run 返回 `ok: true`。

### 步骤 8：Phase 4 Headless runner 与 CLI run 切换

- **操作**：新增 `@actspace/headless` package 和 `headless.runner` Behavior；runner 负责创建/恢复 Session、调用 `agent.followup()`、等待 idle、flush 并返回结果。CLI 只准备 Host input、SIGINT callback、输出投影和 artifact 导出，不再调用 `handle.runTurn()` 驱动单次任务。
- **影响文件**：`packages/headless/`、`packages/runtime/src/runtime/headless-plugin.ts`、`runtime-handle.ts`、`runtime-facade.ts`、`apps/cli/src/runtime-v2/host-adapter.ts`、`run.ts`、`packages/runtime/cordis.yml`。
- **验证**：CLI 14 tests、headless lifecycle test、真实 `cli run --mock --persist` smoke 通过；Journal 证据为 title → inbox enqueue/claim → turn/step → request → assistant → end-seed。

### 步骤 9：Phase 5 Desktop 与 Phase 6 默认路径收口

- **操作**：Desktop `plugins.json` 改为仅在显式 `legacyPluginsConfigPath` 下读取；默认路径不读取、不构造 empty plugin set，也不向 Runtime 传 codec loader。`bootRuntime` 现在要求显式 Cordis `configPath`，旧构造器仅可通过 `legacy: true` 和完整旧实例显式进入。
- **影响文件**：`apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`、`packages/runtime/src/runtime/boot.ts`。
- **验证**：`pnpm -r typecheck`、`pnpm -r test`（Desktop 522、CLI 14、各 package tests）、`check:docs`、`check:current-docs`、`check:packages`、`check:v2-legacy-removal --strict`、`check:secrets`、`git diff --check` 通过。

## 遇到的问题

- **问题**：CLI/Desktop typecheck 最初读取了旧的 `@actspace/runtime/dist` 声明，因此看不到新增 Host API。
  - **原因**：应用通过包名消费 Runtime 构建产物，而不是直接引用 sibling `src/`。
  - **应对**：先执行 `pnpm --filter @actspace/runtime build`，再执行应用 typecheck；随后使用 `pnpm --filter @actspace/agent-cli... build` 验证完整依赖闭包。

## 跳过或推迟的事项

- 真实 Provider、Electron、Chrome/Browser Bridge、DMG、签名/公证和 clean-checkout 发行门禁未在本轮自动化环境中执行。
- CLI chat 仍使用 RuntimeHandle 的交互 API，但与单次 run 共用同一 DSH plugin tree；chat UX 不在本计划范围内。
- 不可信插件校验、在线 HMR/config reconcile、Goal/Schedule producer 仍未实现。
