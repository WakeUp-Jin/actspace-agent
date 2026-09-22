# ActSpace v2 LLM Adapter 目标设计

> 状态：pi-ai adapter、路由/代理和结构化错误契约已实施并有自动化记录；真实 Provider 与 packaged lifecycle 仍需对应执行摘要中的外部验收，不因本次文档校准宣称通过。

> 收敛实现见 [LLM Core Pi](agent-llm-core-pi.md)与[执行计划](../../exec-plans/completed/20260922-llm-core-pi.md)。本文保留 Adapter 的既有目标契约；当前 Host 已通过 prepare 固定模型事实、dispatch 配置和 retry generation，外部验收边界见执行摘要。

## 1. 决策

ActSpace v2 采用 `@earendil-works/pi-ai` 作为 Provider wire implementation 和模型元数据来源，但不把 pi-ai 当作 Agent Core 的领域模型。

调用链固定为：

```text
Agent Loop
  -> ActSpace LLM Service
    -> one-shot PreparedCall
      -> ActSpace PiAiAdapter
        -> pi-ai Provider implementation
```

Session、Agent Loop、Desktop、CLI、工具和 IPC 只依赖 ActSpace 的 Message、Stream、Usage 和 Failure 契约。pi-ai 类型只能存在于 Adapter 实现内部。

## 2. DSH 参考边界

DSH 不是把整个 LLM 层替换为 pi-ai。它通过 `dsh-llm-pi-ai` 把 DSH 领域消息和请求转换到 pi-ai，再把 stream 转回；默认 DeepSeek route 仍可由独立 Adapter 提供。

ActSpace 借鉴的是这个隔离方式，不原样复制 DSH Adapter。DSH 当前映射会丢失部分 reasoning/cost usage，并因 pi-ai 错误扁平化而依赖字符串识别；这些不能成为 ActSpace 的回归。

## 3. 采用与保留矩阵

| 能力 | v2 处理 |
|---|---|
| OpenAI Chat Completions wire | 通过 pi-ai Adapter 提供 |
| OpenAI Responses wire | 通过 pi-ai Adapter 提供 |
| Anthropic Messages wire | 通过 pi-ai Adapter 提供 |
| Provider/model catalog facts | 从 pi-ai 读取，通过 ActSpace registry 投影 |
| 安装、启停、默认模型、任务用途和 fallback | ActSpace policy 所有 |
| Message / Stream / Failure / Usage | ActSpace 稳定契约 |
| Credentials | Host Adapter 所有，逐请求解析 `credentialRef` |
| baseURL / headers / protocol route | ActSpace 配置校验后交给 Adapter |
| Agent retry | durable retry policy 所有，SDK 内部重试关闭 |
| Chat image input | Adapter 支持，Session 只保存 durable attachment ref |
| Image generation tool | v2 保留现有工具实现，不并入 chat Adapter |
| Per-provider proxy | 在 pi-ai scoped proxy 门禁通过前保留现有 transport 能力 |

## 4. ActSpace LLM 契约

上层稳定契约至少表达：

- provider route、model 和 resolved capability；
- text、reasoning、tool call 和必要 signature/replay state；
- stream delta、done、aborted 和 error；
- input、output、cache read/write、reasoning token 和 cost；
- stop reason 与原始 provider stop reason；
- HTTP status、rate-limit、auth、quota、proxy、network、context overflow 和 malformed stream 等结构化 Failure；
- request-scoped `AbortSignal`；
- one-shot PreparedCall identity。

公共契约不得暴露 OpenAI、Anthropic 或 pi-ai SDK class。Provider-specific metadata 只能进入版本化、可选的 Adapter-private replay state。

## 5. one-shot PreparedCall

每次调用先解析 route、exact model、defaults、retry policy 和 Adapter registration，再返回一次性 PreparedCall。PreparedCall 冻结的是这次调用使用的 registration 与 resolved call config，不会自动深拷贝 Adapter 实现内部的所有可变状态。

PreparedCall 保证：

- model resolution 与最终 dispatch 使用同一个 Adapter registration；
- request header 记录的是实际采用的 defaults；
- Provider replacement 不会让一次调用前半段和后半段混用两个 registration；
- 持有 registration-scoped activation lease，直到 dispatch / stream settle 或按策略协作取消；
- credential 在 dispatch 时按 ref 解析，不被冻结进 Session；
- 一个 PreparedCall 只能 dispatch 一次，并提供显式 `release` / `cancel` 关闭未使用 lease。

下一次调用由 LLM Service 重新解析当前 route 和 Adapter registration，可以采用刷新后的注册。该一致性边界由 LLM 领域自己拥有，不依赖全局 Composition Generation。

Adapter registration 进入 replacement / unload 时，先标记 draining 并拒绝新的 PreparedCall。其异步 disposer 必须等待 active leases 归零，或在有界 shutdown / refresh policy 下触发协作取消并等待 stream settle，之后才能释放 SDK client、proxy、socket 和其他 registration-owned 资源。不能只保留一个旧函数引用，却先把它依赖的 Fiber 资源销毁。

调用顺序为：request candidate -> PreparedCall resolve / lease -> durable request snapshot -> checkpoint -> dispatch。PreparedCall 未成功建立时不写入一条声称已经选择 exact Adapter 的 request snapshot。prepare 成功后的调用边界必须使用 `try/finally`：Session append / checkpoint / Request Assembly 失败、dispatch 前 abort 或调用方放弃时显式 release/cancel；dispatch 成功后 lease 所有权转给 stream handle，并在 stream settle 的 finally 中释放。任何未 dispatch 路径都不得泄漏 lease或发起 wire request。

## 6. Credential 与 Secret

Profile、Bundle、Patch 和 Session 只保存 `credentialRef`。Host credential resolver 在每次 dispatch 前返回实际 key、可选 baseURL/headers 和定价倍率。

任何错误、日志、Session、Trace、CLI stdout 和 plugin diagnostics 都必须经过 secret redaction。Adapter 不把 key 放入 pi-ai message、replay state 或 thrown error message。

## 7. Retry 所有权

pi-ai 或底层 SDK 的自动重试必须关闭，使一次 Adapter dispatch 对应一次可观察 wire attempt。Agent retry 由独立 durable policy 决定：

- 记录 retry decision 和 delay；
- 尊重 `Retry-After`；
- 区分可重试网络/限流与不可重试认证/参数错误；
- 不重复已经发生的工具副作用；
- cancellation 终止 backoff 和后续 attempt。

如果某个 pi-ai Provider 无法关闭内部 retry，该 route 不通过采用门禁。

## 8. Usage 与 Cost

Adapter 必须保留 pi-ai 能提供的 input、output、cache、reasoning 和 cost，而不是采用 DSH 当前较窄的映射。若 Provider 不返回 cost，ActSpace 可以用 model catalog 和 credential pricing multiplier 计算估值，但必须标记 estimated 与 provider-reported 的区别。

usage 是 Session/observability 的事实，但 Provider catalog 的可变价格不是历史 Session 的解释来源；必要的快照应随 request/result 记录。

## 9. Proxy 阻断项

当前 ActSpace 支持 per-provider、经过 URL 校验的 `undici.ProxyAgent`。已审计 pi-ai `0.82.1` 的标准 OpenAI/Responses/Anthropic 路径没有发现稳定公开的 scoped custom fetch/dispatcher 注入面。

因此：

- 在真实 proxy spike 通过前，不删除现有 provider transport；
- 不设置会污染其他 Provider 的全局 dispatcher；
- 不依赖 pi-ai 私有文件路径或 monkey patch；
- 如果公开 API 无法满足并发 direct/proxied route，采用双 backend：普通 route 走 pi-ai，必须代理的 route 暂时走 ActSpace legacy transport。

双 backend 是兼容性降级，不允许向 Agent Loop 暴露两套 Message 或 Failure 类型。

## 10. Error 语义

Adapter 必须优先从 response hook、HTTP response 和原始 cause 构造结构化 Failure。仅有字符串时可以作为最后兜底，但不能把所有 Provider 失败压成一个 message。

最低分类包括：

- authentication / permission；
- quota / payment；
- rate limit 与 retry metadata；
- provider 5xx；
- proxy connect / tunnel / DNS；
- network timeout / abort；
- context overflow；
- invalid request；
- truncated or malformed stream；
- unsupported capability。

无法保留 HTTP status、proxy cause 或 abort identity 的 route 不应替换现有可工作的实现。

## 11. ESM 与依赖体积

本次审计使用的 pi-ai 快照为 `0.82.1`，是 ESM package，要求 Node `>=22.19.0`，并携带多个 Provider SDK。该版本只是首个验证基线，不是未经过 registry 验证的依赖承诺。

PiAiAdapter 位于新的 ESM runtime island。实现时优先使用公开的 individual provider factory，避免 Desktop 启动时无条件初始化全部 Provider。

v2 主分发已经确定为 managed ESM runtime，PiAiAdapter 位于该 ESM runtime island。strict standalone CommonJS SEA 不进入 v2 主产品。

## 12. 验收门禁

1. 精确版本 fresh install，并验证 package exports、Node engine 和 lock integrity。
2. OpenAI Completions、Responses、Anthropic 三条 route 在 Node 和 packaged Electron 中通过 smoke。
3. Golden cases 覆盖 text、reasoning/signature、交错 tool args、tool result、image input、abort 和跨 Provider replay。
4. usage 的 input/output/cache/reasoning/cost 不退化。
5. SDK retry 关闭，一次 PreparedCall 只产生一次 wire attempt。
6. 401、402、403、429、5xx、Retry-After、stream truncation、context overflow 和 proxy disconnect 保持结构化 Failure。
7. direct 与 proxied route 并发运行，代理不泄漏到其他 route。
8. Session、日志和 diagnostics 中不存在 secret。
9. route replacement 与 shutdown 遇到 in-flight stream 时，旧 registration 不接收新调用，disposer 会 drain 或协作取消 active lease，且不会提前释放 transport 资源。
10. snapshot append failure、checkpoint failure、pre-dispatch abort 和 abandoned PreparedCall 都释放 lease；stream success / error / abort 也恰好释放一次。

若 proxy、error 或 packaged runtime 任一门禁只能靠私有 API 通过，保留双 backend 并重开采用范围评审。

## 13. 兼容性 proof 与实施细节

- PiAiAdapter 的最终 package 位置和接口名称；
- compatibility proof 通过后实际锁定的 exact pi-ai version；
- scoped proxy 的公共实现路径，或门禁失败时长期双 backend；
- Provider catalog 与 ActSpace model settings 的同步和缓存策略；
- Adapter activation lease 的 drain timeout、shutdown cancellation 和 forced shutdown 数值；
- Adapter-private replay state、图片 attachment store 和升级的具体 schema；
- 各 legacy Provider wire 实现通过 parity 后删除的机械顺序。

这些不是尚未选择的产品方向。若 scoped proxy、结构化错误或 packaged Electron 只能依赖私有 API 才能实现，必须保留统一 ActSpace LLM 契约下的 legacy transport backend，并重开 pi-ai 采用范围评审。
