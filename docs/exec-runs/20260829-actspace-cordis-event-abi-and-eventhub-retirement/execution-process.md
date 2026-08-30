# ActSpace Cordis 原生事件 ABI 与 EventHub 退役计划 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260829-actspace-cordis-event-abi-and-eventhub-retirement/README.md`
- **执行模式**：交互
- **开始时间**：2026-08-29
- **结束时间**：2026-08-29

## 执行时间线

### 步骤 1：计划复核与当前引用盘点

- **操作**：读取仓库规则、设计规范和 P00–P05 子计划；扫描 EventHub、事件桥、旧 handler 类型和当前 Loop 调用点。
- **影响文件**：仅读取；执行记录新增本文件和执行摘要。
- **决定**：按 P00 → P01 → P02/P03 → P04 → P05 顺序执行；保留真实 Cordis `EventsService`，删除 ActSpace 自定义 EventHub。
- **验证**：确认当前 `packages/cordis-adapter/src/events.ts`、`cordis-types.ts`、`cordis-root.ts`、AgentLoop、Headless、Runtime 和 Tool Runtime 仍有引用。

### 步骤 2：Cordis typed contract 与真实 dispatch

- **操作**：新增 `event-contract.ts` 与 `dispatch.ts`；声明 9 个干预面和 5 个通知面，使用 Context 的 continuation waterfall、serial、parallel，并为通知提供 contained dispatch。
- **验证**：Cordis adapter typecheck；waterfall continuation、serial bail、通知失败隔离 contract tests 通过。

### 步骤 3：Agent Loop、Tool Runtime、Headless 与 Boot 接线

- **操作**：Agent Loop 和 Tool Runtime 改为直接持有 Cordis Context；LLM stream 改为整条 stream 的 waterfall；request-error 接收恢复决策；Runtime/Headless 删除 bridge wiring。
- **验证**：全仓 TypeScript typecheck 通过；core-agent-loop、tools-runtime、headless、runtime 测试通过。

### 步骤 4：删除重复事件层

- **操作**：删除 `packages/cordis-adapter/src/events.ts`、旧测试和所有 EventHub/bridge 引用；RootHandle 与 ActivationScope 不再暴露事件总线。
- **验证**：源码扫描 `packages`、`apps` 无 `EventHub`、`createEventHub`、`createCordisEventHub`、`EventContext`、`WaterfallHandler` 运行时引用；生成 dist 中的 stale events 制品已清理。

### 步骤 4b：Scope carrier 与 typed subject

- **操作**：复用 `AgentScope.scopeKey` 建立 Cordis `Context.filter` carrier；Agent Loop 为每个 dispatcher 固定一个 carrier，并向 Agent 事件 payload 注入同一 descriptor subject；Boot/Agent Factory 为 Loop 使用 scope-tagged Context。
- **验证**：Cordis contract tests 覆盖 carrier dispatch 路径、waterfall continuation、serial bail 和通知 containment；全仓 typecheck 通过。

### 步骤 5：CLI 单次无头 run

- **操作**：构建 CLI，在可访问 workspace 上以 `--mock --json` 执行单次 run。
- **验证**：返回 `status=completed`、`exitCode=0`、`steps=1`、`eventCount=11`，Session snapshot 可生成。

## 遇到的问题

尚未记录。

## 跳过或推迟的事项

尚未记录。
