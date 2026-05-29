# Token Usage 与 Context State 设计

本文记录 actspace 在 token 统计、成本计算、上下文水位和未来上下文控制面板上的设计决策。它回答“哪些数据是事实、哪些数据是估算、分别存在哪里”，具体实施步骤见 `docs/exec-plans/active/actspace-token-usage-context-control-foundation.md`。

## 背景

actspace 的长期产品原则之一是“上下文的绝对控制”：用户应该能看见当前模型调用会加载哪些上下文、每类上下文占多少 token、每次模型回复真实消耗了多少 token 和成本，并在后续版本中能手动加入、删除、修改上下文。

另一个相关原则是优先适配 DeepSeek，尤其是利用 DeepSeek prompt cache 降低成本。因此 token 设计不能只显示总量，还要能记录 cache hit、cache miss、reasoning token 和按模型回复维度聚合的成本。

当前代码已经具备：

- `session.jsonl`：每个会话的持久化事件流。
- `context_snapshot`：当前较轻量的上下文用量快照。
- `AssistantMessage.usage`：模型回复上的 usage 汇总。
- `MODEL_REGISTRY`：当前定义在 `packages/shared/src/model-config.ts`，并由 IPC 契约 re-export 的模型注册表。

但当前设计仍有不足：

- usage 容易按 turn 或最终回复理解，无法稳定表达一轮 Agent 内多次 LLM call。
- DeepSeek 的 cache hit、cache miss、reasoning token 没有形成统一持久化事实。
- 成本统计缺少明确数据来源。
- context snapshot 与未来可编辑 context manifest 的边界不清。
- 模型配置、上下文窗口和价格配置需要从 IPC 契约中拆出，成为更清晰的共享配置。

## 核心原则

### 1. 模型 usage 是事实

每一次模型回复都应该产生一条 usage 事实。这里的“模型回复”指一次 LLM API call 的结果，不是用户的一轮 turn，也不是整个会话。

例如一轮 Agent 可能是：

```text
user_message
LLM call 1 -> thinking + tool_call
tool_result
LLM call 2 -> assistant_message
```

这应该产生两条 `llm_usage` 事件，而不是一条 turn usage。

### 2. 成本写入 usage，但价格配置不写入事件

`llm_usage` 应写入按当时模型配置计算出的 `cost`，这样后续会话统计、每日统计和历史查看不需要重新计算，也不会因为未来价格配置变化而改变旧统计结果。

但 `pricingSnapshot` 不进入 `session.jsonl`。模型价格、上下文窗口和 provider 映射应集中维护在共享模型配置中，例如：

```text
packages/shared/src/model-config.ts
```

第一阶段不做账单级价格版本审计。如果未来需要严格解释历史成本来源，可以引入价格配置版本号或独立 pricing history，而不是在每条 usage 中重复写完整价格快照。

### 3. Context snapshot 是轻量历史水位

`context_snapshot` 继续写入 `session.jsonl`，但只承担轻量历史记录职责：

- 当时上下文估算总量。
- 模型最大上下文窗口。
- 使用百分比。
- 各上下文 bucket 的估算 token。
- estimator 名称和版本。

它不存完整可编辑 context entries，也不作为未来 Context 控制面板的主状态源。

### 4. Context state 是当前可变视图

完整 context entries 属于当前视图状态，应单独存到每个会话目录下：

```text
sessions/{sessionId}/context-state.json
```

这个文件可以覆盖更新，服务前端 Context 弹窗和未来的手动上下文控制能力。它可以包含每个上下文条目的 title、kind、estimatedTokens、preview、sourceEventIds、contentHash、included、pinned、removable 等字段。

第一阶段只需要生成和展示，不做用户点击增删改。

## 数据分层

### `session.jsonl`

保存不可变或追加式事实：

- `user_message`
- `thinking`
- `tool_call`
- `tool_result`
- `assistant_message`
- `llm_usage`
- 轻量 `context_snapshot`
- `error`

它是会话恢复和统计事实来源。

### `meta.json`

保存会话摘要：

- session id
- title
- createdAt
- updatedAt
- turnCount

它不保存 usage 明细和上下文条目。

### `context-state.json`

保存当前上下文可视化和未来可编辑状态：

- updatedAt
- sessionId
- activeTurnId
- estimator
- totalEstimatedTokens
- maxTokens
- percentUsed
- buckets
- entries

它是可变视图，可以被覆盖写入。未来当用户手动删除、添加、锁定上下文时，也应优先更新这个文件或由它派生的状态。

### `model-config.ts`

保存模型配置：

- modelId
- provider
- apiModel
- contextWindow
- thinkingDefault
- displayName
- pricing

`packages/shared/src/ipc.ts` 不再作为模型配置的主要承载文件。它可以 re-export 模型配置，保持现有消费方兼容。

## 建议类型

### `LlmUsagePayload`

```ts
export type LlmUsagePayload = {
  callId: string;
  provider: "deepseek" | "kimi" | "mock";
  model: string;
  modelId?: string;

  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  reasoningTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  serverToolUse?: {
    webSearchRequests?: number;
    webFetchRequests?: number;
  };

  cost: {
    input: number;
    output: number;
    cacheHitInput?: number;
    cacheMissInput?: number;
    reasoning?: number;
    total: number;
    currency: "CNY" | "USD";
  };

  relatedEventIds?: string[];
};
```

字段说明：

- `callId`：一次 LLM API call 的唯一 ID。
- `provider`：模型服务商，例如 `deepseek`、`kimi`。
- `model`：provider API 使用的模型名。
- `modelId`：产品内模型 ID，便于回到共享模型配置。
- `promptTokens`：本次请求输入 token，包含系统提示词、工具定义、历史、当前用户输入、工具结果等。
- `completionTokens`：本次模型输出 token，包含普通文本、工具调用输出和 reasoning token。
- `totalTokens`：本次总 token。
- `reasoningTokens`：模型思考 token，DeepSeek reasoner 等模型可返回。
- `cacheHitTokens`：prompt 中命中缓存的 token。
- `cacheMissTokens`：prompt 中未命中缓存的 token。
- `cost`：按当时 `model-config.ts` 中价格计算出的费用。
- `relatedEventIds`：本次模型回复产生或关联的 session events，例如 `thinking`、`tool_call`、`assistant_message`。

### 轻量 `ContextSnapshotPayload`

```ts
export type ContextSnapshotPayload = {
  totalEstimatedTokens: number;
  maxTokens: number;
  percentUsed: number;
  buckets: Array<{
    key:
      | "systemPrompt"
      | "tools"
      | "rules"
      | "skills"
      | "mcp"
      | "subagents"
      | "conversation";
    label?: string;
    tokens: number;
  }>;
  estimator: {
    name: string;
    version: string;
  };
};
```

### `ContextState`

```ts
export type ContextState = {
  sessionId: string;
  activeTurnId?: string;
  updatedAt: string;
  estimator: {
    name: string;
    version: string;
  };
  totalEstimatedTokens: number;
  maxTokens: number;
  percentUsed: number;
  buckets: ContextSnapshotPayload["buckets"];
  entries: ContextStateEntry[];
};

export type ContextStateEntry = {
  id: string;
  kind:
    | "systemPrompt"
    | "toolDefinitions"
    | "rules"
    | "skills"
    | "mcp"
    | "subagentDefinitions"
    | "conversation";
  title: string;
  estimatedTokens: number;
  included: boolean;
  pinned?: boolean;
  removable?: boolean;
  sourceEventIds?: string[];
  contentHash?: string;
  preview?: string;
};
```

## Token 估算与真实 usage

估算 token 和真实 usage 必须分开：

- 发送前：使用本地 estimator 估算 context 大小，驱动上下文占比、bucket 展示和压缩判断。
- 发送后：使用 provider 返回的 usage 记录真实消耗，驱动统计和成本。

第一阶段可以继续使用现有字符比例估算器，但需要记录 estimator 名称和版本，避免未来更换 tokenizer 后难以解释旧数据。

## DeepSeek Cache 设计影响

DeepSeek prompt cache 命中依赖请求前缀复用。上下文系统后续应尽量保持高复用内容的稳定顺序：

1. system prompt
2. rules
3. skills
4. tool definitions
5. MCP/subagent definitions
6. conversation and volatile context

第一阶段只记录 cache hit 和 cache miss。后续 Context 控制面板可以显示 cache-friendly prefix，并提示用户修改前缀上下文会影响缓存命中率。

## 被排除的方案

### 不把完整 Context Manifest 写入 `session.jsonl`

完整 entries 会随当前上下文视图频繁变化，写入事件流会让 session 膨胀，也会把可变视图误当作不可变事实。第一阶段只把轻量水位写入 `context_snapshot`。

### 不在每条 usage 中保存 `pricingSnapshot`

价格配置统一维护在共享模型配置中。usage 只保存已经计算好的成本和原始 token。这样既能稳定统计，又避免每条事件重复写价格表。

### 不按 turn 聚合 usage 作为事实

turn、session、day 的统计都可以从 `llm_usage` 聚合得出。持久化事实应保持在最细的模型回复粒度。

## 第一阶段验收

- `packages/shared/src/model-config.ts` 成为模型配置事实来源。
- `session.jsonl` 出现 `llm_usage` 事件，且每次模型回复一条。
- DeepSeek usage 包含 prompt、completion、total、reasoning、cache hit、cache miss。
- `llm_usage.payload.cost` 按当前模型配置计算并持久化。
- `context_snapshot` 保留轻量 bucket 和 estimator 信息。
- 每个会话目录存在可覆盖的 `context-state.json`，用于前端 Context 弹窗展示。
- 前端 Context 弹窗能显示整体占比、bucket 和 entries；第一阶段不提供增删改按钮。
