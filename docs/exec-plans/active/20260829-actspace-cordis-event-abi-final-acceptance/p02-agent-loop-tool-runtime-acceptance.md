# P02：Agent Loop 与 ToolRuntime 验收单

关联总计划：[README.md](./README.md)

状态：PASS（真实 provider 工具调用与包级 parity 均通过）

## 验收目标

证明 Agent Loop 和 ToolRuntime 已接入 Cordis 事件外壳，同时保留 ActSpace 既有工具 executor 的可观察行为。权限、审批、事件、progress、redaction 和 result shell 可以重构；read/list/edit/write/bash/Browser Bridge 的业务执行逻辑不应被替换。

## 目标文件

- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/core/agent-loop/src/test/service.test.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/tools/runtime/src/registry.ts`
- `packages/tools/runtime/src/test/runtime.test.ts`
- `packages/headless/src/runner.ts`
- `packages/headless/src/plugin.ts`

## 必须检查

1. Agent Loop 直接使用 Cordis Context/scoped carrier，不接收 `EventHub`、`eventEmitter` 或手工 listener registry。
2. `llm/stream` 包围完整 `AsyncIterable`；`agent/request-error` 的返回 decision 会实际改变 retry/abort/escalate 路径。
3. ToolRuntime 按 `tools/pre-execute → tools/execute → tools/post-execute` 包围现有 executor，权限和审批 fail closed。
4. 一次工具调用只产生一条 `tool/call` 和一条最终 `tool/result`；每次尝试的细节使用允许的扩展事件或 provenance 表达。
5. 工具异常、取消、超时、审批拒绝和 plugin dispose 都有结构化结果；executor 不直接写 CLI stdout。
6. read/list/edit/write/bash/Browser Bridge 的参数、路径安全、排序、截断、artifact、redaction、退出码和副作用 parity 不回归。

## 验证命令

```sh
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/headless test
pnpm --filter @actspace/core-agent-loop typecheck
pnpm --filter @actspace/tools-runtime typecheck
pnpm --filter @actspace/headless typecheck
```

## 通过证据

执行摘要要把 loop hook、tool shell 和具体 executor parity 分开记录。没有工具调用 fixture 时，不能把 no-tool 成功路径写成 P02 全部通过；应明确标记 tool shell 或 parity 的未覆盖项。
