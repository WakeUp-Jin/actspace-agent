# ActSpace v2 P09：内置工具迁移与 Browser Bridge 适配 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-09-built-in-tools-and-browser.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-09-built-in-tools-and-browser/execution-process.md`
- **执行模式**：交互
- **执行结果**：实现与本地进程验证完成；工作包仅被真实 Chrome/Extension 门禁阻塞

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Core tools plugin | `packages/agent-runtime/src/plugins/core-tools/` | 14 个工具 definition、capability effect 与 registration |
| Browser plugin | `packages/agent-runtime/src/plugins/browser-tools/` | Browser Bridge Host port、6 个工具 definition 和 unavailable fallback |
| Public export | `packages/agent-runtime/package.json`、`plugins/index.ts` | 仅通过 `@actspace/agent-runtime/plugins` 暴露 |

## Agent 已完成的验证

- Agent Runtime 36 files、153 tests 通过；其中 core node ports 13 tests、Browser client 5 tests，覆盖 background Bash、abort、timeout、socket disconnect 与 shutdown；6 个 published-package smoke 默认 gated。
- 25-tool parity ledger、image attachment authorization、Browser command registry、locator/cursor runtime 与 extension primitive contract 通过。
- Browser Bridge protocol 与 CLI 两个 Go module 全部通过；Agent Runtime strict typecheck 与 source boundary 通过，未引入旧 ToolManager、Desktop renderer、Kairos 或 Cordis Context。

## 已知风险和遗留事项

- 真实 Chrome/Extension/native-host socket acceptance 尚未完成；当前 doctor 结果是 manifest `ok`、local RPC `offline`，这是 P15 发布阻断项。
- Web/Image 的真实 Provider 验收仍需要用户授权的凭据；本地 fixture 不能替代 live provider。
