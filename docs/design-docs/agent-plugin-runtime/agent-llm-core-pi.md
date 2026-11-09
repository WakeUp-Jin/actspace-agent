# LLM Core Pi 设计

## 1. 文档状态

- 本文保留契约、边界和未完成的外部验收项；M0–M4 均已实现。执行计划：[completed/20260922-llm-core-pi.md](../../exec-plans/completed/20260922-llm-core-pi.md)。
- 执行入口：[LLM Core Pi 执行计划](../../exec-plans/completed/20260922-llm-core-pi.md)。
- 与[现有 Adapter 设计](agent-target-llm-adapter.md)共享 ActSpace 领域边界；本文件记录本次 prepare、Host 和 pi-ai 收敛实现的契约与验收边界。
- 目标：收敛 ActSpace 的 LLM 调用链，让 pi-ai 成为默认 Provider wire implementation，同时保留 ActSpace 自己的运行时、会话、凭据、重试和可观测性边界。
- 适用范围：LLM service/pi-ai、Agent Loop、Desktop/CLI 的模型与连接适配边界、Runtime exports 和必要的 Session replay 契约。

## 2. 背景与问题

历史实现曾把 pi-ai 的实际调用拆成额外的 `PiAiEngine` 层；当前实现已将 direct stream 收回 `PiAiAdapter` 私有模块：

```text
AgentLoop
  -> LlmService
    -> PreparedLlmCall
      -> LlmAdapter
        -> PiAiAdapter
          -> PiAiAdapter
            -> pi-ai
```

历史间接层有测试替身、动态加载和 legacy fallback 等现实动机，但也带来三个问题：

1. `PiAiAdapter` 看起来像适配器，实际只负责选择 engine，Provider、Model 和 pi-ai stream 逻辑分散在更深层。
2. pi-ai 已经整理好的 Provider、协议和模型调用能力没有成为 Adapter 的直接实现基础。
3. direct、proxy、OpenRouter、DeepSeek 图片等路线在多处条件中切换 backend，调用链不够容易理解，也增加了 parity 风险。

本次重构不重新发明 Provider 协议，而是把 ActSpace 的生命周期和领域契约包在 pi-ai 外面，让 pi-ai 直接成为默认 wire backend。

## 3. 目标调用链

```text
AgentLoop
  -> ActSpace LlmService
    -> PreparedLlmCall
      -> PiAiAdapter
        -> pi-ai Provider / Model / stream
```

需要代理的请求由 `PiAiAdapter` 内部切到兼容 wire：

```text
PreparedLlmCall
  -> PiAiAdapter
    -> pi-ai Provider / Model / stream        （直连）
    -> LegacyProxyWireEngine -> legacy wire   （proxy）
```

legacy wire 是兼容性降级路径，只在 `PiAiAdapter` 内部切换，不向 Agent Loop 暴露第二套 adapter、消息、流或错误类型。

## 4. 责任边界

### 4.1 Agent Loop

Agent Loop 负责：

- 组装 prompt、历史消息和工具定义。
- 创建 request identity。
- 调用 `LlmService.prepare()`。
- 写入 request header/context snapshot。
- 消费统一的 `LlmStreamEvent`。
- 执行工具调用和下一步循环。
- 根据结构化 failure 执行 durable retry。

Agent Loop 不负责：

- 创建 pi-ai Provider。
- 判断 OpenAI、Anthropic 或其他协议的 wire 细节。
- 解析 Provider 原始事件。
- 读取或保存 API Key。

### 4.2 LlmService

`LlmService` 是 ActSpace 的运行时门面，负责：

- 管理 route registration。
- 捕获一次调用使用的 registration。
- 校验 route 和 model 的基本匹配关系。
- 合并 route defaults 与 request options。
- 解析 credentialRef 对应的短生命周期凭据。
- 生成 `PreparedLlmCall`。
- 维护 activation lease，保证 replacement/shutdown 不提前销毁正在使用的 Adapter 资源。

它不负责具体 Provider 的消息序列化。

### 4.3 PreparedLlmCall

`PreparedLlmCall` 是一个一次性、registration-bound 的调用句柄，不是 health check，也不是发送前的网络探测。

它的职责是把一次调用需要保持一致的事实固定下来：

- route identity。
- exact model。
- request defaults 和显式 options 合并结果。
- retry policy。
- Adapter registration/generation。
- 可安全记录的模型事实，例如 context window。
- activation lease。

`prepare()` 可以执行本地且确定性的校验，但不主动验证 API Key、代理、远端模型存在性或 Provider 可用性。真正的凭据解析和 Provider 请求发生在 `dispatch()`。

目标生命周期：

```text
prepare
  -> capture registration and acquire activation lease (before any await)
  -> resolve exact model facts
  -> validate/materialize call config
  -> freeze request facts
  -> persist request snapshot
  -> dispatch once
  -> settle stream
  -> release lease
```

取得 lease 后的所有路径必须受 try/finally 保护，包括异步模型解析失败、assembler.finalize 失败、snapshot/checkpoint 失败、提前 abort 和调用方放弃。成功 dispatch 后将 attempt lease 所有权交给 stream handle；其 success/error/abort/iterator.return 必须恰好释放一次。异步 prepare 期间发生 replacement，已经持有 lease 的准备可以完成；新的准备不得进入 draining registration。

### 4.4 LlmAdapter

`LlmAdapter` 是 ActSpace 的 Provider route contract。它只暴露 ActSpace 类型：

- `LlmMessage`
- `LlmStreamSource`
- `LlmUsage`
- `LlmFailure`
- `LlmRequestModelFacts`

公共声明不能暴露 pi-ai、OpenAI、Anthropic 或 `undici` 类型。

Adapter 需要支持：

- route registration。
- exact model facts resolution。
- 一次调用的 Adapter generation 绑定。
- request-scoped credential 和 abort signal。
- stream、dispose 和必要的 cancel。

## 5. PiAiAdapter 设计

### 5.1 直接使用 pi-ai

`PiAiAdapter` 应直接依赖 pi-ai 的公开 Provider、Model、protocol API 和 stream 能力。目标结构：

```text
PiAiAdapter
  -> create/reuse pi-ai Provider
  -> create/resolve pi-ai Model
  -> invoke pi-ai stream or streamSimple
  -> map pi-ai events to ActSpace events
```

Adapter 内部可以使用小型私有函数或文件分隔消息转换、模型构造和错误归一，但不再以 `PiAiEngine` 作为必须经过的运行时抽象。

### 5.2 Provider construction

Provider 构造遵循以下规则：

1. 连接的 Base URL 与 pi-ai 某个内置服务商的模型地址完全一致时，复用该内置服务商的 stream 实现；规则见 §17。
2. 其余连接（自定义中转、智谱通用 API、MiniMax OpenAI 接口、火山方舟等）通过 pi-ai 的公开 `createProvider` 和对应的公开 protocol factory 构造 Provider。
3. Provider 的 models 集合由当前 route 的 resolved model facts 组成。
4. credential 只在请求 dispatch 边界交给 pi-ai 的 auth resolver，不写入持久化对象或共享 DTO。
5. Desktop 启动时不初始化未使用的 Provider SDK，按 route 或 protocol 延迟加载。

### 5.3 Model construction

每次 exact model resolution 返回与 dispatch 一致的模型身份和事实：

- provider。
- model id。
- protocol。
- base URL。
- input modalities。
- context window。
- max output tokens。
- reasoning capabilities。
- pricing snapshot reference。

模型目录是事实来源之一，但不是请求白名单。目录未列出的模型，只要 route 和 pi-ai protocol 能处理，仍可以由 Adapter 接受；是否进入 UI 或 Agent 候选由 ActSpace model resolver 决定。

### 5.4 Stream mapping

pi-ai 的事件在 Adapter 内转换为：

- `text-delta`
- `reasoning-delta`
- `tool-call-delta`
- `done`
- `error`
- `aborted`

工具调用参数按 call identity 组装；交错的多个 tool call 不能按全局字符串拼接。终端事件缺失时生成 `malformed-stream` failure。

### 5.5 Request options

Adapter 在 Provider I/O 之前完成模型级配置校验和默认值物化：

- 不支持的 reasoning effort 直接返回结构化 `unsupported-capability` 或 `invalid-request`。
- 模型声明的默认 max tokens 只在调用方未指定时填充。
- `reasoning: false`、自动模式和显式 effort 保持不同语义。
- SDK 内部 retry 关闭，避免一次 ActSpace dispatch 对应多个不可见 wire attempt。
- request-scoped `AbortSignal` 始终传到 pi-ai。
- Anthropic 缓存在 prepare 阶段归一为 `cacheRetention: "short" | "long" | "none"`，连接级关闭优先于请求模式；direct 与 request-scoped proxy 消费同一时长语义。完整模式与断点规则见第 16 节，不在 Provider 拒绝字段后自动重发生成请求。

## 6. PreparedLlmCall 与 Adapter generation

动态模型设置和 Provider replacement 要求模型事实解析与最终 dispatch 使用同一份 Adapter generation。

目标接口可以表达：

```ts
interface PreparedAdapterCall {
  readonly model: LlmResolvedModelInfo;
  stream(input: LlmAdapterDispatchInput): Promise<LlmStreamSource>;
}
```

`LlmService.prepare()` 捕获 registration 后，调用 Adapter 的 prepare hook，得到：

- detached exact model facts。
- 已校验的 request config。
- 同一个 generation 的 stream entry point。

这样 Provider replacement 发生在 prepare 之后时：

- 旧 PreparedCall 继续使用旧 generation。
- 新逻辑请求的 PreparedCall 使用新 generation；已有 retry scope 派生的 attempt 按 §13 保持旧 generation。
- 旧 generation 进入 draining，等待 lease 归零后 dispose。

这比单纯保存一个旧 `dispatch` 函数更可靠，因为函数依赖的 Provider client、Fiber、proxy pool 和 SDK 资源也被同一个 generation 管理。

## 7. Legacy transport 边界

Legacy transport 只在明确理由成立时使用：

- 官方 OpenRouter 的 Chat Completions / Responses 需要读取原始账单 `usage.cost`（pi-ai 1.5.0 只在 Completions 且 `is_byok` 时读取）。
- 某个 route 的图片上传或 Provider-specific wire 能力尚未达到 parity（当前为 DeepSeek Files 上传）。

> 2026-11-08 改：pi-ai 1.5.0 每次请求可传 `fetch`，代理不再是 legacy 理由，见 §17.4。
- 结构化错误、abort 或 stream 语义未通过该 route 的采用门禁。

Legacy backend 必须：

- 继续实现同一个 `LlmAdapter` contract。
- 复用 ActSpace Message、Stream、Usage、Failure 类型。
- 关闭自身 SDK retry。
- 遵守 credential、redaction、abort 和 lease 生命周期。
- 通过 direct/proxy 并发 canary 证明 transport 不串流。

不允许：

- 在 Agent Loop 中分支判断 backend。
- 把 legacy 类型暴露到 shared、Session 或 IPC。
- 设置全局 dispatcher。
- 依赖 pi-ai 私有路径、monkey patch 或修改 pi-ai 源码。

## 8. 错误、Usage 与 Replay

### 错误

Adapter 优先使用 pi-ai 的结构化错误、HTTP response 和原始 cause，归一成 ActSpace `LlmFailure`。至少覆盖：

- authentication。
- permission。
- quota。
- rate-limit 与 retry-after。
- provider 5xx。
- proxy、DNS、network、timeout。
- abort。
- context overflow。
- invalid request。
- malformed stream。
- unsupported capability。

字符串匹配只能作为最后兜底，不能成为主要 Provider 识别机制。

### Usage

保留：

- input tokens。
- output tokens。
- cache read/write tokens。
- reasoning tokens。
- provider-reported cost。
- estimated cost 及其 pricing snapshot。

当前目录价格变化不能重算历史 usage。每个 request/result 应携带足够的 provider-qualified model 和价格快照事实。

### Replay state

Provider-specific reasoning signature 或 replay state 只能作为 Adapter-private、版本化、可选字段保存。跨 Provider 回放时：

- replay 兼容性使用持久的 adapter family、schema version、provider、protocol 和 exact model 身份判断，不以进程内 generation ID 作为持久兼容依据。
- 迁移到不同 Provider 或不同 Adapter 时应移除不兼容的 opaque state。
- 普通消息和工具调用不能依赖某个 Provider 的私有字段才能重建。

## 9. 测试策略

### Contract tests

- `PreparedLlmCall` 只能 dispatch 一次。
- route replacement 后旧调用仍使用旧 registration。
- lease 在未 dispatch、dispatch 失败、stream success/error/abort 后恰好释放。
- registration drain 不提前 dispose Provider client。
- credential 只在 dispatch 时解析。
- request snapshot 不含 secret。

### PiAiAdapter tests

- OpenAI Completions。
- OpenAI Responses。
- Anthropic Messages。
- text、reasoning/signature、交错 tool args、tool result。
- image input 和 artifact reader。
- usage、cost、estimated/provided provenance。
- abort、stream truncation、HTTP error、rate limit。
- reasoning effort 和 max tokens 校验。

### Backend parity tests

同一 fixture 分别运行 pi-ai backend 和必要的 legacy backend，比较 ActSpace 层输出：

- Message content。
- tool call identity and arguments。
- stop reason。
- Usage shape。
- Failure kind。
- abort behavior。

不要求两个 backend 的 Provider 原始响应完全相同，只要求 ActSpace 公共语义一致。

### Real-provider gates

自动化测试通过不代表真实 Provider 已验收。真实门禁需覆盖直连、代理、工具调用、reasoning replay、usage、错误、打包后的 Electron 运行时和并发 transport isolation。

## 10. 迁移原则

1. 先扩展 Adapter prepare contract，再迁移 pi-ai 调用实现。
2. 先让 direct route 由 PiAiAdapter 直接调用 pi-ai，再处理 proxy 和特殊图片路线。
3. 每迁移一条 route，保留同一 ActSpace contract 的 parity fixture。
4. 所有消费者迁移后删除 `PiAiEngine` 间接层；当前 Runtime/plugin 与生产 Host 已完成迁移。
5. 若 pi-ai 某项能力在公开 API 下无法通过门禁，在 `PiAiAdapter` 内走 `LegacyProxyWireEngine`，不为了缩短代码破坏代理、错误或生命周期语义；不再单独保留一个没有调用方的 `LegacyTransportAdapter` 类。

## 11. 成功标准

- Agent Loop 只依赖 ActSpace LLM contract。
- `PiAiAdapter` 直接使用 pi-ai Provider/Model/stream API。
- `PreparedLlmCall` 同时固定模型事实、调用配置和 Adapter generation。
- pi-ai 是默认 direct backend，legacy 只在明确 route 门禁失败时使用。
- 不存在 Agent Loop 级别的 backend 分支。
- Stream、Usage、Failure、Credential、Retry、Replay 和 lease 行为有自动化证据。
- 文档、测试和真实 Provider 验收边界与实现状态一致。

## 12. Host 准备、连接与凭据

Desktop 和 CLI 都通过同一 Adapter prepare contract 绑定模型。Desktop 的主模型、utility 和 image inspection 各自按 purpose 解析一次；绑定后不允许在 dispatch 再读当前默认模型或重新运行 purpose fallback。reasoning effort 引起的实际 model ID 映射、capability、max tokens、pricing snapshot 和 backend 都在准备阶段物化。

`LlmResolvedModelInfo` 是无秘密的 detached facts，包括 model key、实际 API model、provider、protocol、context window、max output、modalities、reasoning capabilities、pricing snapshot reference。未知模型可以接受显式 route facts；未知容量保持 null，不伪造固定 context window。

连接绑定采用 connectionId、配置 revision 和 credentialRef。prepare 固定 protocol、endpoint、transport policy 和计费配置；Host 可以私有持有必要的连接配置，但 request snapshot 仅记录脱敏身份和事实，不序列化含认证信息的 URL、headers 或 proxy 配置。pricing multiplier 若影响成本，必须进入本次 pricing snapshot。

dispatch 通过绑定的 credentialRef 获取同一连接的秘密材料。允许同一连接 API Key 轮换；连接被撤销或已无法解析时结构化失败，禁止静默切到当前默认连接。连接配置 revision 改变只影响新准备的调用。resolver 不得利用新 base URL、proxy 或倍率覆盖已准备的配置。Desktop 不再通过 dispatch 内重新解析 providerRuntime 来覆盖传入凭据。

Provider 缓存不得闭包捕获某一次调用的 API Key。可复用的 Provider 使用 request-scoped auth resolver；缺少该能力时不复用含凭据的实例。并发请求必须证明 key、endpoint 和 proxy 不串用。

### 默认重试与连接失败说明

- 默认 retry policy 为 3 次尝试（退避 1 秒、2 秒），只对 `timeout`、`network` 两类失败生效；`rate-limit`、`provider` 等仍需路由自己声明 `shouldRetry`。Agent Loop 看到任何可见输出后不再重试，所以重试只会替换一次什么都没产出的请求。每次重试写 `llm/retry` / `llm/retry-started`。
- 两个 wire engine 用同一个 `transport-failure.ts` 识别 timeout / timed out / time-out 以及 `UND_ERR_CONNECT_TIMEOUT`、`ECONNREFUSED` 等 `cause` 里的 Node 错误码，并在 failure message 里写出目标主机，例如「请求 cn.aiapi.bot 超时，请检查网络或中转站。原始错误：Request timed out.」，同时记录 `causeCode`。pi-ai 的终态 error 事件只带 `errorMessage`，拿不到 `cause`，此时主机取自 baseUrl。

## 13. 重试 generation 所有权

选择保持旧 generation：一个逻辑请求的 durable retry 链创建 `LlmRetryScope`，先取得 registration owner lease，覆盖首次准备、所有 attempt 和 backoff。每个 attempt 仍是独立 requestId、独立一次性 PreparedCall 和独立 snapshot。

scope 只能从自己已经持有的 generation 派生 attempt。replacement 使 registration draining，阻止新的 scope，但不撤销已有 scope 的重试资格；不再让 Agent Loop 把旧 registration 传给通用 prepareCaptured 重新 acquire。scope 的派生权限不能被其他调用者用于进入 draining registration。

重试可以重新组装消息，但继承同一 exact model、连接、backend、defaults 和 pricing。每次 attempt 对新的消息执行校验，不能复用已消费的 PreparedAdapterCall。非重试的新逻辑请求重新选择当前 generation。

owner lease 在成功、不可重试失败、重试耗尽、backoff abort、snapshot/checkpoint 异常和 hook 短路后由外层 finally 释放。shutdown 撤销 scope 的后续派生资格并取消 active I/O 与 backoff，等待 settle 后释放资源；保留现有 30 秒 drain 上限，超时报告失败，不伪装安全 dispose。

关键回归序列：429 → 释放 attempt lease 但保留 scope lease → backoff → replacement → 原 scope 在旧 generation 重试 → 结束后旧资源恰好 dispose 一次。并行的新 scope 必须使用新 generation。

## 14. Backend 采用矩阵

下表是迁移起点和门禁，不代表 pi-ai 路线已验收。backend 在 Provider I/O 前选择并绑定到本次准备；不得在发送失败或已有 delta 后自动换 backend 重发。失败后的再次发送只允许经 ActSpace durable retry 记录。

| Route / 特性 | 当前兼容路径 | 采用 pi-ai 的必要证据 |
|---|---|---|
| 普通 Completions / Responses / Anthropic（含显式代理） | pi-ai wire；代理经 pi-ai 的请求级 `fetch`（2026-11-08 起） | public exports、协议 fixture、错误元数据、一次 dispatch 单次 wire；代理需 direct/proxy 并发 canary |
| OpenRouter 直连 Completions / Responses | legacy，保留原始账单 cost | provider-reported cost 与 estimated cost 来源不混淆，billing fixture parity |
| DeepSeek 图片且配置文件上传器 | legacy 文件上传 | image/artifact/file replay、上传取消及生命周期 parity |
| 自定义连接及显式协议覆盖 | 按上述特性选择 | endpoint owner、protocol、credential 身份与 capability 一致 |

任何一路的错误、usage 或 packaged gate 不通过都保留该路 legacy。diagnostics 记录脱敏 backend、选择原因及 generation，不记录秘密。LegacyTransportAdapter 已转发底层可选 cancel/dispose；底层 transport 仍须拥有或明确借用 proxy pool/file uploader，不能把接口转发等同于所有外部资源已验证释放。

文件上传与聊天生成分别计数；“一次 wire attempt”指生成请求不得被 SDK 隐式重试，不把合法的附件准备请求误算成第二次生成。

## 15. Replay 持久化与恢复

新增可选的 ActSpace-owned replay envelope：schemaVersion、adapterFamily、providerId、protocol、modelId、opaque payload。payload 只容纳重放所需的 signature/state，保持 JSON-safe、版本化，不放 credential、完整原始 response 或运行期 client 对象。

状态附着在需要重放的 assistant content/message，并随现有 assistant/message 持久化；LLM message conversion、Session codec 和恢复路径都要保留这一可选字段，SDK 类型不进入公共契约。写入前执行 secret redaction。旧记录没有 envelope 时仍能读取，普通文本和 tool call 原样恢复；没有可验证来源的旧 signature 不直接发给另一 provider。

初版采用保守兼容规则：上述身份与支持的 schema version 全部一致才保留 opaque state；跨 provider/protocol/model 或未知版本剥离 opaque 部分，保留普通内容。应用重启和同配置 generation replacement 不因此丢失兼容 signature。若某协议不接受剥离后的 reasoning block，由该协议转换器省略该 reasoning block，不能破坏文本或工具调用关系。

验证包含同模型重启恢复、旧 signature-only 记录、跨 provider/model 切换、未知 schema、工具调用回放和无秘密序列化。真实 Provider 是否接受恢复的 signature 单独验收。


## 16. 按模式选择 Claude 提示缓存

Agent Loop 在每次准备请求时设置 `LlmRequestOptions.cacheRetention`：Chat 使用 `long`（1 小时），Plan、Agent 等其他模式使用 `short`（5 分钟）。模式切换从下一次请求生效；同一次请求的重试复用已准备的选项。缺少模式策略的辅助请求默认短缓存。

Desktop 在 prepare 阶段应用连接级关闭开关，`promptCacheMode: off` 优先于模式策略，并把实际选择写回 prepared options。持久设置的 `short` 保留兼容性，表示启用缓存，实际时长由请求模式决定。

- Anthropic Messages 直连：把 `short / long / none` 传给 pi-ai；SDK 将 long 转成 `cache_control.ttl: 1h`，short 使用默认 5 分钟。
- Anthropic Messages 代理：稳定前缀断点显式携带同一时长的 `cache_control`。
- OpenRouter 官方 endpoint 的 `anthropic/*` Chat Completions：兼容 backend 在请求顶层发送 `cache_control: { type: ephemeral, ttl: 1h | 5m }`，让服务端自动推进多轮缓存边界；关闭时省略。继续保留 provider-reported cost。
- 其他模型不注入 Claude 缓存参数。本轮不改变 Responses backend 或切换 SDK。

请求参数正确不代表每次都能命中；缓存最小长度、前缀一致性、有效期和上游路由仍由服务商决定。官方依据：[OpenRouter prompt caching](https://openrouter.ai/docs/guides/best-practices/prompt-caching)。本地回归覆盖模式策略、关闭优先、直接/代理请求体、真实 pi-ai 序列化，以及账单和 usage 不回退；真实服务商命中另行验收。

## 17. pi-ai 1.5.0 与复用内置服务商（2026-11-08）

> 执行计划：[20261108-pi-ai-builtin-providers](../../exec-plans/active/20261108-pi-ai-builtin-providers.md)。起因是外部 PR #34（OpenCode Go）：同一个服务商下不同模型走不同协议、还要带会话请求头，这些 pi-ai 内置服务商已经做好，我们自己拼 Provider 做不到。

### 17.1 依赖

- `@earendil-works/pi-ai` 0.82.1 → 1.5.0；`openai` 6.26.0 → 7.19.0、`@anthropic-ai/sdk` 0.91.1 → 0.129.0，与 pi-ai 自带版本一致，兼容 backend 和 pi-ai 用同一份 SDK。openai 7 唯一的破坏性改动是要求 Node 22；Electron 39.8.10 自带 Node 22.22.1，满足 pi-ai 的 `>=22.19`。
- 用量补丁按原规则移植为 `patches/@earendil-works__pi-ai@1.5.0.patch`：1.5.0 仍会把缺失的 usage 填成 0，补丁照旧在三种协议的原始 usage 边界附带 `actspaceWireUsage`（见[目录与费用设计](../model-context/agent-model-catalog-and-usage-cost.md)）。

### 17.2 什么时候复用内置服务商

只按连接的 Base URL 判断：规范化后的 Base URL（去掉末尾 `/`）与 pi-ai 某个内置服务商的某个模型地址**完全相同**，并且这个地址只属于一个内置服务商，就复用它。其余一律走 §5.2 第 2 条的自建 Provider。

- 判断不看我们的服务商 id 或模板 id，所以官方模板和自定义中转一视同仁：自定义中转填了 `https://api.deepseek.com`，也复用 pi-ai 的 deepseek。
- 地址表是 `packages/llm/llm-pi-ai/src/builtin-providers.ts` 里的静态表（Base URL → 内置服务商 id），只收我们支持的三种协议、且地址里没有占位符的条目。测试从 `builtinProviders()` 现算一遍并与静态表比对，升级 pi-ai 时表不一致就失败。属于多个内置服务商的地址（目前只有阿里 token-plan 国际站）不收。
- 当前模板的结果：DeepSeek、Anthropic、OpenAI、OpenRouter、Kimi（`.cn` / `.ai`）、小米 MiMo 复用；智谱（我们用通用 API `api/paas/v4`，pi-ai 的 zai 是 Coding Plan 地址）、MiniMax（我们用 OpenAI 接口 `/v1`，pi-ai 的 minimax 是 `/anthropic`）、火山方舟、其他自定义中转不复用，行为不变。
- 只加载用到的那一个服务商模块（`@earendil-works/pi-ai/providers/<id>`，实测约 33 ms、2 MB），不导入 `providers/all`（约 58 ms、11 MB）。

### 17.3 模型从哪里来

复用时，pi-ai 的 `Models` 里注册一个包装 Provider（DSH `reuseCatalogProvider` 同款）：id 与名称用内置服务商的，`auth.apiKey` 用 ActSpace 的请求级凭据解析器，`getModels()` 只返回本次请求的一个模型，`stream` / `streamSimple` 转给内置服务商实例，不复制。内置服务商自己的会话请求头（OpenCode `x-opencode-session`）、按模型分协议、兼容开关因此全部保留。

| 情况 | 协议与地址 | 思考参数、兼容开关 | 上下文、最大输出、输入类型 |
|---|---|---|---|
| pi-ai 认识这个模型 id | 取 pi-ai 模型的 `api` 和 `baseUrl`（同一服务商下不同模型可以不同） | 取 pi-ai 模型的 `reasoning`、`thinkingLevelMap`、`compat`、`headers` | 取我们的设置（含用户修改）；我们没有时用 pi-ai 的 |
| pi-ai 不认识（新模型、中转自定义名） | 取连接的协议和 Base URL | 不带 `compat`，请求格式由 pi-ai 按服务商 id 与地址自动识别（如 `max_tokens`）；思考参数仍按 ActSpace 规则（见 §17.4） | 取我们的设置 |

- 价格不变：仍由 ActSpace 的价格快照计算，pi-ai 模型里的 `cost` 不用。
- 去掉 pi-ai 模型里的 `allowedFallbackModels`（如 `claude-fable-5` 配了服务端改用 opus）：请求只用用户选的模型，价格快照和回放身份才对得上。
- 实际协议以最终模型的 `api` 为准：图片消息准备、usage 的缓存口径、回放身份都用它，不用连接上配置的协议。
- 兼容 backend 的选择（§14）仍按连接协议在 Provider I/O 前决定；官方 OpenRouter 的 Completions / Responses 连接照旧进兼容 backend，不会因为 pi-ai 把 `anthropic/*` 标成 Anthropic 协议而改道。

### 17.4 思考参数

- pi-ai 认识的内置模型，思考参数完全交给 pi-ai：ActSpace 只传标准档位（`reasoning: "low" | … | "max"`，关闭时不传），pi-ai 按模型的 `thinkingFormat` 和 `thinkingLevelMap` 生成请求字段，并把模型不支持的档位就近取整。用户没选（自动）时去掉 pi-ai 推断出的思考字段，交给服务商默认。`onPayload` 不再改写思考字段，只保留 DeepSeek 图片请求体校验。
- 其余情况（不复用的连接，以及复用地址但 pi-ai 不认识的模型 id）保留 `reasoning-options.ts` 的现有改写，行为不变。pi-ai 对不认识的 id 没有档位表，按地址识别的格式也不全（例如 Kimi 会被识别成不发任何思考字段），交给它会丢掉思考开关。兼容 backend 也继续用它。

### 17.5 代理

pi-ai 1.5.0 的三个协议实现都把请求级 `fetch` 传给 SDK client。代理连接改为：从 `ProviderProxyPool` 取该代理地址的 `fetch`，作为 `fetch` 选项传给 pi-ai；不改全局 dispatcher。代理本身不再是进入兼容 backend 的理由；仍进兼容 backend 的只有官方 OpenRouter 的 Completions / Responses（账单金额）和配置了文件上传的 DeepSeek 图片请求，这两条照旧在兼容 backend 里走代理。代理连接失败仍归类为 `proxy`。

### 17.6 回放身份

- 持久化的回放信封（§15）仍用 ActSpace 稳定的服务商 id（`deepseek`、`kimi`、`anthropic`、`custom` 等，即原来的 wire provider），旧会话的思考签名继续匹配。
- 交给 pi-ai 的历史 assistant 消息用最终模型的 pi-ai 服务商 id、`api` 和模型 id。pi-ai 只在三者都与本次请求相同时保留思考块；用我们的 id 会让它把同模型的思考也丢掉。
- 各 Host 的 `adapterVersion` 升一版（`actspace.desktop-pi-ai.v3`、`actspace.cli-pi-ai.v3`，`PiAiAdapter` 默认值 `pi-ai-1.5.0`），请求快照能区分升级前后。

### 17.7 新增服务商的做法

pi-ai 内置了的服务商（如 OpenCode Go）：在 `PROVIDER_TEMPLATES` 加模板，默认 Base URL 填 pi-ai 的地址，加图标和目录服务商 id。请求层不用改，地址命中就复用内置实现。pi-ai 没有内置的服务商按自定义连接处理。

### 17.8 验证

- 自动化：地址表与 pi-ai 一致；复用 / 不复用的选择；认识与不认识的模型各取哪些字段；多协议服务商按模型分协议并带会话头；思考参数由 pi-ai 生成（DeepSeek、Kimi、Anthropic、OpenAI Responses 各一例）；代理 `fetch` 被使用且直连请求不受影响；回放签名在同模型下保留；用量补丁的全部既有测试；兼容 backend 在新版 SDK 下的既有测试。
- 真实服务商与打包后的 Electron 运行时由用户验收，不以自动化代替。
