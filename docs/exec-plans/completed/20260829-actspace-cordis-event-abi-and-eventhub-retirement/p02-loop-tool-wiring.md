# P02：Agent Loop 与 Tool Runtime 接入

## 目标

将 Agent Loop 和 Tool Runtime 的事件调用改成真正的 typed Cordis dispatch，保持现有 Session 事件顺序和具体工具 executor 行为。

## 文件范围

- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/runtime/src/runtime/agent-factory-plugin.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/tools/runtime/src/runtime.ts`
- `packages/llm/service/src/service.ts`
- `packages/prompt/src/assembler.ts`
- 对应 Agent Loop、LLM、Prompt、Tool Runtime tests

## 具体动作

1. `system-prompt/assemble`、`agent/pre-step`、`agent/request` 改为传入 typed payload 和内建 next。
2. 将 `llm/stream` 从 chunk-level serial observer 改为包围完整 Provider `AsyncIterable` 的 waterfall。
3. 将 `agent/request-error` 改为 waterfall，返回 retry/abort/escalate decision；retry 仍属于同一 step。
4. 将 `tools/pre-execute`、`tools/execute`、`tools/post-execute` 改为 around middleware；内建 next 调用既有参数校验、policy、lease、executor、redaction 和 ordered commit kernel。
5. 删除 AgentLoop/ToolRuntime 对 EventHub 的新增依赖，改由 owning Context/Service 保存 typed dispatch seam。
6. 增加 stream replacement、request retry decision、tool args/result wrapping 的 contract tests。

## 不得改变

- read/list/edit/bash/Browser Bridge executor body；
- tool schema、路径边界、排序、截断、artifact、redaction 和结构化结果；
- 13 个核心 Session 事件及既有 retry 扩展事件顺序。

## 验收

- no-tool、tool、retry、error、abort golden cases 通过；
- `llm/stream` 可以替换完整 stream；
- `agent/request-error` 的返回值真正影响 Loop recovery；
- 工具 parity tests 无行为差异；
- 受影响 package typecheck 和 tests 通过。

## 回退

事件接入失败时只回退到本阶段前的 Loop 调用点；不恢复 EventHub 新 API，不改工具 executor。
