# ActSpace v2 P05：LLM Service、PreparedCall 与 Provider Adapter — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-05-llm-service-and-adapters.md`
- **执行模式**：交互
- **开始时间**：2026-08-22 21:00
- **当前状态**：候选实现完成；registry fresh-install 与 packaged gate 仍受外部网络/审批阻断

## 执行时间线

### 步骤 1：固定 ActSpace LLM contract

- **操作**：实现 Message/Content、Tool Definition、Stream Event、Usage、Failure、CredentialResolver 和 Adapter dispatch input。
- **决定**：SDK、pi-ai、OpenAI、Anthropic 类型不进入 Agent Runtime 上层 contract；Provider-private data 只能由 Adapter 内部处理。
- **验证**：strict typecheck 与 contract test 通过。

### 步骤 2：实现 route registry 与 PreparedCall lease

- **操作**：实现 route duplicate fail-fast、model pattern、registration replacement、draining、activation lease 和 one-shot PreparedLlmCall。
- **决定**：PreparedCall capture exact route registration；旧 registration draining 后拒绝新 prepare，但既有 call 保持旧 adapter，直到 stream settle 或协作取消。
- **验证**：replacement、single-dispatch、release-on-abandon 和 stream settle release 通过。

### 步骤 3：实现双 backend adapter seam

- **操作**：实现 PiAiAdapter 与 LegacyTransportAdapter 的注入式 engine/transport seam，补齐 per-request credential、AbortSignal 和 adapter cancel。
- **决定**：pi-ai 只作为内部 wire engine；在 P02 scoped-proxy 门禁没有通过前，legacy transport 保留给 proxy route，二者共享同一 ActSpace Message/Stream/Failure 类型。
- **验证**：direct 与 legacy route 的并行调用不会混用 adapter，调用 canary 保持隔离。

### 步骤 4：补齐 durable retry 与结构化 failure

- **操作**：route 注册时规范化并冻结 retry policy；AgentLoop 在一次 wire attempt 失败且尚未产生可观察 delta 时追加 `llm/error`、`llm/retry`，checkpoint 后执行可取消 backoff，追加 `llm/retry-started`，再用同一 registration 建立新的 one-shot PreparedCall。SDK/engine 继续保持内部 retry 关闭。
- **操作**：统一解析公开错误对象的 HTTP status、provider code 与 `Retry-After`（秒、HTTP date、显式毫秒字段），不再依赖两个 backend 各自的错误字符串猜测。
- **验证**：retry/session golden 测试覆盖 registration capture、durable retry facts、abort backoff 和 request snapshot。

### 步骤 5：补齐断流、代理失败与 lease 静止门禁

- **操作**：Legacy scoped-proxy transport 的 OpenAI Completions、OpenAI Responses 和 Anthropic Messages 都必须观察到各自协议的 terminal event；部分 delta 后直接 EOF 归类为 `malformed-stream`，不能伪装成 `done`。
- **操作**：request-scoped proxy disconnect 归类为可重试 `proxy` failure，底层含 credential 的 cause 不进入错误文本；LLM activation lease drain 会清除并 `unref` deadline timer。
- **验证**：三路 truncated stream、proxy disconnect、HTTP/timeout/socket/DNS failure 分类、lease timeout 后释放并重试 dispose 均通过；Agent Runtime 全量 36 个文件、153 个测试通过，6 个真实 published-package smoke 默认跳过且显式门禁 6/6 通过。

## 遇到的问题

- **问题**：P02 的 fresh registry pi-ai 依赖门禁仍受网络/审批服务阻断。
  - **应对**：生产 package.json 保留 exact pin；使用 DSH 已构建 pi-ai 包做 public export 与三路 fixture smoke，但不把本地软链或 vendor 路径写入 lockfile。
- **问题**：LLM credential 必须在 wire dispatch 前解析，但不能进入 Session 或 snapshot。
  - **应对**：PreparedCall 只保存 credentialRef，dispatch 时通过 CredentialResolver 取得 secret；错误和 header 边界另行 redaction。

## 跳过或推迟的事项

- 真实 pi-ai provider factory、三 route golden fixtures 和 packaged Electron smoke 依赖 P02 fresh install gate。
- legacy transport 的三条 provider route termination 与 proxy failure 已有确定性 fixture；真实 Provider wire parity 仍由 P02/P15 验收。
- durable retry decision 由 Agent Loop/Session policy 所有；LLM 默认不做 SDK 隐式 retry。真实 provider retry-after 和 packaged load 仍属于 P02/P15 gate。
