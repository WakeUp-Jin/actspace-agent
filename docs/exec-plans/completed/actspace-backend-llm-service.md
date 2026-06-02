# actspace 后端计划 B：LLM Service — stream-first BaseLLMService

## 目标

建立 stream-first 的 LLM Service 层，采用 Skill 推荐的 BaseLLMService 基类模式。子类只需实现 `_doStream`，基类在此之上提供 stream/complete/streamSimple/completeSimple 四个公开方法。首版唯一真实 provider 为 DeepSeek（通过 OpenAI 兼容 SDK），同时保留稳定 mock provider。

## 设计来源

- `docs/design-docs/agent-backend-design.md`
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`（核心：三层架构、stream-first、convertMessages）
- `.agents/skills/llm-agent-dev/references/architecture.md`（V0/V1 LLM 模块定位）
- `.agents/skills/llm-agent-dev/examples/llm-service.ts`（BaseLLMService 参考实现）
- `.agents/skills/llm-agent-dev/examples/llm-factory.ts`（工厂函数参考）
- `docs/references/llm-agent-dev-skill-fixes/fix-llm-agent-dev-skill.md`（Skill 缺少 services/ 目录建议的补充）
- `docs/SECURITY.md`

## 目标目录结构

```
packages/agent-core/src/llm/
  types.ts              # LLMConfig, StreamOptions, SimpleStreamOptions, APIMessage, AssistantMessageEvent
  base.ts               # BaseLLMService 抽象基类
  factory.ts            # createLLMService() 工厂函数
  services/
    deepseek.ts         # DeepSeekService（通过 OpenAI 兼容 SDK 接入）
    mock.ts             # MockLLMService（开发测试）
```

Skill 原始 V0 目录结构将基类和具体实现平铺在 `llm/` 下，本项目采用 `services/` 子目录分离——基础设施（types/base/factory）在 `llm/` 根，具体 provider 实现在 `llm/services/` 内。新增 provider 只需在 `services/` 下加文件。

## 相关路径

- `packages/agent-core/src/llm.ts`（当前实现，将被拆分为上述目录结构）
- `packages/agent-core/src/types.ts`（依赖计划 A 的 Message/Context/Usage 类型）
- `packages/agent-core/src/messages.ts`（计划 A 产物）
- `packages/shared/src/session.ts`

## 范围

包含：

**V0 骨架（首要目标）：**

- 建立 `llm/` 目录结构（types + base + factory + services/）
- 定义 `LLMConfig`、`StreamOptions`、`SimpleStreamOptions`
- 定义 `APIMessage`、`APIToolCall`（OpenAI 兼容格式）
- 定义 `AssistantMessageEvent` 流式事件：text_delta / thinking_delta / tool_call_delta / done / error
- 定义 `AssistantMessageEventStream`（AsyncIterable wrapper + `.result()` 消费方法）
- 实现 `BaseLLMService` 抽象基类：
  - 唯一抽象方法 `_doStream(messages: APIMessage[], tools?: Tool[], options?: StreamOptions): AssistantMessageEventStream`
  - 公开方法 `stream(context)` / `complete(context)`
  - 公开方法 `streamSimple(context, options?)` / `completeSimple(context, options?)`
  - `convertMessages(context)` 方法
- 实现 `DeepSeekService`（`services/deepseek.ts`）：通过 OpenAI 兼容 SDK 接入 DeepSeek API
- 实现 `MockLLMService`（`services/mock.ts`）：稳定产出完整 turn 所需的 AssistantMessage 序列
- 实现工厂函数 `createLLMService(config: LLMConfig)`
- 迁移现有 `llm.ts` 中的 mock provider 和 registry 到新结构

**V1 增强（后续）：**

- Provider Registry（多 provider 注册/查找/切换）
- LLMServiceRegistry（high/medium/low 三级模型实例）
- 重试机制（指数退避）
- Provider 错误分类（可重试 vs 不可重试）
- Token 统计累计
- 子类可重写 `convertMessages()` 适配非 OpenAI 兼容 provider
- 子类可重写 `resolveSimpleOptions()` 支持 provider 特定参数

不包含：

- 不实现复杂多模型路由
- 不做压缩模型 tier
- 不做完整模型设置 UI
- 不把密钥写入仓库

## 架构三层结构（来自 Skill）

### 第一层：工厂函数（`llm/factory.ts`）

```ts
function createLLMService(config: LLMConfig): BaseLLMService
```

- 接收 LLMConfig（provider、apiKey、baseUrl、model、temperature 等）
- 根据 provider 映射到具体服务类（"deepseek" → DeepSeekService，"mock" → MockLLMService）
- 自动解析 apiKey 和 baseUrl（环境变量或配置文件）

### 第二层：BaseLLMService 基类（`llm/base.ts`）

```ts
abstract class BaseLLMService {
  abstract _doStream(messages, tools?, options?): AssistantMessageEventStream;
  
  stream(context: Context): AssistantMessageEventStream;
  complete(context: Context): Promise<AssistantMessage>;
  streamSimple(context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
  completeSimple(context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
  
  convertMessages(context: Context): APIMessage[];
}
```

关键设计决策：

- **stream-first**：子类只实现 `_doStream`，非流式方法由基类通过消费流式结果聚合
- `convertMessages()` 在基类中提供 OpenAI 兼容默认实现，子类可重写
- `complete` / `completeSimple` 直接返回 `AssistantMessage`（计划 A 类型）

### 第三层：DeepSeekService（`llm/services/deepseek.ts`）

V0 唯一真实 provider。通过 OpenAI 兼容 SDK 接入 DeepSeek API。

子类职责：

- SDK 客户端初始化（基于 OpenAI SDK + DeepSeek baseUrl）
- 流式 SSE 解析，组装 AssistantMessageEvent 事件流
- 可选重写 `convertMessages()` 适配 DeepSeek 特有格式

## 响应格式

`complete()` 返回 `AssistantMessage`（计划 A 定义的内部类型），包含：

- `content: Content[]`：结构化数组（TextContent / ThinkingContent / ToolCallContent）
- `usage: Usage`：含 input/output/cacheRead/cacheWrite/totalTokens + cost
- `stopReason`：stop | toolUse | length | error | aborted
- `model` / `provider`：生成来源

执行引擎通过 `stopReason === 'toolUse'` 判断是"最终回复"还是"请求工具调用"。

`stream()` 返回 `AssistantMessageEventStream`（AsyncIterable），产出 text_delta / thinking_delta / tool_call_delta / done / error 事件。

## DeepSeek 策略

首版通过 OpenAI 兼容 SDK 接入。配置来源按优先级：

1. 显式传入配置
2. 环境变量（`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`）
3. 本地用户配置（后续做 UI）

安全要求：

- 不在日志和 session 事件中写入 API key
- Provider 错误对前端只暴露必要信息
- 网络错误、限流、认证失败、余额不足要可区分

## Mock Provider 要求

MockLLMService（`services/mock.ts`）必须能稳定产出完整 turn 所需的 AssistantMessage 序列：

1. 第一次调用：返回 ThinkingContent + ToolCallContent（stopReason: toolUse）
2. 工具结果回填后第二次调用：返回 ThinkingContent + TextContent（stopReason: stop）

这确保执行引擎可以在没有真实 API 的情况下完整跑通 tool-call loop。

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- MockLLMService 通过 `_doStream` 稳定产出 thinking、tool calls、final reply、usage
- `completeSimple()` 返回的 AssistantMessage 包含结构化 Content[] 数组
- `convertMessages()` 能正确转换 UserMessage/AssistantMessage/ToolResultMessage 为 OpenAI 格式
- DeepSeekService 在没有 API key 时返回结构化配置错误
- LLM Service 不依赖 renderer 或 Electron API
- Provider 原始响应不泄漏给前端契约

## 并行关系

- 依赖计划 A 的 Message/Content/Context/Usage/stopReason 类型
- 可与 Tool Runtime、Context Pipeline、Persistence 并行
- Execution Engine 通过 `streamSimple()` 消费本计划产物

## 进度

- [x] 审查现有 `packages/agent-core/src/llm.ts`
- [x] 创建 `llm/` 目录结构（types + base + factory + services/）
- [x] 定义 LLM 类型（LLMConfig、StreamOptions、SimpleStreamOptions、APIMessage、AssistantMessageEvent、AssistantMessageEventStream、LLMServiceError）
- [x] 实现 BaseLLMService 基类（_doStream + stream/complete/streamSimple/completeSimple + convertMessages + resolveSimpleOptions）
- [x] 实现 MockLLMService（第一次调用返回 toolUse，第二次返回 stop）
- [x] 实现 DeepSeekService 骨架（无 key 时返回结构化错误，有 key 时返回占位消息）
- [x] 实现工厂函数（createLLMService + createMockLLMConfig）
- [x] 迁移现有 llm.ts（保留旧 API 兼容，新增 re-export 新 API）
- [x] 增加配置解析（环境变量自动解析）和错误分类（LLMServiceError + LLMErrorKind）
- [x] 通过全仓库 typecheck + build
- [ ] 更新架构文档和 history

## 决策记录

- 2026-05-23：LLM 层采用 stream-first 设计，真实 DeepSeek 接入不阻塞 mock provider 与运行时结构稳定。
- 2026-05-23：按 Skill `llm-service.md` 采用 BaseLLMService 基类模式，子类只实现 `_doStream`。Provider Registry 留给 V1。
- 2026-05-23：V0 唯一真实 provider 为 DeepSeekService（而非 OpenAIService），突出产品与 DeepSeek 的绑定。底层仍兼容 OpenAI SDK，但类名和配置以 DeepSeek 为主。
- 2026-05-23：采用 `llm/services/` 子目录分离基类和具体实现（Skill 原始设计中未覆盖此点，已记录到 `docs/references/llm-agent-dev-skill-fixes/fix-llm-agent-dev-skill.md`）。
