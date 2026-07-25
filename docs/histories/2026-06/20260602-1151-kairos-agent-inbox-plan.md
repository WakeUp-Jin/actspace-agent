## [2026-06-02 11:51] | Task: Kairos Agent 文件收件箱计划

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望把 Main Agent / Lab Agent 与 Kairos 的通信简化为文件方式：Main Agent 和 Lab Agent 分别写一份文件，Kairos 作为主动运行者每次 tick 读取这些文件。要求编写 active execution plan，并补充 Kairos 设计规范文档。

### Changes Overview

**Scope:** `agent-core`, `desktop`, `docs`

**Key Actions:**

- **新增并完成执行计划**：创建后归档 `docs/exec-plans/completed/20260602-kairos-agent-inbox.md`，定义两份 Markdown inbox、消息格式、读取规则、风险、实施结果和验证命令。
- **登记 completed plan**：更新 `docs/exec-plans/README.md`，把新计划从 active 列表移到已完成 Kairos 计划列表。
- **补充 Kairos 设计事实**：更新 `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`，把 Agent 文件收件箱纳入 Kairos 输入分类、prompt 观测摘要、存储布局和边界约束。
- **收紧执行细节**：补充 V0 append-only 写入策略、默认不创建 `## Processed`、inbox prompt 预算、唯一写入入口和 Lab Runtime 通信边界，并同步 `core-storage-and-observability.md` / `lab-runtime-architecture.md`。
- **实现 inbox V0**：新增 `packages/agent-core/src/kairos/inbox.ts`，提供默认文件创建、append-only 写入、最近消息截取和 prompt 摘要 loader；`kairos-bootstrap.ts` 启动时创建两份 inbox。
- **接入 Kairos prompt**：`KairosRunner.processTick()` 与 `KairosController.getContextSnapshot()` 每次组装 prompt 时读取同一份 inbox summary；`prompt-assembler.ts` 将观测摘要分为 watch diff / sessions digest / inbox 三块独立预算，避免互相挤掉。
- **补测试**：新增 inbox 单测，并补 prompt assembler、runner 和 desktop bootstrap 测试。

### Design Intent

Kairos 是后台主动运行的 Agent，因此不需要让其它 Agent 与它实时对话。V0 使用 `<userData>/kairos/inbox/main-agent.md` 和 `<userData>/kairos/inbox/lab-agent.md` 两份 Markdown 文件即可承载观察信号：写入方只追加，Kairos 每次 tick 主动读取并自行判断是否整理、提醒或建议创建 Lab 实验。这样保留本地可追溯性，同时避免过早引入消息总线、ack 状态机或复杂 schema。

### Files Modified

- `packages/agent-core/src/kairos/inbox.ts`
- `packages/agent-core/src/kairos/controller.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/kairos/prompt-assembler.ts`
- `packages/agent-core/src/kairos/prompt.ts`
- `packages/agent-core/src/kairos/index.ts`
- `packages/agent-core/src/kairos/test/inbox.test.ts`
- `packages/agent-core/src/kairos/test/prompt-assembler.test.ts`
- `packages/agent-core/src/kairos/test/runner.test.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/main/test/kairos-bootstrap.test.ts`
- `docs/exec-plans/completed/20260602-kairos-agent-inbox.md`
- `docs/exec-plans/README.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/lab/lab-runtime-architecture.md`
- `docs/histories/2026-06/20260602-1151-kairos-agent-inbox-plan.md`

### Validation

- `pnpm --filter @actspace/agent-core exec vitest run src/kairos`
- `pnpm --filter @actspace/desktop exec vitest run src/main/test`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/agent-core typecheck`
- `git diff --check`
