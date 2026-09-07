# P01：Agent Tool Identity 原子切换

状态：已完成

## 目标

一次性把所有 Agent Tool 公共类型和跨层生产路径从 `toolId` 切换为扁平 `name`，使编译器和 contract tests 同时约束 Tool Runtime、Agent Loop、LLM wire、Session、Cordis hooks、通知和 projection。P01 是一个原子实现切片；完成后 CLI run 可在新契约下运行。

## 修改边界

预计影响超过 8 个 package 和 Host 文件，至少包括：

- `packages/tools/runtime/src/definition.ts`
- `packages/tools/runtime/src/registry.ts`
- `packages/tools/runtime/src/prepared-execution.ts`
- `packages/tools/runtime/src/executor.ts`
- `packages/tools/runtime/src/result.ts`
- `packages/tools/runtime/src/approval-port.ts`
- `packages/tools/runtime/src/scheduler.ts`
- `packages/tools/core-tools/src/plugin.ts`
- `packages/tools/core-tools/src/manifest.ts`
- `packages/tools/browser-tools/src/definitions.ts`
- `packages/tools/browser-tools/src/manifest.ts`
- `packages/core/agent/src/todo-tool.ts`
- `packages/subagent/src/tool-plugin.ts`
- `packages/subagent/src/preset.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/llm/service/src/message.ts`
- `packages/llm/service/src/stream.ts`
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts`
- `packages/llm/pi-ai/src/pi-ai-wire-engine.ts`
- `packages/session/journal/src/core-codecs.ts`
- `packages/runtime/src/projection/tool-dto.ts`
- `packages/runtime/src/projection/durable-session.ts`
- `packages/runtime/src/projection/live-progress.ts`
- `packages/runtime/src/projection/diagnostics.ts`
- `packages/shared/src/runtime-v2/projection.ts`
- `apps/cli/src/runtime-v2/approval.ts`
- 受影响 package 的 tests、golden fixtures 和 host parity tests

不修改 `WorkspaceOpenToolId`、工具 executor body、Browser Bridge 协议实现和与 Agent Tool 无关的 `toolId` 字段。

## 工作顺序

1. 将 Tool Definition 的主身份改为 `name` 并把 Tool ABI 标记为 breaking `abiVersion: 2`，注册时校验 `^[a-zA-Z0-9_-]+$`，Registry 改用 `Map<name, ...>`，删除 namespace 前缀校验和 alias fallback。
2. 将 Core/Browser/Todo/Subagent registrations 与 manifests/presets 改为直接注册 `read_file`、`browser_tabs`、`todo_read`、`agent` 等扁平名字；pluginId 保留在独立字段。
3. 将 LLM Message、Stream、Agent Loop collection/visibility/filter/prepared call 改为 `name`。
4. 将 OpenAI Chat、Responses、Anthropic 和 pi-ai schema/response adapter 改为直接读写 `name`；禁止 adapter 内部映射。
5. 将 Session core codec、tool/call、tool/result、replay、approval、Cordis tool hooks、notifications、diagnostics、live progress、artifact owner 和 projection 同步改为 `name`；删除 `toolId` fallback。
6. 更新测试 fixture、golden JSONL、CLI host parity 和错误断言；保留工具 executor 输入输出 parity。
7. 运行 package typecheck，解决所有由旧公共字段暴露的编译错误；不通过 `as any`、兼容 getter 或字符串映射绕过。

## 验收

- `read_file` 可以从 Agent Loop 直接 `registry.capture("read_file")`；
- namespaced 字符串在 registration admission 或 lookup 边界失败；
- 四条 Provider wire 都发送合法扁平名；
- `tool/call` / `tool/result` 的 durable payload 使用 `name` 和独立 `pluginId`；
- 9 个插入点、5 个主要通知和 projection 语义不变，只替换 identity 字段；
- read/list/edit/write/bash/Browser Bridge 既有行为测试通过；
- CLI run 无工具和含 `read_file` 的 mock/provider contract 通过。

## 回退

P01 只产生代码和测试变更，不修改 Session 数据。若失败，整体回滚 P01 代码切片；不得恢复半套 `toolId`/`name` 双真相。
