# ActSpace DSH 风格插件组装与 Agent 启动实现计划 — 执行摘要

## 执行状态警告

> 本计划的 CLI run 目标已完成候选验收。为避免影响尚未切换的宿主，Runtime 仍保留旧 composition activation 外壳；它不参与 CLI 的 `cordis.yml` DSH 路径。

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260829-actspace-dsh-plugin-assembly-and-agent-startup/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-dsh-plugin-assembly-and-agent-startup/execution-process.md`
- **执行模式**：交互
- **执行结果**：进行中

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Phase 1 真实 Cordis Boot/Loader seam | `packages/boot/src/dsh-boot.ts`、`packages/cordis-adapter/src/cordis-root.ts`、fixture tests | 已完成 |
| Phase 2 Behavior ABI | `toCordisBehavior()`、核心 package `apply(ctx)` exports | 已完成（保留 legacy export） |
| Phase 3 AgentLoop Service | `packages/core/agent-loop/src/service.ts`、RunController Service bridge | 已完成 |
| Phase 4 followup/event bridge | durable inbox sequencing、Cordis Context event bridge | 已完成（桥接态） |
| Phase 5 CLI 配置入口 | `apps/cli/cordis.yml`、默认不读 `plugins.json`、真实 mock run | 已完成候选 |

## 人工验证指引

执行完成后补充 CLI 单次无头 run、Session Journal、插件生命周期和宿主退出验证步骤。

## Agent 已完成的验证

- 文档门禁：执行开始前 `pnpm run check:docs` 和 `pnpm run check:current-docs` 已通过。
- `pnpm -r typecheck` 通过。
- Boot：6 tests 通过；Cordis adapter：14 passed、1 skipped。
- AgentLoop：2 tests 通过；CLI：14 tests 通过。
- 真实构建 CLI `run --mock --json --persist` 通过，Journal 验证 `agent/inbox/spliced` enqueue/claim 先于 `turn/start`，并产生 `session/end-seed`。

## 已知风险和遗留事项

- 真实 Provider、Electron/Chrome、DMG/签名公证仍不属于本计划的自动验收范围。
- 旧核心计划 P00/P04 的状态需在本计划实现完成后统一回写。

## 后续建议

- 后续独立工作：把 Runtime factory 的 Prompt/LLM/Tools/Session 依赖继续拆为 Context services，再为 Desktop 等未切换宿主显式选择 DSH Boot，最后删除旧 `createTrustedBootCandidate`/`activateBehavior` activation 外壳。本计划不把这些未批准扩展混入本次 CLI run 交付。
