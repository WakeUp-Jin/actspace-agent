# ActSpace Tool Name 与 Plugin Namespace 契约

> 状态：已实施（2026-08-29；真实 Provider smoke 待凭据）
>
> 日期：2026-08-29
>
> 本文只规定 Agent 工具的身份、命名、Provider wire 和跨层传递方式。它不替换具体工具 executor，也不改变读取、list、编辑、bash、Browser Bridge 等工具的业务行为。

## 1. 结论先行

ActSpace 不再把 `pluginId/tool-name` 拼接成模型可见工具名，也不引入编码、解码或双向映射。模型和 Provider 直接使用稳定的扁平 `name`，例如 `read_file`。

```text
模型 schema name=read_file
  -> Provider function.name=read_file
  -> LLM tool-call name=read_file
  -> AgentLoop capture("read_file")
  -> ToolRegistry { name: "read_file", pluginId: "actspace.core-tools" }
  -> ToolRuntime / existing executor
  -> Session tool/call + tool/result { name: "read_file", pluginId: ... }
  -> notification / projection { name: "read_file", pluginId: ... }
```

这条链路中不存在 `encodeToolName()`、`decodeToolName()`、wire alias 或“先用名字查内部命名空间再转发”的隐式层。

## 2. 证据与当前缺陷

### 2.1 DSH 的真实模型

`tmp/deepseek-harness` 的工具契约直接使用 `name`：

- `tmp/deepseek-harness/packages/core/tools/src/types.ts`：工具定义拥有 `name`、`description`、参数和执行契约；
- `tmp/deepseek-harness/packages/core/tools/src/index.ts`：Registry 以 `definition.name` 注册、查找和返回 schema；
- `tmp/deepseek-harness/packages/core/session/src/types.ts`：`tool/call` 使用 `name`；
- `tmp/deepseek-harness/packages/llm/llm-deepseek/src/serialize.ts`：直接把 `tool.name` 写入 `function.name`；
- `tmp/deepseek-harness/packages/llm/llm-deepseek/src/translate.ts`：直接把 Provider 返回的函数名还原为 tool-call `name`；
- `tmp/deepseek-harness/docs/tool-catalog.md`：展示 `read`、`write`、`bash`、`web_search` 等扁平模型名，而不是插件路径。

DSH 也把 `toolName` 作为某些错误对象的字段，但它仍然代表同一个扁平模型名，不是插件路径编码。

### 2.2 ActSpace 的缺陷链

当前实现把 `toolId` 强制定义为 `<pluginId>/<localName>`，并在 Agent Loop 和 pi-ai wire 中原样转发：

| 层 | 当前行为 | 结果 |
|---|---|---|
| `packages/tools/runtime/src/definition.ts` | `toolId` 必须以 `pluginId/` 开头 | 内部身份带 `/` |
| `packages/tools/core-tools/src/plugin.ts`、`browser-tools/src/definitions.ts` | 生成 `actspace.core-tools/read_file` 等值 | 所有 Core/Browser 工具进入问题路径 |
| `packages/core/agent-loop/src/loop.ts` | LLM definition 继续暴露 `definition.toolId` | 模型 schema 收到 namespaced 值 |
| `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts` | `function.name`、Responses `name`、Anthropic `name` 均使用 `tool.toolId` | Provider 收到非法函数名 |
| `packages/llm/pi-ai/src/pi-ai-wire-engine.ts` | pi-ai schema 使用 `tool.toolId` | pi-ai 路径同样受影响 |

DeepSeek 返回的错误正是这一链路的直接结果：`actspace.core-tools/read_file` 不符合 `^[a-zA-Z0-9_-]+$`。

受影响的当前 first-party 定义约 29 个：Core 14、Browser 11、Todo 2、Subagent 2。Todo/Subagent 已有 aliases 不能解决问题，因为模型 schema 仍然由 namespaced `toolId` 生成；Core/Browser 甚至没有这层 aliases。

## 3. 三种身份必须分离

### 3.1 `name`：工具是什么

`name` 是全局稳定、模型可见、可持久化的工具名字，也是运行时 lookup key。

约束：

- 必须匹配 `^[a-zA-Z0-9_-]+$`；
- 在一个 Runtime / Agent 可见 scope 内唯一；
- 同时用于模型 schema、Provider wire、LLM tool-call、Tool Registry、Session `tool/call` / `tool/result`、通知和投影；
- 不包含 `/`、`.`、插件版本、环境、权限、UI 路径或随机值；
- 名称用途或输入/输出合同发生不兼容变化时递增 definition version，必要时换用新 name；
- `read_file` 必须直接按 `read_file` 注册和捕获。

### 3.2 `pluginId`：谁拥有工具

`pluginId` 来自已验证的插件 manifest，用于：

- 所有权和 provenance；
- Host capability / permission admission；
- 诊断、审计和插件卸载；
- Session 事件中解释工具由哪个插件贡献。

`pluginId` 永远不能拼入 Provider 的 `name` 字段，也不能通过改名绕过权限。

### 3.3 `registrationId`：这一次注册实例

`registrationId` 是进程内 opaque lease 身份，只用于：

- registration lease 和 drain；
- prepared execution 绑定；
- unload、诊断和资源回收。

它不能进入模型 schema、Provider wire 或跨 Session 的业务身份。

### 3.4 `callId`：这一次调用

`callId` 继续标识 Session 内一次模型调用。重试、人工重做和 outcome-unknown 的恢复创建新 `callId`，但调用的 `name` 仍是扁平稳定名。

## 4. 公共契约变化

这是一次 v2 全量切换，不保留旧 `toolId` 兼容字段或旧 Session importer。

### 4.1 Tool Definition

目标语义：

```ts
interface ToolDefinitionV2 {
  abiVersion: 2;              // breaking rename: toolId -> name
  name: string;              // flat model/runtime name, for example read_file
  pluginId: string;          // ownership and provenance
  definitionVersion: number;
  description: string;
  inputSchema: JsonSchema;
  effects: readonly ToolEffect[];
  concurrency: "exclusive" | "read-only" | "declared-safe";
  sensitiveArgumentPaths: readonly string[];
  resultSchemaVersion: number;
}
```

`aliases` 不再作为 Provider 或 Session 的兼容通道。未来若产品确实需要用户输入别名，必须另立显式的 user-command alias 规范，不能把它混入模型工具名。

### 4.2 LLM Message / Stream

以下字段统一改为 `name`：

- `LlmToolDefinition.name`；
- `LlmContentBlock` 的 tool-call `name`；
- `LlmStreamEvent` 的 tool-call delta `name`；
- Agent Loop 收集、校验和调度的 tool-call `name`。

Provider 返回未知名字时直接按 `name` 做 Registry lookup，并产生结构化 `TOOL_NOT_FOUND`；不尝试猜测、解码或回退到 namespaced 值。

### 4.3 Session 事件

`tool/call` 与 `tool/result` 的 durable payload 使用：

```json
{
  "callId": "call-1",
  "name": "read_file",
  "pluginId": "actspace.core-tools"
}
```

`name` 是事件事实的一部分，`pluginId` 是独立 provenance。核心 codec 不再接受 `toolId` 作为别名字段；旧事件不迁移、不兼容读取。

### 4.4 Cordis 插入点、通知和投影

- `tools/pre-execute`、`tools/execute`、`tools/post-execute` 的 payload 使用 `name`；
- `tools/result` 使用 `name` 和独立的 `pluginId`；
- approval、diagnostics、live progress、artifact owner 和 Runtime projection 使用同一命名语义；
- `agent/status` 只引用 `callId` / `name`，不携带 namespaced wire id；
- `surface`、renderer DTO 和 CLI JSONL 的工具行不再从 `toolId` 推断展示名。

插件 scope 仍然限制谁能干预哪一个 Agent 或 tool call；scope 不改变模型可见的 `name`。

## 5. Registry 与冲突规则

Registry 的核心索引改为 `Map<name, CapturedToolRegistration>`。

注册流程：

```text
validate name
→ validate pluginId / effects / schema
→ reject duplicate name in the same visible scope
→ capture { name, pluginId, definition, executor, policy, middleware, registrationId }
→ publish atomically
```

规则：

1. 非法名字在注册时 fail-fast，不能等 Provider 请求时才发现；
2. 同一可见 scope 的重复 `name` 一律失败，禁止静默覆盖；
3. Base Profile 的 first-party 名字必须全局唯一；
4. 如果未来启用 scoped shadowing，shadow 只能由显式 scope policy 授权，Provider 仍只看到被解析后的扁平 `name`；
5. registry lookup、allowed tool set、Agent/Explore preset 和 tool filter 全部使用 `name`；
6. `pluginId` 冲突与 `name` 冲突是两类不同诊断，不能通过拼接字符串混合处理。

## 6. Provider 适配边界

所有 Provider adapter 都直接转发 `name`：

| Provider surface | wire 字段 | 来源 |
|---|---|---|
| OpenAI Chat Completions | `function.name` | `LlmToolDefinition.name` |
| OpenAI Responses | `name` | `LlmToolDefinition.name` |
| Anthropic Messages | `name` | `LlmToolDefinition.name` |
| pi-ai context | `tools[].name` | `LlmToolDefinition.name` |
| Provider tool-call stream | 返回的 `name` | 原样回到 ActSpace `name` |

Adapter 只负责协议形状转换，不负责 namespace mapping。这样可以同时覆盖 DeepSeek、OpenAI-compatible、Anthropic 和 pi-ai 路径，避免某个 adapter 修好、另一个 adapter 继续发送非法名。

## 7. 工具实现保护边界

本规范不要求重写以下实现：

- `read_file` / `list_directory` 的路径限制、排序、截断、编码和错误语义；
- `edit_file` / `write_file` / `delete_file` 的副作用和 artifact 行为；
- `bash` / `bash_output` / `bash_kill` 的 subprocess 协议；
- Browser Bridge 工具的命令映射和 Host capability 协议；
- 既有 redaction、结果归一化、fixture 和行为测试。

可替换部分是 Tool Runtime 外壳：权限、审批、hooks、事件、progress、prepared lease、provenance 和 Host projection。名称切换只改变身份字段，不改变 executor body 的输入和输出合同。

注意：`WorkspaceOpenToolId` 等桌面端“用哪个外部应用打开文件”的枚举不是 Agent Tool Name，不因本规范机械重命名。实施时必须按领域边界迁移，而不是全仓库字符串替换。

## 8. 直接传递 `read_file` 的行为

当模型返回：

```json
{"name":"read_file","arguments":"{\"path\":\"README.md\"}"}
```

Agent Loop 只执行：

```text
visibleNames.has("read_file")
→ registry.capture("read_file")
→ prepared execution.name === "read_file"
→ executor(args, context)
```

不存在如下步骤：

```text
read_file → actspace.core-tools/read_file
```

因为 ownership 已经由 registration 中的 `pluginId` 保留，映射既不增加安全性，也不提供 DSH 没有的能力；它只增加出错面。

## 9. 迁移和兼容策略

用户已确认 v2 可以全量重构，因此本次采用一次切换：

- 删除 `toolId` 作为 Agent Tool identity 的公共字段；
- 删除 namespaced definition 生成逻辑；
- 删除 Todo/Subagent 的 wire aliases 和 `toolId` fallback；
- 新 Session 从空 Journal 开始；旧 Session 文件不导入、不双写、不兼容读取；
- 不保留 `function.name` 的 adapter-specific mapping；
- 不改桌面 Workspace Open Tool 的独立领域类型；
- 不修改具体 executor，除非 parity test 证明字段适配确实影响其行为。

## 10. 验收门

### 合同

1. 所有已加载 first-party Agent Tool 的 `name` 匹配 `^[a-zA-Z0-9_-]+$`；
2. Core、Browser、Todo、Subagent 的名字在可见 scope 内无重复；
3. 注册、lookup、allowed set、preset、prepared execution 全部使用 `name`；
4. `pluginId` 和 `registrationId` 在 provenance 中独立可见。

### Provider

1. OpenAI Chat、Responses、Anthropic、pi-ai 的 schema wire 都直接发送 `read_file` 等扁平名字；
2. Provider 返回的 tool-call name 可以无损回到 Agent Loop 并直接 lookup；
3. 任意 namespaced 名称在注册或调用边界被拒绝，而不是被猜测转换；
4. CLI run 的真实 DeepSeek 请求不再因工具名收到 400。

### Session / Loop / Notification

1. `tool/call` 和 `tool/result` 只写 `name`，codec 不接受 `toolId` fallback；
2. 9 个 Agent Loop 干预点、5 个主要通知、approval、diagnostics、projection 使用相同的 `name`；
3. replay、resume、abort、retry 和 outcome-unknown 保留同一扁平名字；
4. `session/event` 仍是 post-commit，通知失败不影响 durable fact。

### 工具行为

1. read/list/edit/write/bash/Browser Bridge 的现有行为测试继续通过；
2. 工具权限、审批、artifact、redaction 和 stdout 隔离不因名称迁移退化；
3. CLI `--json` 输出不混入工具 executor 的调试文本。

## 11. 最脆弱假设与回退

本方案假设：所有模型和未来插件都能接受一个 Runtime 可见 scope 内的全局扁平工具名。如果插件生态必须允许多个插件同时提供同名能力，`name` 仍不能编码 namespace；应重新评审显式 scoped visibility / profile selection，而不是恢复 `pluginId/name` wire 拼接。

如果该假设不成立，当前计划只需暂停 scoped collision 部分并重开 Registry policy 评审；Provider、Session 和 executor 的 `name` 契约仍保持不变。

回退只回滚代码提交，不改写或删除 Session、workspace 文件和工具产物。由于本次不做旧 Session 迁移，回退不会产生数据反向迁移成本。
