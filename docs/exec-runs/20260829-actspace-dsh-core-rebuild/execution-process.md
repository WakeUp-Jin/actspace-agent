# ActSpace DSH Agent Loop / Session / Tool Shell 核心重构 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260829-actspace-dsh-core-rebuild/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29
- **结束时间**：2026-08-29

## 执行时间线

### 步骤 1：执行前规则与工作树检查

- **操作**：读取仓库协作规则、架构入口、核心理念、LLM Agent 开发规范、History/Quality/Exec-run 规则；确认用户已批准 P00–P05。
- **影响文件**：无代码文件。
- **决定**：先执行 P00 Session 事实流；工具具体 executor 保持 kernel 边界。
- **验证**：已确认当前工作树存在大量既有 dirty changes，后续只修改计划范围内文件。

### 步骤 2：P00 Session Event Foundation

- **操作**：完成 DSH 13 核心事件、扩展事件目录、关系校验、recovery、compaction、post-commit firehose 和测试迁移。
- **影响文件**：`packages/session/journal/**`、`packages/session/persistence/**` 及对应测试。
- **决定**：旧事件模型不做兼容；新的 DSH 13 核心事件作为唯一生产事实。
- **验证**：`session-journal` 测试通过（8 tests）；`session-persistence` typecheck 与测试通过（30 tests）。

### 步骤 3：P01 Cordis Loop Surface

- **操作**：新增 scoped EventHub，提供 9 个 Agent Loop 干预面、5 个通知面和生命周期 drain；Cordis root/activation 暴露同一 Hub。
- **影响文件**：`packages/cordis-adapter/src/events.ts`、`cordis-root.ts`、`cordis-types.ts`、导出与契约测试。
- **验证**：Cordis adapter 测试通过（11 passed，1 skipped）；build/typecheck 通过。

### 步骤 4：P02 Tool Runtime Shell

- **操作**：保留工具定义、schema、executor body、artifact/redaction/ordered commit；接入 `tools/pre-execute`、`tools/execute`、`tools/post-execute` 和 Tool Runtime EventHub。
- **影响文件**：`packages/tools/runtime/src/prepared-execution.ts`、Agent Loop tool adapter。
- **验证**：Tool Runtime 测试通过（15 tests）；build/typecheck 通过。

### 步骤 5：P03 Agent Loop DSH 顺序

- **操作**：重写 Agent Loop 持久化顺序为 `turn/start`、`step/start`、`request/header/context`、`assistant/chunk/message`、`tool/call/result`、`step/end`、`turn/end`；接入 9 个干预点和通知；retry/error/abort 均形成可恢复终态。
- **影响文件**：`packages/core/agent-loop/src/loop.ts`、Runtime boot 事件注入、Desktop durable projection。
- **验证**：`core-agent-loop` build/typecheck/test 通过；全 workspace typecheck 通过。

### 步骤 6：P04 Runtime Collector + CLI run

- **操作**：Session post-commit 事件转发到 `session/event`；Runtime 关闭前追加 `session/end-seed`；CLI `run` artifact trace 收集真实 durable Journal 事件。
- **影响文件**：`packages/runtime/src/runtime/session-controller.ts`、`boot.ts`、`apps/cli/src/runtime-v2/run.ts`。
- **验证**：CLI 测试通过（14 tests）；`cli run --mock --json` 进程 smoke 通过，persistent Journal 含 `session/end-seed`。

## 遇到的问题

- 当前仓库已有大量与本任务无关的 dirty changes；已保留，不执行 reset、checkout、清理或批量 staging。

### 步骤 7：P05 验证与收口

- **操作**：完成全 workspace typecheck/test、旧事件生产源码扫描、文档、secret、package boundary 与 current-docs 检查；补充 history 和 learning 文档。
- **验证**：`pnpm -r typecheck`、`pnpm -r test`、`check:docs`、`check:current-docs`、`check:v2-legacy-removal`、`check:packages`、`check:secrets`、`check:package-cutover --strict` 均通过。
- **结论**：DSH 核心重构和 CLI run 已可运行；真实 Provider/Electron/Chrome/签名仍按边界留给外部人工验收。
- CLI chat、Goal/Schedule producer、具体工具 executor 重写：不在本计划范围内。

## 未执行的外部门禁

- clean-checkout 验收、真实 Provider、Electron/Chrome、签名与公证未在当前环境执行；这些不影响本轮源码、契约和本地 mock CLI run 的完成状态。
