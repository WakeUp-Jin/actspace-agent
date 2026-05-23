# actspace 后端计划 B：LLM Service 与 DeepSeek Provider

## 目标

建立 stream-first 的 LLM Service 层，让 Execution Engine 不直接依赖任何具体模型供应商。首版优先支持 DeepSeek，同时保留稳定 mock provider 用于本地开发和测试。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`
- `.agents/skills/llm-agent-dev/examples/llm-service.ts`
- `.agents/skills/llm-agent-dev/examples/llm-factory.ts`

## 相关路径

- `packages/agent-core/src/llm.ts`
- `packages/agent-core/src/types.ts`
- `packages/agent-core/src/llm/`
- `packages/shared/src/session.ts`
- `packages/desktop/src/main/index.ts`

## 范围

包含：

- 设计 `ModelProvider`、`ModelProviderInput`、`ModelProviderEvent`、`ModelProviderOutput`。
- 建立 provider registry。
- 建立 `BaseLLMService` 或等价 service 抽象。
- 保留 `deepseek-mock` provider，并让它稳定产出完整 turn 所需事件。
- 增加 DeepSeek provider 骨架。
- 定义 API key、base URL、model、temperature 等配置来源。
- 增加 provider 错误分类。
- 统一 usage 统计结构。

不包含：

- 不实现复杂多模型路由。
- 不做压缩模型 tier。
- 不做完整模型设置 UI。
- 不把密钥写入仓库。

## 接口方向

```ts
type ModelProvider = {
  id: string;
  label: string;
  stream(input: ModelProviderInput): AsyncIterable<ModelProviderEvent>;
  complete(input: ModelProviderInput): Promise<ModelProviderOutput>;
};
```

`stream` 是主接口，`complete` 可以由流式结果聚合得到。

Provider event 至少支持：

- text delta
- thinking delta
- tool call delta 或 completed tool call
- done
- error

## DeepSeek 策略

首版优先兼容 OpenAI 风格 API。

配置来源按优先级：

- 显式传入配置。
- 环境变量，例如 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`。
- 本地用户配置，后续再做 UI。

安全要求：

- 不在日志和 session 事件中写入 API key。
- provider 错误对前端只暴露必要信息。
- 网络错误、限流、认证失败、余额不足、结构异常要可区分。

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- mock provider 能稳定产出 thinking、tool calls、final reply、usage。
- DeepSeek provider 在没有 API key 时返回结构化配置错误。
- provider registry 能列出可用 provider。
- LLM Service 不依赖 renderer 或 Electron API。
- provider 原始响应不会泄漏给前端契约。

## 并行关系

- 依赖计划 A 的模型输入输出契约草案。
- 可与 Tool Runtime、Context Pipeline、Persistence 并行。
- Execution Engine 可以先用 mock provider adapter 开发，后续接入本计划产物。

## 进度

- [ ] 审查现有 `packages/agent-core/src/llm.ts`。
- [ ] 定义 provider event 和 provider output。
- [ ] 建立 provider registry。
- [ ] 重写 mock provider。
- [ ] 建立 DeepSeek provider 骨架。
- [ ] 增加配置和错误分类。
- [ ] 通过类型检查。
- [ ] 更新架构文档和 history。

## 决策记录

- 2026-05-23：LLM 层采用 stream-first 设计，真实 DeepSeek 接入不阻塞 mock provider 与运行时结构稳定。
