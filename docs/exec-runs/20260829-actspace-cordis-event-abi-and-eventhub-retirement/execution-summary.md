# ActSpace Cordis 原生事件 ABI 与 EventHub 退役计划 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-cordis-event-abi-and-eventhub-retirement/README.md`
- **执行过程**：`docs/exec-runs/20260829-actspace-cordis-event-abi-and-eventhub-retirement/execution-process.md`
- **执行模式**：交互
- **执行结果**：已完成

## 核心变更清单

- `@actspace/cordis-adapter` 新增 typed event contract 和 Context dispatch helper。
- Agent Loop、Tool Runtime、Headless、Runtime Boot 和 CLI 统一传递 Cordis Context；不再创建或传递自定义事件总线。
- LLM stream 使用完整 AsyncIterable waterfall；request-error 可返回 retry/abort 恢复决策。
- 物理删除 `packages/cordis-adapter/src/events.ts` 与旧 EventHub 测试。

## 人工验证指引

- 已执行 CLI mock run；真实 provider、真实工具副作用和 Desktop/Electron 外部验收不在本轮范围。

## Agent 已完成的验证

- 计划、仓库规则和初始 EventHub 引用已复核。
- Cordis adapter contract tests：17 passed，1 skipped。
- Agent Loop：2 tests passed；Tool Runtime：16 tests passed；Headless：2 tests passed；Runtime：3 tests passed。
- 全仓 `pnpm -r typecheck`：通过。
- CLI：`--mock --json` 单次无头 run 返回 `status=completed`、`exitCode=0`、`steps=1`、`eventCount=11`。
- 源码扫描：`packages`、`apps` 无 `EventHub`、`createEventHub`、`createCordisEventHub`、`EventContext` 运行时引用；typed helper 命名为 `AgentWaterfallEventHandler`，避免复用已退役的旧 ABI 名称。

## 已知风险和遗留事项

- 真实 Cordis Context 的结构化事件声明已加入 Agent subject、waterfall next 和通知签名；Session/LLM/Tool payload 仍可在后续按领域继续收紧。
- 本轮未执行真实 provider/network、真实工具写入、Desktop/Electron 和发行制品验收。

## 后续建议

- 若继续推进，建议下一轮为具体 Agent/Tool/Session 事件 payload 增加更细粒度的 domain types，并增加真实 provider/工具 smoke test。
