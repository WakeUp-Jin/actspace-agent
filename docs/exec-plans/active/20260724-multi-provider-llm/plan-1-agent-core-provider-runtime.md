# Plan 1：Agent Core provider runtime、代理 transport 与 OpenRouter 接入

状态：已完成（2026-07-24）

依赖：Plan 0

产物消费方：Plan 2-6

## 目标

让 agent-core 可以用显式 `ProviderRuntimeConfig + ModelDefinition` 构造 LLM Service，支持 DeepSeek、Kimi、OpenRouter 和服务商级 HTTP(S) 代理；同时保持消息转换、tool call 对账和 usage 归一仍按 API protocol 复用，不增加一套 OpenRouter service。

## 附加必读

- `docs/design-docs/agent-runtime/agent-backend-design.md`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
- `packages/agent-core/src/llm/types.ts`
- `packages/agent-core/src/llm/factory.ts`
- `packages/agent-core/src/llm/services/openai-completions.ts`
- `packages/agent-core/src/llm/services/anthropic-messages.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`

## 允许修改的文件

- `packages/agent-core/package.json`
- workspace lockfile（仅新增直接依赖产生的机械变化）
- `packages/agent-core/src/llm/types.ts`
- `packages/agent-core/src/llm/factory.ts`
- `packages/agent-core/src/llm/provider-adapter.ts`（新增）
- `packages/agent-core/src/llm/provider-transport.ts`（新增）
- `packages/agent-core/src/llm/services/openai-completions.ts`
- `packages/agent-core/src/llm/services/anthropic-messages.ts`
- `packages/agent-core/src/llm/index.ts`
- `packages/agent-core/src/llm/test/provider-adapter.test.ts`（新增）
- `packages/agent-core/src/llm/test/provider-transport.test.ts`（新增）
- `packages/agent-core/src/llm/test/factory.test.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/test/create-agent-deps.test.ts`
- 对应设计文档和 history

不得修改 desktop 持久化或 renderer。

## 锁定的运行时契约

```ts
interface ProviderRuntimeConfig {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  transport?: { proxyUrl?: string };
}

interface RuntimeInferenceSettings {
  temperature?: number;
  maxTokens?: number;
}
```

新增纯函数：

```ts
buildLLMConfigFromRuntime(model, providerRuntime, inferenceSettings): LLMConfig
```

旧 `buildLLMConfig(spec, envConfig)` 在 Plan 4 完成前保留为 CLI/兼容入口，内部转调新函数，不再继续扩张 provider Map。

## 任务清单

### 1.1 Provider request adapter

在单一 `provider-adapter.ts` 中定义小型函数表，不创建深继承层级：

- provider display name。
- 默认非敏感 headers。
- OpenAI-compatible request 参数修饰。
- 错误分类补充。

具体行为：

- Kimi 只有 `thinkingEnabled === true` 时添加 `thinking: {type:"enabled"}`。
- OpenRouter 添加 `X-OpenRouter-Title: Actspace`；没有稳定公开 URL 时不发送 `HTTP-Referer`。
- DeepSeek OpenAI-compatible adapter 映射 `thinking.type` 与 `reasoning_effort`；历史 Anthropic DSML guard 保持不变。
- provider adapter 不持有消息历史，不做 tool call 转换。

### 1.2 Provider-scoped fetch 与连接池

- 添加 `undici` 为 agent-core 直接依赖。
- `createProviderFetch(proxyUrl?)` 返回 fetch-compatible 函数：无代理使用默认 fetch，有代理使用 `ProxyAgent`。
- 代理 URL 标准化后按 URL 缓存 dispatcher；不按模型或 turn 重建。
- 只接受 `http:` / `https:`，拒绝 username/password。
- 新增 `closeProviderTransports()`，main 退出和测试 teardown 调用。
- 代理错误映射为 `LLMErrorKind: "proxy"`，不在消息中包含完整 URL。

### 1.3 SDK 注入

- OpenAI SDK 通过自定义 fetch 使用 provider transport，并接收 `defaultHeaders`。
- Anthropic SDK 通过同一 fetch 边界支持 DeepSeek 代理。
- `LLMConfig` 增加 `transport` 和 `defaultHeaders`，provider 继续使用强类型 `ProviderId`。
- direct 与 proxied client 的构造测试不能发真实网络。

### 1.4 OpenRouter 协议路径

- OpenRouter 的 `ModelDefinition.api` 固定走 `openai-completions`。
- `createLLMService()` 仍只按 `api` 选择协议 service。
- OpenRouter 不新增 provider-native tool、自动路由或 fallback 参数。
- 响应中的 provider/model/usage 使用 OpenRouter ModelKey 与 apiModel，不伪装成上游原厂 provider。

### 1.5 显式 runtime builder

- `create-agent-deps.ts` 增加 `buildLLMConfigFromRuntime` 消费入口。
- env builder 只负责把 CLI/CI env 翻译成 `ProviderRuntimeConfig`。
- 对缺 key、非法 base URL、provider/model 不匹配给出结构化错误，不回落其他 provider。

## 测试要求

- OpenRouter 与 DeepSeek 选择 OpenAICompletionsService；历史 Anthropic route 的转换测试继续保留。
- Kimi thinking 分支不影响 OpenRouter。
- OpenRouter headers 存在且不包含 secret。
- 代理只注入目标 config；direct config 不获得 dispatcher。
- 同一代理 URL 复用连接池，不同 URL 隔离；close 后不再复用旧实例。
- 代理认证 URL、非 HTTP(S) scheme 和非法 URL 被拒绝。
- SDK/fake fetch 断言请求经过正确 transport，不访问真实网络。
- 现有 DeepSeek/Kimi service、DSML guard、tool call 和 usage 测试继续通过。

## 验证命令

```bash
pnpm install --lockfile-only
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/desktop typecheck
```

只有实现阶段确实新增 `undici` 依赖时运行 lockfile 更新；不得顺手升级其他依赖。

## 完成标准

- agent-core 可以仅凭显式 runtime config 创建三家 provider 的 LLM service。
- OpenRouter 没有复制 OpenAI 消息转换或流式处理实现。
- DeepSeek/Kimi 默认直连，任一 provider 可单独启用代理。
- desktop 后续可以复用同一 provider fetch 做连接测试和 catalog 请求。
- 旧 env 入口仍可供 CLI/CI 使用，但不再是新增 provider 的唯一装配方式。

## 决策记录

- 2026-07-24：使用小型函数式 provider adapter，不为三家 provider 建立 class 层级。
- 2026-07-24：代理通过 fetch 注入同时覆盖 OpenAI/Anthropic SDK 和 main catalog 请求。
- 2026-07-24：ProxyAgent 在 agent-core 统一管理，避免 desktop 与 agent-core 各自创建连接池。
- 2026-07-24：迁移期完整供应商联合从 shared 以 `LlmProviderId` 导出，避免提前放宽旧 desktop 的 `ProviderId`；Plan 2 切换 settings v2 时再收敛别名。
- 2026-07-24：Undici 8 的 fetch 类型与 Node DOM fetch 声明只在 `provider-transport.ts` 做一次显式桥接，其他模块统一消费 `ProviderFetch`。

## 完成记录

- 已新增显式 `ProviderRuntimeConfig`、`RuntimeInferenceSettings` 和 `buildLLMConfigFromRuntime()`；模型/provider/API/base URL/key 不匹配时返回结构化错误，不跨供应商回落。
- 已新增函数式 provider adapter：Kimi thinking 仅显式开启时发送，OpenRouter 默认只添加非敏感 `X-OpenRouter-Title`。
- 已新增 Undici `ProxyAgent` transport：按标准化代理 URL 复用连接池，拒绝非 HTTP(S) 与认证 URL，支持统一关闭并将失败脱敏映射为 `errorKind: "proxy"`。
- OpenAI 与 Anthropic SDK 均通过相同 fetch 注入边界支持供应商级代理；OpenRouter 继续复用 `OpenAICompletionsService`，没有复制协议实现。
- 旧 env builder 已内部转调显式 runtime builder，CLI/CI 兼容入口保持可用。
- 验证通过：agent-core 100 个测试文件、827 个测试；shared、agent-core、desktop typecheck 全绿。

`closeProviderTransports()` 已作为公共 runtime 生命周期 API 导出；Electron main 的退出调用在 Plan 2 装配 settings/provider service 时接入。
