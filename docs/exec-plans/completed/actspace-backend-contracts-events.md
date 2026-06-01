# actspace 后端计划 A：核心类型体系与共享契约

## 目标

建立后端 Agent Runtime 的核心类型体系，包括 agent-core 内部类型（Message 判别联合、Content 类型、Context 容器）和前后端共享契约（SessionEvent、RuntimeStreamEvent、AgentTurnResult），让后续所有模块都围绕同一套类型推进。

本计划是后端所有并行计划的**类型地基**。计划分两层：agent-core 内部类型（LLM/Context/Tools 直接消费）和 shared 契约类型（前端/IPC 消费）。两层之间通过 adapter 桥接。

## 设计来源

- `docs/design-docs/agent-backend-design.md`
- `.agents/skills/llm-agent-dev/references/context/mgmt-context-architecture.md`（核心：Message/Content/Context 类型层次）
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`（AssistantMessage 结构、Usage、stopReason）
- `.agents/skills/llm-agent-dev/references/tools/tool-definition.md`（InternalTool、ToolResult）
- `.agents/skills/llm-agent-dev/examples/context-manager.ts`（类型使用示例）
- `.agents/skills/llm-agent-dev/examples/llm-service.ts`（类型定义参考）
- `docs/ARCHITECTURE.md`
- `docs/design-docs/front-中间消息区规范.md`

## 相关路径

- `packages/agent-core/src/types.ts`（当前内部类型，需要按 Skill 重构）
- `packages/shared/src/session.ts`（当前共享契约，需要补齐和对齐）
- `packages/shared/src/index.ts`
- `packages/desktop/src/renderer/fixtures/`
- `packages/desktop/src/renderer/utils/`

## 范围

包含：

**agent-core 内部类型（核心新增）：**

- 定义 `Message` 判别联合（通过 `role` 字段判别）：
  - `UserMessage`（role: "user"）：content 支持 string 或结构化内容
  - `AssistantMessage`（role: "assistant"）：content 为结构化数组 `Content[]`，含 model/provider/usage/stopReason
  - `ToolResultMessage`（role: "toolResult"）：通过 toolCallId 关联 ToolCallContent，含 isError
- 定义 `Content` 判别联合（通过 `type` 字段判别）：
  - `TextContent`（type: "text"）
  - `ThinkingContent`（type: "thinking"）：含 signature 字段
  - `ToolCallContent`（type: "toolCall"）：含 id/name/arguments
  - `ImageContent`（type: "image"）
- 定义 `Context` 顶层容器：`{ systemPrompt?: string; messages: Message[]; tools?: Tool[] }`
- 定义 `Usage`：含 input/output/cacheRead/cacheWrite/totalTokens + 嵌套 cost 对象
- 定义 `stopReason`：stop | toolUse | length | error | aborted
- 定义 `MessagePriority`：CRITICAL=4 / HIGH=3 / NORMAL=2 / LOW=1
- Message 可选管理字段：`source`、`priority`、`timestamp`
- 定义 `Tool`（给 LLM 看的 definition 子集）：name/description/parameters
- 定义 `InternalTool`（系统内部完整工具）：含 handler/check_permissions/render_result/is_read_only/category
- 定义 `ToolResult`：success/data/error

**shared 契约类型（补齐和对齐）：**

- 稳定 `SessionEvent` 持久化事件类型（首版 8 种）
- 稳定 `RuntimeStreamEvent` 流式运行事件类型
- 确认 `ToolExecutionResult`、`ToolUiPreview`、`ContextUsageSnapshot`、`AgentTurnResult`
- 定义 agent-core Message → shared SessionEvent 的 adapter 方向

**Mock Fixtures：**

- 增加基于新类型体系的完整 turn fixtures
- fixtures 应能被前端消息 adapter 和后端测试复用

不包含：

- 不实现真实 provider、工具、执行引擎或持久化
- 不改变 Electron IPC 主流程

## 类型体系设计要点

### Message 判别联合

```ts
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

关键设计决策（来自 Skill `mgmt-context-architecture.md`）：

- 每种角色只定义自己需要的字段，不用一个"大而全"的 ContextItem 承载所有角色
- AssistantMessage.content 是 `Content[]` 结构化数组，不是 `string`——文本、推理链、工具调用各归其位
- `source` 和 `priority` 是可选的管理字段，LLM 调用时忽略，压缩和持久化时使用

### Context 容器

```ts
type Context = {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
};
```

关键设计决策：

- systemPrompt 是独立字段，不混入 messages[0]
- `getContext()` 返回 Context，消费方不需要从消息数组中猜测 system message
- 调用方在 Context 上附加 tools 后传入 LLM Service

### 与现有类型的关系

- `AssistantReply`（shared）保留为前端消费的轻量类型
- `AssistantMessage`（agent-core）是内部完整类型，含结构化 content 数组
- adapter 负责 AssistantMessage → AssistantReply / SessionEvent 的转换
- 两套类型不应混用：agent-core 内部只用 Message 体系，shared 只暴露前端需要的

## V0 和 V1 边界

V0（本计划首要目标）：

- Message/Content/Context 判别联合完整可用
- InternalTool + ToolResult 基础类型
- Usage 基础结构（不含 cost 嵌套也可以先 V0）
- SessionEvent/RuntimeStreamEvent 保持现状或小幅补齐
- 一套完整 turn 的 mock fixtures

V1（后续增强）：

- MessagePriority 系统和 source 标记完整使用
- Usage.cost 嵌套计费结构
- 更完善的 adapter（runtime event → session event 双向）
- ThinkingContent.signature 多轮回传支持

## 验收

命令：

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm typecheck`

行为验收：

- agent-core 内部可以构造 UserMessage → AssistantMessage（含 ToolCallContent）→ ToolResultMessage 的完整消息序列
- Context 可以组装 systemPrompt + messages + tools 并传入 LLM Service 接口
- AssistantMessage 可以通过 adapter 转换为前端消费的 SessionEvent / MessageBlock
- Mock fixtures 覆盖完整 turn 所有事件类型（含失败场景）
- 新老类型不冲突，现有前端代码不因类型变更而 break

## 并行关系

- 本计划是其他后端计划的推荐前置地基
- LLM Service（计划 B）依赖 Message/Content/Context/Usage 类型
- Tool Runtime（计划 C）依赖 InternalTool/ToolResult 类型
- Context Pipeline（计划 D）依赖 Message/Context/ContextParts 类型
- Execution Engine（计划 E）依赖所有上述类型 + AgentEvent
- Persistence（计划 F）依赖 SessionEvent 持久化格式

## 进度

- [x] 审查现有 `packages/agent-core/src/types.ts` 和 `packages/shared/src/session.ts`
- [x] 定义 Content 判别联合（TextContent/ThinkingContent/ImageContent/ToolCallContent）
- [x] 定义 Message 判别联合（UserMessage/AssistantMessage/ToolResultMessage）
- [x] 定义 Context 容器（systemPrompt + messages + tools）
- [x] 定义 Usage（含嵌套 cost）和 StopReason
- [x] 定义 InternalTool、ToolResult、PermissionResult、InternalToolRegistry
- [x] 定义 Message ↔ SessionEvent adapter（双向转换 + AssistantMessage → AssistantReply）
- [x] 增加完整 turn mock fixtures（user → thinking + tools → tool results → final reply）
- [x] 增加失败场景 fixtures（工具错误、provider 错误、abort）
- [x] 验证前端消息 adapter 可消费 fixtures（shared session-selectors 无变更，类型检查通过）
- [x] 通过全仓库类型检查（pnpm typecheck + pnpm build 全部通过）
- [ ] 更新相关文档和 history

## 决策记录

- 2026-05-23：以设计文档作为后端契约设计来源，先统一 shared 契约再并行实现各后端模块。
- 2026-05-23：按 Skill `mgmt-context-architecture.md` 的类型层次重构，agent-core 内部类型采用 Message 判别联合 + Content 结构化数组，与 shared 前端契约通过 adapter 桥接。V0 先建立类型骨架，V1 补全 priority/cost 等管理字段。
