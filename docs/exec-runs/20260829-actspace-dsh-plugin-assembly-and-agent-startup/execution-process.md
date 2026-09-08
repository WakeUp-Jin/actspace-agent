# ActSpace DSH 风格插件组装与 Agent 启动实现计划 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-dsh-plugin-assembly-and-agent-startup/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29 05:50 +0800
- **结束时间**：2026-08-29 07:02 +0800

## 执行时间线

### 步骤 1：启动执行记录与范围确认

- **操作**：用户批准执行独立的 DSH 风格插件组装与 Agent 启动计划；读取仓库规则、Agent 开发技能、设计规范和执行计划，确认本轮不修改旧核心重构计划的 P00/P04。
- **影响文件**：本执行记录、关联执行计划状态。
- **决定**：采用交互模式，先实现 Phase 1 的真实 Cordis Boot/Loader seam，再逐阶段验证，不直接进行 CLI 默认切换。
- **验证**：已确认计划、设计规范和旧计划路径；未对旧 P00/P04 文件执行编辑。

### 步骤 2：Phase 1 代码勘察

- **操作**：检查 ActSpace cordis-adapter、boot、runtime、Agent Loop 当前入口，以及 `tmp/deepseek-harness` 的 Cordis/Loader/Include 启动实现。
- **影响文件**：无（只读勘察）。
- **决定**：先复用现有精确锁版 Cordis 依赖和 adapter 边界，避免引入第二套事件或自定义 Loader。
- **验证**：待完成源码对照后记录。

### 步骤 3：Phase 1 真实 Cordis Boot seam

- **操作**：新增 `bootDshCordis()`、`mountCordisConfig()` 和 `createCordisRootFromConfig()`；通过真实 Loader/Include 加载临时 `cordis.yml`，覆盖真实 Context、事件、Effect、缺失依赖、激活错误和配置解析错误。
- **影响文件**：`packages/boot/src/dsh-boot.ts`、`packages/cordis-adapter/src/cordis-root.ts`、`packages/cordis-adapter/src/cordis-types.ts`、Boot/Cordis lifecycle tests。
- **验证**：`pnpm --filter @actspace/boot test` 通过（6 tests）；`pnpm --filter @actspace/cordis-adapter test` 通过（14 passed、1 skipped）。

### 步骤 4：Phase 2 Behavior ABI

- **操作**：新增 `toCordisBehavior()` / `loadCordisBehavior()`，统一接受 `apply(ctx, config)`；旧 `activate()` 在新适配路径明确拒绝。核心领域插件增加 `apply` 导出，保留旧导出仅供现有 legacy tests 使用。
- **影响文件**：`packages/cordis-adapter/src/behavior-loader.ts`、核心 domain package `plugin.ts` 和对应 package exports。
- **验证**：受影响 package typecheck 通过；真实 Cordis apply/disposer contract 通过。

### 步骤 5：Phase 3 AgentLoop Service 与 durable followup

- **操作**：新增 `AgentLoopService`、Managed Agent facade 和串行 followup driver；`agent.followup()` 先 enqueue 再 claim，再调用 Loop；Runtime RunController 通过 Service attach/followup，避免输入直接绕过 durable inbox。
- **影响文件**：`packages/core/agent-loop/src/service.ts`、`packages/core/agent-loop/src/loop.ts`、`packages/core/agent/src/inbox.ts`、`packages/runtime/src/runtime/run-controller.ts`、相关 tests。
- **验证**：`@actspace/core-agent-loop` 两个测试文件通过；真实 CLI Journal 顺序为 inbox enqueue/claim → turn/start → step/request/assistant → turn/end → end-seed。

### 步骤 6：Phase 4 Cordis event bridge 与 CLI 默认入口

- **操作**：新增真实 Cordis Context 到现有 EventHub-shaped kernel API 的桥接；Agent Loop 可由 `context` 使用 Cordis dispatch；CLI 默认不再读取 `runtime-v2/plugins.json`，改为加载仓库内 `apps/cli/cordis.yml`，并保留 test-only fake Cordis seam。
- **影响文件**：`packages/cordis-adapter/src/events.ts`、`packages/core/agent-loop/src/loop.ts`、`packages/runtime/src/runtime/boot.ts`、`apps/cli/src/runtime-v2/host-adapter.ts`、`apps/cli/cordis.yml`。
- **验证**：`pnpm -r typecheck` 通过；CLI 全套当前测试通过（14 tests）；关闭 fake seam 的真实构建 CLI mock persistent run 通过。

### 步骤 7：AgentLoop Service 进入 Cordis Behavior

- **操作**：`core-agent-loop/plugin` 增加 `actspace.agent.factory` 注入声明，在 `apply(ctx)` 中创建并提供 `agent.loop` Service，并通过 `ctx.effect()` 绑定幂等 dispose。Runtime 只提供 factory/host seam；DSH Config 负责激活该 Behavior。
- **影响文件**：`packages/core/agent-loop/src/plugin.ts`、`packages/runtime/src/runtime/boot.ts`、`apps/cli/cordis.yml`。
- **验证**：真实构建 CLI persistent mock run 通过；Journal 保持 `agent/inbox/spliced` enqueue/claim 先于 `turn/start`。

### 当前偏差

- 本轮已把默认 CLI 的配置入口切到真实 `cordis.yml`，但 Runtime 内部仍保留旧 `createTrustedBootCandidate`/composition activation 作为兼容的 service assembly 外壳；它们尚未从默认源码调用链完全移除。
- `AgentLoop` 的具体依赖（Prompt/LLM/Tools/Session）仍由 Runtime 提供给 factory；Service 本身已经由 `core-agent-loop` Cordis Behavior 创建。后续可继续把这些 factory 依赖拆成更细的 Context services。

### 步骤 8：全量验证与文档收尾

- **验证**：`pnpm -r typecheck` 通过；`pnpm -r test` 通过（Desktop 522 tests，CLI 14 tests，Session/Tool/Cordis/Boot 等受影响包通过）；`check:docs`、`check:current-docs`、`check:packages`、`check:v2-legacy-removal`、`check-package-cutover --strict`、`check:secrets` 和 `git diff --check` 全部通过。
- **状态**：本计划标记为“完成候选”。旧核心重构计划 P00/P04 未修改；旧 composition activation 外壳仍是未切换宿主的兼容路径，不作为 CLI DSH 路径的默认入口。
- 由于 `@deepseek-ai/cordis` 的普通函数会被识别为 constructor，Behavior wrapper 使用箭头 `apply`；插件清理推荐 `ctx.effect()`，不能只依赖普通函数返回 disposer。

## 遇到的问题

- 当前工作树存在大量与本计划无关的既有修改和未跟踪文件。执行时保留这些改动，不使用全量 staging、reset 或 checkout。

## 跳过或推迟的事项

- Phase 2–5：等待 Phase 1 的 Context/Loader seam 和 fixture contract 稳定后推进。
- 旧核心重构计划 P00/P04：按用户要求，本轮不直接修改；全部实现完成后再统一同步状态。
