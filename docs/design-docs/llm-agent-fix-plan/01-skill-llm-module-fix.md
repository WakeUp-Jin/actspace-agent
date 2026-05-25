# llm-agent-dev Skill LLM 模块指导缺陷分析与修复计划

## 背景

在 actspace-agent 的 LLM 服务层重构中（2025-05-25），旧代码呈现出三个明显问题：

1. 手动 fetch + SSE 解析（329 行 `openai-compatible.ts`），没有使用 OpenAI SDK
2. `BaseLLMService` 抽象基类模式，所有 provider 必须继承并实现 `_doStream`
3. `kimi-assistants/` 创建了不必要的文件夹来放 3 个函数

经分析，**这三个问题中的前两个直接源自 skill 的指导内容**，第三个属于实现者的判断问题。

---

## 问题 1：Skill 将 BaseLLMService 抽象类作为唯一推荐模式

### 在 Skill 中的位置

- `references/llm/llm-service.md` 第 13-31 行
- `examples/llm-service.ts` 第 289-388 行
- `references/architecture.md` 第 103-109 行

### 问题描述

Skill 在三个层面明确规定了 BaseLLMService 抽象类模式：

**`llm-service.md` 用"第二层"将其定义为架构标准：**

> 第二层：服务基类（BaseLLMService）
> 采用 stream-first 设计，子类只需实现一个抽象方法 `_doStream`，基类提供四个公开方法

**`examples/llm-service.ts` 提供了完整可复制的 BaseLLMService 实现**，包括 `abstract _doStream`、`convertMessages()`、`resolveSimpleOptions()` 等。LLM 在根据 skill 编写代码时会直接复制这个模式。

**`architecture.md` 在 V0 目录结构中将 `base` 列为必要文件**：

```
llm/
  types
  base            # BaseLLMService
  openai_service
  factory
```

### 为什么这导致了问题

BaseLLMService 抽象类的设计假设是"不同 provider 的 API 差异很大"（OpenAI vs Anthropic vs Google 等）。但 actspace-agent 只有 DeepSeek 和 Kimi——两者都是 OpenAI 兼容 API。在这种场景下：

- 抽象基类变成了纯粹的间接层：两个 `_doStream` 实现都只是把参数透传给同一个 `streamOpenAICompatibleChatCompletions` 函数
- `convertMessages()` 作为基类 protected 方法，使得测试和修改都不方便
- 消费方（engine/loop.ts 等）被迫依赖具体类而非接口

**根本问题**：Skill 没有区分"通用 Agent 框架需要支持多种不同 API 的 provider"和"具体项目只使用少数 OpenAI 兼容 provider"这两种场景。它把通用框架的设计模式作为所有项目的默认推荐。

### 建议修复

在 `llm-service.md` 中：

1. 将 BaseLLMService 定位为"多 API 格式 provider（如同时支持 OpenAI + Anthropic + Google）"的选型，而非默认选型
2. 新增"简化路径"：当所有 provider 都是 OpenAI 兼容时，推荐 LLMService 接口 + 具体实现（不需要抽象类）
3. 在架构三层结构中明确两条路径的适用场景

在 `architecture.md` 中：

1. V0 目录结构中将 `base` 标记为可选，而非必须
2. 新增说明：如果只使用 OpenAI 兼容 provider，可以用 `LLMService` 接口替代抽象基类

---

## 问题 2：Skill 没有推荐使用 OpenAI SDK

### 在 Skill 中的位置

- `references/llm/llm-service.md` 第 26-30 行
- `examples/llm-service.ts`（完整文件）

### 问题描述

Skill 对具体服务类的职责描述如下：

> 每个 LLM 提供商一个实现类。子类只需实现 `_doStream(messages, tools?, options?)`。每个服务类处理该提供商特有的：
> - SDK 客户端初始化
> - **流式 SSE 解析**，组装 AssistantMessageEvent 事件流

关键问题在于：

1. "流式 SSE 解析"被列为每个服务类的职责，暗示需要自己实现 SSE 解析
2. `examples/llm-service.ts` 中完全没有展示 OpenAI SDK 的用法——它只展示了 BaseLLMService 抽象类的骨架
3. `architecture.md` 提到 "OpenAIService（通过 OpenAI SDK 兼容 DeepSeek）" 但这只是一句话，没有对应的示例代码
4. 整个 skill 没有任何代码示例展示 `import OpenAI from "openai"` + `client.chat.completions.create({ stream: true })` 的用法

这导致 LLM 在执行时选择了手动实现 SSE 解析——因为 skill 将其定位为"服务类的职责"，且没有提供 SDK 替代方案。最终产出了 329 行的 `openai-compatible.ts`。

### 为什么 OpenAI SDK 更好

对于 OpenAI 兼容 provider（DeepSeek、Kimi、Groq、Together 等）：

- SDK 处理 SSE 解析、HTTP 错误重试、AbortSignal、超时——无需手动实现
- `for await (const chunk of stream)` 直接遍历，代码量减少 70%
- SDK 有良好的 TypeScript 类型支持
- 错误会自动分类为 `APIError`，包含 status code

### 建议修复

1. `llm-service.md` 中新增"OpenAI SDK 作为默认实现工具"小节，说明对于 OpenAI 兼容 provider 应该直接使用 SDK
2. 将"流式 SSE 解析"从服务类职责中移除，改为"使用 SDK 遍历流式响应并映射为 AssistantMessageEvent"
3. 新增 `examples/llm-deepseek-service.ts`，展示使用 OpenAI SDK 实现的具体 provider：

```typescript
import OpenAI from "openai";

export class DeepSeekService implements LLMService {
  private client: OpenAI;

  constructor(config: LLMConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? "https://api.deepseek.com",
    });
  }

  stream(context: Context, options?: StreamOptions): AssistantMessageEventStream {
    // 使用 SDK 流式调用，而非手动 fetch + SSE 解析
    const stream = await this.client.chat.completions.create({
      model: this.config.model,
      messages: convertMessages(context),
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      // 映射 chunk 为 AssistantMessageEvent
    }
  }
}
```

---

## 问题 3：Skill 的 "为什么自己封装" 论述造成误导

### 在 Skill 中的位置

- `references/llm/llm-service.md` 第 55-62 行

### 问题描述

Skill 用一整节论述"为什么自己封装而非用 LangChain/LlamaIndex"：

> 自定义封装的优势：
> - 轻量级，只包含必要功能
> - 避免供应商锁定，替换底层更容易

这段论述的隐含信息是"不要用现成的 SDK 和库"。虽然它针对的是 LangChain 这类框架，但在没有同时推荐 OpenAI SDK 的情况下，LLM 可能将其理解为"应该从 fetch 开始完全手写"。

实际上，"自己封装"和"使用 OpenAI SDK"并不矛盾——OpenAI SDK 是底层 HTTP 客户端，不是 LangChain 那样的抽象框架。

### 建议修复

在"为什么自己封装"小节中明确区分：

- **不推荐使用的**：LangChain、LlamaIndex 等高层框架（增加不必要的抽象和依赖）
- **推荐使用的**：各 provider 的官方 SDK（如 `openai` 包），它只是 HTTP 客户端 + 类型定义，不会引入架构约束

---

## 问题 4：缺少"interface 优于 abstract class"的指导

### 问题描述

Skill 从头到尾只展示了 `abstract class BaseLLMService` 这一种模式。但对于 TypeScript 项目来说，`interface LLMService` + 具体实现是更轻量、更符合习惯的选择：

- Interface 不需要继承链
- 消费方只依赖行为契约，不依赖具体实现
- 每个 service 的 `complete()` / `completeSimple()` 完全可以复用 `stream().result()` 模式，不需要基类来提供

当前 Skill 只在 `examples/llm-service.ts` 中展示了 abstract class，让 LLM 认为这是唯一的实现方式。

### 建议修复

在 `llm-service.md` 中新增两种实现路径的对比：

| 维度 | Interface 模式 | Abstract Class 模式 |
|------|---------------|-------------------|
| 适用场景 | provider 少、API 格式统一 | provider 多、API 格式差异大 |
| 消息转换 | 各 service 内部实现 | 基类 convertMessages() + 子类覆写 |
| 代码复用 | 工具函数提取公共逻辑 | 基类方法继承 |
| 消费方耦合 | 仅依赖 interface | 依赖 abstract class |
| 推荐触发条件 | <= 3 个同类 provider | > 3 个或跨 API 格式 |

---

## 问题 5：示例代码只有骨架没有实际实现

### 问题描述

`examples/llm-service.ts` 有 389 行，看起来非常完整，但它的核心内容是：

- Content 类型定义（200+ 行）—— 这些应该在 messages 模块中
- BaseLLMService 抽象类骨架（100 行）
- `_doStream` 只是 `protected abstract` 声明

完全没有展示一个具体 provider 如何实现 `_doStream`。LLM 看到这个示例后，需要自己"发明"实现方式——这就是为什么它选择了从 fetch 开始手写。

### 建议修复

新增 `examples/llm-openai-compatible-service.ts`，展示一个完整的、使用 OpenAI SDK 的具体 provider 实现，包括：

- OpenAI 客户端初始化
- 流式 chunk 遍历和事件映射
- tool_call 累积和解析
- usage 统计
- 错误映射

---

## 修复优先级

| 优先级 | 问题 | 影响范围 |
|--------|------|----------|
| P0 | 问题 2：缺少 OpenAI SDK 推荐 | 直接导致 329 行手写 SSE 代码 |
| P0 | 问题 5：缺少具体 provider 示例 | 导致 LLM 无从参考，自行发明实现 |
| P1 | 问题 1：BaseLLMService 作为唯一模式 | 所有 provider 少的项目都会被过度抽象 |
| P1 | 问题 4：缺少 interface 路径 | 消费方不必要地耦合到 abstract class |
| P2 | 问题 3：封装论述措辞 | 间接影响实现决策 |

## 需要修改的 Skill 源文件

源文件仓库：`/Users/wakeup-jin/Desktop/code-project/side-project/agent-harness-dev`

1. `references/llm/llm-service.md` — 核心参考文档，需要最多修改
2. `references/architecture.md` — V0 目录结构和 LLM 模块说明
3. `examples/llm-service.ts` — 现有示例代码（补充或拆分）
4. **新增** `examples/llm-openai-compatible-service.ts` — 使用 OpenAI SDK 的具体 provider 实现示例
