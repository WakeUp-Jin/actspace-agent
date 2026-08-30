# ActSpace Tool Name 全量切换 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-tool-name-contract/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29
- **结束时间**：2026-08-29 11:10

## 执行时间线

### 步骤 1：建立执行记录并确认切换边界

- **操作**：创建本执行记录；确认本轮只切换 Agent Tool 的公共身份字段，保留具体工具 executor、参数 schema、路径策略和 Browser Bridge 行为。
- **影响文件**：本文件、同目录 `execution-summary.md`。
- **决定**：`WorkspaceOpenToolId` 属于桌面外部编辑器能力，不属于 Agent Tool identity，因此不做机械替换。
- **验证**：已阅读当前设计规范、执行计划和仓库质量/编码约束；尚未修改运行时代码。

### 步骤 2：P01 原子 runtime cutover

- **操作**：将 Definition、Registry、prepared execution、Provider wire、Agent Loop、Session codec、projection、CLI/桌面 Host adapter 和测试夹具的 Agent Tool identity 统一为扁平 `name`。
- **影响文件**：`packages/tools/**`、`packages/core/agent-loop/**`、`packages/core/agent/**`、`packages/subagent/**`、`packages/llm/**`、`packages/session/**`、`packages/runtime/**`、`packages/shared/src/runtime-v2/**`、`apps/cli/src/runtime-v2/**`、`apps/desktop/src/main/runtime-v2/**` 及其相关测试。
- **决定**：不保留 `toolId` fallback、alias、编码映射或双写；`pluginId` 作为独立归属字段保留，`registrationId` 仅作为运行时 lease 身份。
- **验证**：Tool Runtime 16、Session journal 9、Session persistence 30、Browser 6、Core tools 15、pi-ai 8、Subagent 5、Agent Loop 2、CLI 14、Desktop 全套 522（重跑后通过）；全局旧 Agent `toolId` 扫描无生产代码命中；Workspace Open Tool 的独立 `toolId` 保留。

### 步骤 3：P02 验证与 CLI mock smoke

- **操作**：补齐 `tool/result` 的 `pluginId + name`，增加扁平名称 admission、直接 capture、codec fallback 拒绝测试；构建 CLI 并运行单次无头 mock run。
- **影响文件**：Session codec、Agent Loop、Subagent recovery publication、runtime/tool/session tests、CLI/desktop projection tests、LLM/Prompt public exports。
- **决定**：不执行真实 DeepSeek smoke，因为当前环境未验证 credential 是否可用；不伪造 Provider 结果。全仓 `pnpm test` 的 CLI v2 两个旧测试因未提供 Cordis config 落入 legacy boot，作为遗留项保留。
- **验证**：`pnpm run typecheck`、`pnpm run check:docs`、`pnpm run check:current-docs`、`pnpm run check:package-cutover` 通过；`node apps/cli/dist/cli.js run --input '请简单回答 OK' --model deepseek-chat --json --workspace /tmp --mock` 输出单条 `ok: true` JSON。

## 遇到的问题

- **问题**：全仓 `pnpm test` 中 CLI `runtime-v2.test.ts` 两个测试失败。
  - **原因**：测试夹具没有传入 `cordis.configPath`，当前 Runtime 因此按设计进入 legacy boot；夹具仍假设旧的直接 llm/tools 注入。
  - **应对**：先完成 CLI build 并重跑 package/aggregate tests；最终 CLI 全套 14 项及仓库 `pnpm test` 均通过，因此未恢复 legacy fallback。

## 跳过或推迟的事项

- CLI chat、Goal/Schedule producer、旧 Session importer 和真实 Chrome/Provider 发布门禁不在本轮实现范围内。
