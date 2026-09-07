# ActSpace v2 P06：Tool Runtime、审批与有序提交 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-06-tool-runtime.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 20:28
- **结束时间**：2026-08-22 20:37

## 执行时间线

### 步骤 1：固定 definition/executor 与 registry ABI

- **操作**：实现 `ToolDefinition`、canonical digest、JSON Schema argument materialization、`ToolRegistry`、registration conflict 与 draining lease。
- **影响文件**：`packages/agent-runtime/src/tools/{definition,argument-validator,registry,activation-lease}.ts`。
- **决定**：`toolId` 是 `<pluginId>/<localName>` 稳定身份；definition、executor、policy、middleware 作为一次 registration 原子发布，禁止静默覆盖。
- **验证**：重复 id/version digest、invalid schema、draining replacement 和 old registration capture 均通过。

### 步骤 2：实现 admission pipeline

- **操作**：接入 policy、ApprovalBroker、Core guards、workspace/capability/concurrency 检查和 redaction。
- **影响文件**：`policy.ts`、`approval-port.ts`、`core-guards.ts`、`redaction.ts`。
- **决定**：deny 单调；approval 绑定 call/definition/args digest；工具 executor 永远拿不到 Journal、approval、Cordis 或 credential store。
- **验证**：policy deny、stale/timeout approval、capability denial、secret canary 全部通过。

### 步骤 3：实现 one-shot PreparedToolExecution

- **操作**：在首次 await 前捕获 registration、executor、middleware、lease 和 ordered commit slot；实现 dispatch fact、checkpoint、body、LIFO finalizer、normalization 和 terminal result。
- **影响文件**：`prepared-execution.ts`、`result.ts`、`errors.ts`、`ordered-commit.ts`。
- **决定**：checkpoint 失败时 body invocation count 必须为 0；finalizer 失败不覆盖已确认 body outcome；所有路径 finally release lease。
- **验证**：固定调用轨迹、checkpoint fail-closed、abort、finalizer failure 和 replacement race 均通过。

### 步骤 4：实现有界调度器

- **操作**：实现默认最多 4 路的 read-only/declared-safe 并行池，exclusive barrier 和模型顺序 commit。
- **影响文件**：`scheduler.ts`、`runtime.ts`。
- **决定**：body 可以乱序完成，terminal result 只能按模型 tool-call 顺序提交；并行上限只能收窄到 1-4。
- **验证**：8 路乱序 body 的 peak=3，commit 顺序严格等于模型调用顺序。

## 遇到的问题

- **问题**：调度器需要同时支持 terminal candidate 与 body stage。
  - **原因**：policy/approval/checkpoint 失败不能进入 body，但仍必须占用并释放模型顺序 commit slot。
  - **应对**：Prepared call 用 `PreparedDispatch` 二态承载 terminal/body，统一通过 ordered commit queue 提交。
- **问题**：旧 registration replacement 期间不能让 prepared call 跳到新 executor。
  - **原因**：registry lookup 若延迟到 body 会产生定义/审批/实现跨代。
  - **应对**：prepare 在第一次 await 前 capture exact registration + lease；draining 只阻止新 prepare。

## 跳过或推迟的事项

- 具体文件、搜索、Bash、Web、图片和 Browser executor：由 P09 迁移。
- Desktop/CLI ApprovalBroker：由 P13/P14 提供 Host adapter。
- Tool renderer DTO：由 P07 提供 projection，不在 Tool Runtime 内引入 UI 类型。
