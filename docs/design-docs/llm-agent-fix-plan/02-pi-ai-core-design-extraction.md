# 从 pi-ai 中提取的 LLM 模块核心设计

## 背景

[pi](https://github.com/badlogic/pi-mono) 是 Mario Zechner 开发的极简编码 Agent 工具链。其 `packages/ai/src` 是一个经过 7 个生产项目验证的统一 LLM API 层。actspace-agent 的 LLM 四方法架构（`stream`/`complete`/`streamSimple`/`completeSimple`）和流式封装就是从 pi-ai 学习而来。

本文档分析 pi-ai 中值得提取到 `llm-agent-dev` skill 中的核心设计思想，结合本次 actspace-agent LLM 重构的教训，整理为 skill 改进的参考依据。

---

## 设计 1：函数式 API 而非类继承

### pi-ai 的做法

pi-ai 的公共 API 是 **4 个顶层函数**，而不是类方法：

```typescript
// stream.ts — 顶层函数，消费方直接导入使用
export function stream<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: ProviderStreamOptions,
): AssistantMessageEventStream {
  const provider = resolveApiProvider(model.api);
  return provider.stream(model, context, options as StreamOptions);
}

export async function complete<TApi extends Api>(
  model: Model<TApi>,
  context: Context,
  options?: ProviderStreamOptions,
): Promise<AssistantMessage> {
  return stream(model, context, options).result();
}

export function streamSimple<TApi extends Api>(...): AssistantMessageEventStream { ... }
export async function completeSimple<TApi extends Api>(...): Promise<AssistantMessage> { ... }
```

消费方调用：

```typescript
import { stream, complete, getModel } from '@mariozechner/pi-ai';
const model = getModel('deepseek', 'deepseek-r1');
const response = await complete(model, context);
```

### 与我们的差异

actspace-agent 使用 `LLMService` 接口 + `DeepSeekService` 类，消费方需要先获取 service 实例再调用方法。这增加了一层间接性，但也提供了更好的依赖注入和测试能力。

### 可提取的核心思想

- **`complete()` 永远是 `stream().result()` 的语法糖** — 这个模式在 pi-ai 和 actspace-agent 中一致，应在 skill 中明确为"铁律"
- **`streamSimple()` 是对 `stream()` 的 options 映射** — 把 `reasoning: "high"` 映射为 provider 特定参数
- 对于 **provider 数量少（< 3）的项目**，函数式 API 比类继承更简单
- 对于 **需要依赖注入的项目**，interface + 具体实现更合适

---

## 设计 2：StreamFunction 类型签名 — provider 作为纯函数

### pi-ai 的做法

每个 provider 导出的不是类，而是一个**符合 `StreamFunction` 签名的函数**：

```typescript
// types.ts
export type StreamFunction<TApi extends Api, TOptions extends StreamOptions> = (
  model: Model<TApi>,
  context: Context,
  options?: TOptions,
) => AssistantMessageEventStream;

// providers/openai-completions.ts — 导出的是一个 const 函数
export const streamOpenAICompletions: StreamFunction<"openai-completions", OpenAICompletionsOptions> = (
  model, context, options,
): AssistantMessageEventStream => {
  const stream = new AssistantMessageEventStream();
  (async () => {
    // ... 所有实现逻辑
    stream.push({ type: "done", reason: output.stopReason, message: output });
    stream.end();
  })();
  return stream;
};
```

### 核心设计要点

1. **Provider 实现是无状态的** — 不持有 `this`，每次调用独立创建 OpenAI client
2. **返回值是同步的** — `StreamFunction` 立即返回 `AssistantMessageEventStream`，异步逻辑在 IIFE 中执行
3. **错误被编码到流中** — 而不是抛出异常。contract 明确规定：

> Once invoked, request/model/runtime failures should be encoded in the returned stream, not thrown. Error termination must produce an AssistantMessage with stopReason "error" or "aborted" and errorMessage.

### 可提取的核心思想

- **"错误在流中"原则**：provider 的 `stream` 函数不应该 throw，所有错误应该通过 `{ type: "error", error }` 事件传递
- **函数立即返回流对象**：消费方拿到 stream 后就可以开始遍历，不需要 await

---

## 设计 3：push-based 的 EventStream 而非 AsyncGenerator

### pi-ai 的做法

```typescript
// utils/event-stream.ts
export class EventStream<T, R = T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private waiting: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;

  push(event: T): void { ... }  // 生产者推入
  end(result?: R): void { ... }  // 生产者标记结束
  async *[Symbol.asyncIterator](): AsyncIterator<T> { ... } // 消费者迭代
  result(): Promise<R> { ... }  // 一步拿到最终结果
}

export class AssistantMessageEventStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
  constructor() {
    super(
      (event) => event.type === "done" || event.type === "error",
      (event) => event.type === "done" ? event.message : event.error,
    );
  }
}
```

### 与 actspace-agent 的差异

actspace-agent 使用 `AsyncGenerator`（`async function*`）构建流：

```typescript
// actspace-agent 当前做法
private _stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
  const self = this;
  async function* generate() {
    yield { type: "text_delta", delta: "hello" };
    yield { type: "done", message: finalMessage };
  }
  return new AssistantMessageEventStream(generate());
}
```

pi-ai 使用 push-based 模式：

```typescript
// pi-ai 的做法
const stream = new AssistantMessageEventStream();
(async () => {
  stream.push({ type: "text_delta", ... });
  stream.push({ type: "done", reason: "stop", message });
  stream.end();
})();
return stream;
```

### 核心区别

| 维度 | AsyncGenerator (actspace) | push-based EventStream (pi-ai) |
|------|--------------------------|-------------------------------|
| 生产者模型 | pull — 消费者 `next()` 驱动 | push — 生产者主动推送 |
| 多消费者 | 不支持（generator 单消费） | 可扩展支持（queue + waiting） |
| `result()` | 需要完整消费流 | 独立 Promise，不需遍历 |
| 背压 | 天然背压 | 无背压，队列缓冲 |
| 代码复杂度 | 更简单 | 更复杂但更灵活 |

### 可提取的核心思想

- **两种流式封装模式各有适用场景**：AsyncGenerator 更简单直接，push-based 更灵活（支持 `result()` 独立消费、多消费者）
- **`result()` 方法是必须的**：无论哪种模式，都需要提供 `.result()` 一步获取最终 `AssistantMessage` 的能力
- **pi-ai 的 push-based 模式允许 `stream` 函数同步返回**：这是一个重要的设计决策——调用方拿到流对象时，异步请求可能还没开始

---

## 设计 4：ApiProvider Registry — 按 API 协议注册而非按供应商注册

### pi-ai 的做法

注册维度不是 "provider"（如 deepseek、anthropic），而是 **API 协议**（如 `openai-completions`、`anthropic-messages`）：

```typescript
// api-registry.ts
export interface ApiProvider<TApi extends Api, TOptions extends StreamOptions> {
  api: TApi;
  stream: StreamFunction<TApi, TOptions>;
  streamSimple: StreamFunction<TApi, SimpleStreamOptions>;
}

registerApiProvider({
  api: "openai-completions",
  stream: streamOpenAICompletions,
  streamSimple: streamSimpleOpenAICompletions,
});
```

一个 "openai-completions" provider 就同时覆盖了 DeepSeek、Groq、Cerebras、OpenRouter 等所有兼容 API 的供应商。供应商差异通过 `Model` 对象上的 `compat` 字段和 `baseUrl` 处理。

### 关键洞察

| 传统做法 | pi-ai 做法 |
|---------|-----------|
| 每个供应商一个 service 类 | 每个 API 协议一个 stream 函数 |
| DeepSeekService、GroqService、CerebrasService... | 全部走 `streamOpenAICompletions` |
| 供应商差异在 service 类中 | 供应商差异在 `Model.compat` 和 `detectCompat()` 中 |

### 可提取的核心思想

- **按 API 协议组织实现，按供应商配置差异**：大多数供应商只是 baseUrl 和 API key 不同，不需要单独的实现类
- **`compat` 配置对象** 解决 OpenAI 兼容 API 的供应商差异（如 `supportsStore`、`maxTokensField`、`thinkingFormat` 等），而不是用代码分支
- 对于 actspace-agent 的场景（只有 DeepSeek + Kimi），甚至不需要 registry——直接在 service 中处理差异即可

---

## 设计 5：Model 对象携带完整元数据

### pi-ai 的做法

```typescript
export interface Model<TApi extends Api> {
  id: string;           // 模型标识（如 "deepseek-r1"）
  name: string;         // 显示名称
  api: TApi;            // API 协议（决定用哪个 stream 函数）
  provider: Provider;   // 供应商标识
  baseUrl: string;      // API 端点
  reasoning: boolean;   // 是否支持推理
  input: ("text" | "image")[];  // 输入类型
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  compat?: OpenAICompletionsCompat | ...;  // 供应商特有的兼容性配置
}
```

模型对象 **不只是配置**，它携带了路由决策所需的全部信息。`stream()` 函数通过 `model.api` 找到对应的 provider，通过 `model.baseUrl` 和 `model.compat` 处理供应商差异。

### 与 actspace-agent 的差异

actspace-agent 的 `LLMConfig` 比较简单：

```typescript
export interface LLMConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}
```

### 可提取的核心思想

- **Model = 配置 + 能力声明 + 路由信息**：一个 Model 对象应该携带足够的信息让 service 层做出所有决策
- **成本信息应该在 Model 中**：用于 usage 统计和成本计算
- **能力声明（reasoning、image input）** 让 service 层在转换消息时自动处理降级

---

## 设计 6：消息转换的分层处理

### pi-ai 的做法

消息转换分为两层：

1. **`transformMessages()`**（`transform-messages.ts`）— **通用层**，处理跨 provider 的消息规范化：
   - 图片降级（对不支持视觉的模型替换为 placeholder）
   - thinking blocks 跨 provider 转换（Anthropic → OpenAI 时转为 text）
   - tool call ID 规范化（不同 API 的 ID 格式差异）
   - 孤儿 tool calls 补齐（assistant 有 tool_calls 但没有对应 toolResult 时插入 synthetic result）
   - 跳过 error/aborted 状态的 assistant messages

2. **`convertMessages()`**（`openai-completions.ts` 内）— **协议层**，将规范化后的内部消息转为具体 API 协议的格式

### 核心设计要点

- **孤儿 tool calls 自动补齐**是非常实用的防御性编程——API 要求每个 tool_call 都有对应的 tool role 回复，如果对话中断（abort、error），之前的 tool_calls 没有 result 就会导致 API 报错
- **error/aborted 的 assistant messages 被跳过**——这些不完整的回复不应该回放给 API
- 图片降级是按 `model.input` 自动判断的，不需要消费方关心

### 可提取的核心思想

- **消息转换应该是两层**：通用规范化（所有 provider 共享）+ 协议特定转换
- **防御性消息处理**：孤儿 tool calls 补齐、空 assistant messages 跳过、error messages 过滤
- skill 的 `convertMessages()` 示例应该包含这些防御性处理，而不只是简单的角色映射

---

## 设计 7：流式 chunk 处理的 block 累积模式

### pi-ai 的做法

在 `openai-completions.ts` 中，streaming 响应的处理使用了一种 **"block 累积"模式**：

```typescript
// 预分配结构
let textBlock: TextContent | null = null;
let thinkingBlock: ThinkingContent | null = null;
const toolCallBlocksByIndex = new Map<number, StreamingToolCallBlock>();

// 辅助函数：确保 block 存在，不存在则创建并 push start 事件
const ensureTextBlock = () => {
  if (!textBlock) {
    textBlock = { type: "text", text: "" };
    blocks.push(textBlock);
    stream.push({ type: "text_start", contentIndex: ..., partial: output });
  }
  return textBlock;
};

// 遍历 chunks
for await (const chunk of openaiStream) {
  if (choice.delta.content) {
    const block = ensureTextBlock();
    block.text += choice.delta.content;
    stream.push({ type: "text_delta", contentIndex: ..., delta: choice.delta.content, partial: output });
  }
  if (choice.delta.tool_calls) {
    for (const toolCall of choice.delta.tool_calls) {
      const block = ensureToolCallBlock(toolCall);
      block.partialArgs += toolCall.function?.arguments ?? "";
      block.arguments = parseStreamingJson(block.partialArgs);  // 增量 JSON 解析
      stream.push({ type: "toolcall_delta", ... });
    }
  }
}
// 流结束后 finalize 所有 blocks
for (const block of blocks) { finishBlock(block); }
```

### 核心设计要点

1. **`partial: output` 在每个事件中传递**：消费方随时可以看到当前组装到了什么程度
2. **增量 JSON 解析（`parseStreamingJson`）**：在 tool_call 参数还没完整时就开始解析，UI 可以实时渲染部分参数
3. **start/delta/end 三阶段事件**：text_start → text_delta × N → text_end，比 actspace-agent 的只有 delta 更精细
4. **tool_call 按 index 追踪**：因为 OpenAI 的 parallel tool calls 在流中是交错的

### 可提取的核心思想

- **start/delta/end 三阶段事件协议** 比只有 delta 的事件协议更强：UI 知道 block 何时开始、何时结束
- **增量 JSON 解析** 是好 UX 的关键：可以在 tool call 参数流式传入时实时展示（如文件 diff 预览）
- **`partial` 对象随每个事件传递**：UI 不需要自己累积，随时可以渲染当前状态

---

## 设计 8：faux provider — 测试级 mock 设计

### pi-ai 的做法

faux provider 不是简单的"返回固定内容"，而是一个完整的模拟系统：

```typescript
const faux = registerFauxProvider({
  tokensPerSecond: 50,  // 模拟真实速度
  models: [{ id: "test-model", reasoning: true }],
});

faux.setResponses([
  fauxAssistantMessage([
    fauxThinking("let me think..."),
    fauxToolCall("bash", { command: "ls" }),
  ], { stopReason: "toolUse" }),
  fauxAssistantMessage("Done!"),
]);

const stream = stream(faux.getModel(), context);
```

关键特性：
- **模拟流式 delta 拆分**：把文本按 token 大小拆成多个 chunk 发出
- **模拟延迟**：按 `tokensPerSecond` 控制发出速率
- **模拟 usage 估算**：基于 prompt 和 response 长度估算 token 数
- **模拟 prompt cache**：基于 sessionId 计算 cache hit/write
- **支持 response factory**：可以基于输入动态生成响应
- **状态追踪**：`state.callCount` 跟踪调用次数

### 可提取的核心思想

- **Mock 不只是返回固定内容** — 它应该模拟完整的流式行为，包括 delta 拆分、延迟、usage
- **Response queue + factory pattern** — 支持静态预设响应和动态响应两种模式
- **Mock 必须通过真实的 API 注册路径** — faux 通过 `registerApiProvider` 注册，走和真实 provider 完全相同的调用链路

---

## 设计 9：错误处理的统一模式

### pi-ai 的做法

所有错误都被转化为 `AssistantMessage` 格式（`stopReason: "error" | "aborted"`），然后通过流的 `error` 事件发出：

```typescript
try {
  // ... stream chunks
  stream.push({ type: "done", reason: output.stopReason, message: output });
  stream.end();
} catch (error) {
  output.stopReason = options?.signal?.aborted ? "aborted" : "error";
  output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
  stream.push({ type: "error", reason: output.stopReason, error: output });
  stream.end();
}
```

**关键点**：`error` 事件的 `error` 字段是一个完整的 `AssistantMessage`，而不是一个 `Error` 对象。这意味着即使出错，消费方也能拿到可能的部分响应（部分文本、部分 tool calls）。

### 与 actspace-agent 的差异

actspace-agent 的 `error` 事件携带的是 `Error` 对象：

```typescript
export type AssistantMessageEvent =
  | { type: "error"; error: Error };
```

这意味着出错时，之前已经收到的部分内容就丢失了。

### 可提取的核心思想

- **error 事件应该携带 AssistantMessage**：包含部分内容 + stopReason + errorMessage，让消费方能够处理部分结果
- **`aborted` 和 `error` 是两种不同的错误停止原因**：前者是主动取消，后者是异常
- **AbortSignal 检查应该在流处理的每个关键点**：不只是在最后，而是在每个 chunk 之间都应检查

---

## 设计 10：极简哲学 — 来自 pi 博客的哲学

来自 Mario Zechner 博客的关键洞察（结合本次重构教训）：

### "If I don't need it, it won't be built"

> My philosophy in all of this was: if I don't need it, it won't be built.

对应到 skill 改进：skill 不应该默认推荐 `BaseLLMService` + Registry + 多 tier 模式。应该先推荐最简单的模式（直接用 SDK），只有当真正需要时才升级到更复杂的架构。

### "Build on top of provider SDKs directly"

> Building on top of the provider SDKs directly gives me full control and lets me design the APIs exactly as I want, with a much smaller surface area.

pi-ai 虽然自己做 HTTP 请求（因为它需要支持浏览器和自定义 compat），但它的 `openai-completions.ts` **使用了 `openai` SDK 的类型系统和客户端**：

```typescript
import OpenAI from "openai";
const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
const { data: openaiStream } = await client.chat.completions
  .create(params, requestOptions)
  .withResponse();
```

### "Constraints make for minimal programs"

pi 有意限制功能（无 MCP、无内建 plan mode、无子 Agent、无后台 bash），反而做到了更好的可控性和更少的 bug。

### 对应到 LLM 模块的教训

1. **actspace-agent 只有 2 个 provider** — 不需要 registry、不需要 abstract class
2. **两个 provider 都用 OpenAI SDK** — 不需要手动 SSE 解析
3. **skill 的指导应该分层**：先教最简单的做法，等遇到具体问题再升级

---

## 对 skill 改进的具体建议

基于以上 10 个核心设计的提取，`llm-agent-dev` skill 应做如下改进：

### 1. 新增"按规模分层"的路径指引

| 场景 | 推荐模式 | 参考 |
|------|---------|------|
| 1-3 个 OpenAI 兼容 provider | Interface + 直接 SDK 调用 | actspace-agent 当前做法 |
| 3+ 个同 API 协议 provider | 函数式 API + registry | pi-ai 做法 |
| 跨 API 协议（OpenAI + Anthropic + Google） | 函数式 API + 多协议 registry + compat 配置 | pi-ai 完整做法 |

### 2. 新增示例代码

- `examples/llm-openai-sdk-service.ts` — 使用 OpenAI SDK 的具体 provider 实现
- `examples/llm-functional-api.ts` — 函数式 API 模式（来自 pi-ai）
- `examples/llm-event-stream.ts` — push-based EventStream 实现

### 3. 更新 `llm-service.md` 中的关键概念

- **"错误在流中"原则** — stream 函数不 throw，错误通过事件传递
- **消息转换两层模式** — 通用规范化 + 协议转换
- **防御性消息处理** — 孤儿 tool calls、空 messages、error messages
- **start/delta/end 三阶段事件协议**
- **`compat` 配置对象模式** — 处理 OpenAI 兼容 API 的供应商差异

### 4. 调整 `architecture.md` 的 V0/V1 定位

- V0 应该推荐 **interface + OpenAI SDK + 直接实现**
- V1 在需要时再引入 **registry + compat 配置**
- 删除"BaseLLMService 是必须的"这个假设

---

## 参考

- pi-ai 源码：`/Users/wakeup-jin/Desktop/code-project/back-code/pi-project/pi/packages/ai/src`
- Mario Zechner 博客：https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- Armin Ronacher 博客（pi 博客引用）：https://lucumr.pocoo.org/2025/11/21/agents-are-hard/
- actspace-agent LLM 重构记录：本次对话
