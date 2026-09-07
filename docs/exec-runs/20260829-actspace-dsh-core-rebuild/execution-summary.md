# ActSpace DSH Agent Loop / Session / Tool Shell 核心重构 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260829-actspace-dsh-core-rebuild/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-dsh-core-rebuild/execution-process.md`
- **执行模式**：交互
- **执行结果**：P00–P05 已完成；计划保留在 active 目录，待后续 clean-checkout 门禁后归档

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| P00 Session Event Foundation | `packages/session/journal/**`, `packages/session/persistence/**` | 13 核心事件、扩展 codec、append/replay/recovery、post-commit firehose。 |
| P01 Cordis Loop Surface | `packages/cordis-adapter/**` | scoped EventHub、9 个干预点、5 个通知面、dispose drain。 |
| P02 Tool Runtime Shell | `packages/tools/runtime/src/prepared-execution.ts` | 保留工具 kernel，接入三段 Cordis tool hooks 与 Journal adapter。 |
| P03 Agent Loop | `packages/core/agent-loop/src/loop.ts` | DSH 事件顺序、durable chunks、request retry/error/abort、tool result。 |
| P04 Runtime + CLI run | `packages/runtime/**`, `apps/cli/src/runtime-v2/run.ts` | `session/event`、`session/end-seed`、CLI durable trace。 |

## 人工验证指引

1. 运行 `pnpm --filter @actspace/agent-cli build`。
2. 运行 `node apps/cli/dist/cli.js run --input 'hello' --mock --json`，确认 stdout 只有稳定 JSON。
3. 增加 `--persist --data-dir <temporary-dir>`，检查 `journal.jsonl` 含 `turn/start`、`request/header`、`request/context`、`assistant/chunk`、`assistant/message`、`step/end`、`turn/end`、`session/end-seed`。
4. 真实 Provider、Electron、Chrome、签名/公证仍需在具备对应宿主权限的环境人工验收。

## Agent 已完成的验证

- `pnpm run check:docs`：文档骨架检查通过（执行前文档阶段）。
- `pnpm -r typecheck`：31 个 workspace 项目通过。
- `pnpm -r test`：全 workspace 测试通过（Desktop 522 tests，CLI 14 tests，Session persistence 30 tests）。
- `pnpm --filter @actspace/session-journal test`：8 tests 通过。
- `pnpm --filter @actspace/session-persistence test`：30 tests 通过。
- `pnpm --filter @actspace/cordis-adapter test`：11 passed，1 skipped。
- `pnpm --filter @actspace/tools-runtime test`：15 tests 通过。
- `pnpm --filter @actspace/subagent test`：5 tests 通过。
- `pnpm --filter @actspace/agent-cli test`：14 tests 通过。
- `cli run --mock --json`：单次无头进程 smoke 通过；persistent Journal 含 `session/end-seed`。
- `pnpm run check:current-docs`、`check:v2-legacy-removal`、`check:packages`、`check:secrets`：通过。
- `pnpm run check:package-cutover --strict`：通过（测试 fixture 不再被误判为运行时 deep import）。

## 已知风险和遗留事项

- 真实 Provider、Electron、Chrome、签名/公证仍属于外部人工门禁。
- 具体工具行为 parity 已由现有 Tool Runtime tests 覆盖；真实 Provider、Chrome/Electron、签名/公证仍是外部门禁。
- 当前不实现 CLI chat、Goal/Schedule producer 和前端视觉改造。

## 后续建议

- clean-checkout 门禁和真实宿主验收完成后，再将本计划从 active 移入 completed；当前源码与本地契约验收已完成。
