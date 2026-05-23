# Agent Runtime 模块化架构模式

从 `actspace` 后端 agent-core 重构中提炼的 LLM Agent Runtime 架构模式。这套分层方式不绑定具体产品，可以复用到其他需要本地运行 LLM Agent 的项目。

关联变更：`docs/histories/2026-05/20260523-2142-backend-agent-runtime-rebuild.md`

## 为什么不能直接一个大文件

首版 agent-core 是 6 个平铺文件（agent/llm/tools/context/persistence/types），起步够快，但一旦需要：

- 给 LLM 换 provider（mock → DeepSeek → OpenAI）
- 加新工具而不改注册逻辑
- 让上下文组装支持插拔（系统提示词、会话历史、工具结果各自独立）
- 把执行循环从 Agent 实例中剥离出来做测试

单文件就会把"什么是接口"和"什么是实现"混在一起，每次改动都有连带风险。

## 五层模块的职责边界

```
messages.ts + internal-tools.ts + adapters.ts   ← 类型层（纯数据定义 + 转换）
llm/                                             ← 模型服务层
tools/                                           ← 工具系统层
context/                                         ← 上下文管道层
engine/                                          ← 执行引擎层
persistence/                                     ← 持久化层
```

关键约束：**依赖只能从上往下**。engine 可以依赖 llm/tools/context，但 llm 不应该知道 engine 的存在。这让每一层都可以独立测试。

## 三个值得记住的模式

### 1. Discriminated Union 驱动的 Message 类型

不要用 `type: string` + 可选字段来表达消息变体，用 TypeScript discriminated union：

```typescript
type Content =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; input: Record<string, unknown> }

type Message =
  | { role: 'user'; content: Content[] }
  | { role: 'assistant'; content: Content[]; stopReason?: StopReason }
  | { role: 'tool_result'; toolCallId: string; output: string; isError: boolean }
```

好处：switch-case 时编译器帮你穷尽分支，加新变体时所有遗漏都会报错。坏处：类型之间的转换函数（adapter）会多一些，但这个成本值得。

### 2. Stream-first LLM 服务

抽象基类只有一个必须实现的方法是 `stream()`，`complete()` 由 stream 聚合得到：

```typescript
abstract class BaseLLMService {
  abstract stream(messages: APIMessage[], options?: StreamOptions): AsyncIterable<AssistantMessageEvent>;
  async complete(messages: APIMessage[]): Promise<AssistantMessage> {
    // 消费 stream，拼装最终结果
  }
}
```

这比同时维护两套独立的 stream/complete 实现要安全得多——行为一致性由基类保证，子类只需关心流式产出。MockLLMService 也用同样的模式，所以测试时能完整验证流式事件序列。

### 3. 兼容层迁移

重构不是一步到位的，旧 API 的消费方（比如 Electron main 进程）还在用 `import { runTurn } from './agent'`。解法是把旧文件变成"薄兼容层"，内部 re-export 新模块的 API：

```typescript
// agent.ts（兼容层）
export { Agent, runAgentLoop } from './engine';
export { createAgentRuntime } from './engine/agent';
```

这样消费方零改动就能过渡，等全部切换完毕后再删除兼容层。

## 常见陷阱

- **工具定义和执行混在一起**：把 JSON Schema 定义和实际 executor 函数写在同一个对象里看起来方便，但一旦要做权限检查或结果裁剪，耦合就会暴露。拆成 `definition.ts` + `executor.ts` 是更安全的起点。
- **ContextModule 做太多事**：每个 module 应该只负责"给出自己那部分上下文"，压缩和优先级排序交给 ContextManager。否则模块之间会互相依赖对方的 token 预算。
- **执行循环中的状态泄露**：`runAgentLoop` 应该是纯函数（接收配置，返回结果），不要在循环内部修改外部状态。状态变化通过 event sink 回调向外传递，由调用方（Agent 类）决定如何处理。

## 自检问题

1. 如果要增加一个新的 LLM provider（比如 Claude），需要改动哪些文件？（答案：只需要在 `llm/services/` 加一个子类 + 在 factory 注册）
2. 执行循环的"内层"和"外层"分别处理什么？为什么要分两层？
3. 兼容层什么时候可以安全删除？判断标准是什么？
