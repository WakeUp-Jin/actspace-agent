# ActSpace 核心 Cordis Service 化与能力 seam — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-core-cordis-services/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29
- **结束时间**：2026-08-29

## 执行时间线

### 步骤 1：基线检查

- **操作**：读取仓库规则、架构规范、Service 化设计规范和执行计划；检查当前 Runtime、Cordis adapter、Session、LLM、Prompt、Tool、Agent 和 Compaction 实现。
- **影响文件**：无代码文件修改；新增本执行记录。
- **决定**：保留现有工具 executor、13 个 Session 核心事件、9 个 Loop 干预事件、5 个通知和 CLI 单次 run 作为不变资产；Service 化只收敛长期运行时能力。
- **验证**：当前仓库已有大量用户/前序任务 dirty-worktree 变更，本轮不清理、不回滚；后续只检查本计划范围。

### 步骤 2：Phase 1

- **操作**：在 `@actspace/cordis-adapter` 增加 Service id、Definition/Provider/Consumer、required lookup 和真实 Cordis Service 导出；恢复源码缺失但构建产物仍引用的 EventHub 过渡桥接；加入真实 Fiber 的 inject、Config、apply failure、Effect cleanup 和幂等 dispose fixtures。
- **影响文件**：`packages/cordis-adapter/src/service-contract.ts`、`packages/cordis-adapter/src/events.ts`、`packages/cordis-adapter/src/index.ts`、`packages/cordis-adapter/src/event-contract.ts`、`packages/cordis-adapter/package.json`、`packages/cordis-adapter/tests/service-contract.spec.ts`、`packages/test-support/src/service-fixtures.ts`、`packages/test-support/package.json`。
- **决定**：保留当前 service id 作为切换期间的 ABI（`session.runtime` 另标为 controller，新增 `session.store` 作为 live-log owner）；EventHub 只保留为旧内核过渡 adapter，不把它提升为新的默认事件总线。
- **验证**：`pnpm --filter @actspace/cordis-adapter build`、`typecheck`、`test` 通过；`pnpm --filter @actspace/test-support typecheck` 通过；adapter 15 个测试通过（1 个明确 skip 的 real Loader smoke）。

### 步骤 3：Phase 2

- **操作**：将 JSONL durability 抽成 `SessionPersistence` provider seam；添加 `JsonlSessionPersistenceService` 与 `SessionStoreService`，均由 Cordis Fiber 注册；SessionHandle 增加 post-commit `onEvent` 与 awaited `onFlush`；Runtime session plugin 注入 provider/store，而不是在 controller 内默认创建 JSONL backend；增加 fake provider 和事件边界测试。
- **影响文件**：`packages/session/persistence/src/session-persistence.ts`、`session-store.ts`、`session.ts`、`plugin.ts`、`index.ts`、`src/test/provider-seam.test.ts`、`src/test/lifecycle.test.ts`、`src/test/persistence.test.ts`、`packages/runtime/src/runtime/session-plugin.ts`、`session-controller.ts`、`packages/runtime/cordis.yml`。
- **决定**：JSONL writer、lease、recovery、projection 算法不改；`SessionStore` 负责 header 校验和 live-log facade，provider 负责文件布局/inspect/open/fork/create；`session/event` 代表已 durable 的事实，`session/flush` 代表可等待 checkpoint。
- **验证**：`@actspace/session-persistence` typecheck 通过；其 34 个测试通过；`@actspace/session-journal` 9 个测试、`@actspace/session-jsonl` 1 个测试、`@actspace/session-projection` 1 个测试通过；adapter/test-support 相关检查通过。

### 步骤 4：Phase 3

- **操作**：将 LLM route registry、Prompt source/contributor seam、Context assembler、ToolRuntime registry/scheduler 和 Compaction policy/summarizer 分别由真实 Cordis Service 持有；为各 Service 声明 `static inject`/Config，并把 provider registration 和 cache/resource 清理挂到 Fiber effect。保留 `activate()` 仅作为显式 legacy/test surface。
- **影响文件**：`packages/llm/service/src/service.ts`、`packages/llm/service/src/plugin.ts`、`packages/tools/runtime/src/runtime.ts`、`packages/tools/runtime/src/plugin.ts`、`packages/context/src/assembly.ts`、`packages/context/src/plugin.ts`、`packages/prompt/src/plugin.ts`、`packages/compaction/src/plugin.ts`、对应 lifecycle tests，以及本执行记录。
- **决定**：Service 是长期 registry/lease/lifecycle 的 canonical owner；旧 `LlmService`、`ToolRuntime`、`ContextAssembler`、`CompactionPlugin` 作为内部算法/行为对象继续复用，由 Service 做最薄的生命周期包装；不修改工具 executor body、LLM PreparedCall 或 compaction transaction 算法。
- **验证**：LLM service typecheck/test 通过（11 tests）；ToolRuntime typecheck/test 通过（17 tests）；Context typecheck/test 通过（3 tests）；Prompt typecheck/test 通过（6 tests）；Compaction typecheck/test 通过（3 tests）。

### 步骤 5：Phase 4

- **操作**：把 AgentRegistry、AgentLoop driver 和 AgentRuntime 的 ownership 迁入真实 Cordis Service；Service 内部继续复用已有 Registry、durable followup、RunController 和 OneShotSubagentProvider，并将 quiesce/dispose drain 统一挂到 Fiber effect。补充 Agent 创建失败回滚、two-agent scope 隔离、observer failure 隔离和依赖环 negative contract，并同步更新 manifest 的 canonical service contributions。
- **影响文件**：`packages/core/agent/src/registry.ts`、`packages/core/agent/src/plugin.ts`、`packages/core/agent/src/manifest.ts`、`packages/core/agent/src/test/lifecycle.test.ts`、`packages/core/agent-loop/src/service.ts`、`packages/core/agent-loop/src/plugin.ts`、`packages/core/agent-loop/src/manifest.ts`、`packages/core/agent-loop/src/test/lifecycle.test.ts`、`packages/runtime/src/runtime/agent-runtime-plugin.ts`、`packages/runtime/src/runtime/agent-runtime-lifecycle.test.ts`、`packages/compaction/src/manifest.ts`。
- **决定**：Registry、Loop driver、AgentRuntime 分别只有一个 Cordis owner；`AgentLoopService`/`RunController`/`OneShotSubagentProvider` 的行为算法不重写。当前 `agent-factory-plugin` 和 legacy boot 仍保留显式组装，待本阶段完成事务/依赖收敛后在 Phase 5 清理默认路径。
- **验证**：`@actspace/core-agent` typecheck/test 通过（6 tests）；`@actspace/core-agent-loop` typecheck/test 通过（4 tests）；`@actspace/runtime` typecheck/test 通过（4 tests）；adapter dependency-cycle contract 通过（19 tests，1 skip）。

### 步骤 6：Phase 5

- **操作**：收缩默认 DSH Boot 的 shutdown ownership：RuntimeHandle 不再直接调用 `agentRuntime.runs.dispose()`，而由 `AgentRuntimeService` 的 Cordis Fiber effect 负责 RunController/子 Agent drain；同步确认 Runtime facade 仍只暴露 Host-neutral service facade。完成 CLI 单次无头 mock run、SIGINT process smoke、CLI package tests 和仓库全量 typecheck/test。
- **影响文件**：`packages/runtime/src/runtime/boot.ts`、`packages/runtime/src/runtime/index.ts`、本执行记录与摘要。
- **决定**：默认 `cordis.yml` 路径保持唯一生产入口；legacy/diagnostic boot 仍显式可选，但不再影响默认 shutdown。工具 executor、Session 13 事件、Loop 9 干预和 5 通知均保持既有语义。
- **验证**：`@actspace/runtime` typecheck/test 通过（4 tests）；`@actspace/runtime` 与 CLI build 通过；CLI package tests 14 passed；CLI process smoke 2 passed；CLI `run --mock --json` 返回 `ok:true`、`status:completed`、1 step、11 durable events；全量 `pnpm -r typecheck` 与 `pnpm -r test` 通过。

## 遇到的问题

- **问题**：当前 ActSpace 已有 `apply(ctx)` 和 DSH-native Boot，但核心对象仍多为普通 class，且旧 `activate()`、`serviceValues` 和手工 Loop 构造仍存在于诊断/迁移路径。
  - **原因**：上一轮切换完成了插件组装入口，但还没有把所有领域能力的生命周期完全交给 Cordis Service。
  - **应对**：本计划分阶段收敛；默认路径优先清理，显式 legacy/测试路径不扩大为新的业务 ABI。
- **问题**：执行 `@actspace/runtime` build/typecheck 时，前序并行 Scope 计划的源码与已链接 package dist 不一致，报 `scopeContext` 未导出和 `AgentScope.scopeKey` 缺失。
  - **原因**：该工作区已经包含大量未提交的前序重构，Scope seam 尚未完成或尚未重建依赖闭包。
  - **应对**：不修改 Scope 计划范围、不回滚用户变更；随着工作区依赖重建，该问题已不再阻断全量 typecheck，本轮仍未改动 Scope 算法。
- **问题**：`pnpm run check:docs` 被仓库已有 active plan `20260829-actspace-cordis-event-abi-final-acceptance` 未登记到 `docs/exec-plans/README.md` 阻断。
  - **应对**：完成本计划归档并更新设计入口后，`check:docs` 与 `check:current-docs` 均已通过；该已有 active plan 的登记问题不再阻断本计划。

## 跳过或推迟的事项

- 具体工具 executor、Browser Bridge 和 Session 物理格式暂不重写，遵循计划非目标。
- CLI chat、Goal/Schedule producer、在线 HMR 和不可信插件沙箱暂不处理。
