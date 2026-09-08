# P05：LLM Service、PreparedCall 与 Provider Adapter

状态：执行中（ActSpace contract、双 backend、durable retry 与本地 public export smoke 已完成；fresh registry 与 packaged provider gate 待恢复）

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](README.md)

依赖：P00、P02

消费方：P08-P15

Exec-run slug：`actspace-v2-plan-05-llm-service-and-adapters`

## 1. 目标

实现只暴露 ActSpace 领域类型的 LLM Service：Provider route 通过 effect-owned registration 注册，每次请求建立 one-shot `PreparedLlmCall` 和 activation lease，dispatch 后输出稳定 Message / Stream / Usage / Failure。pi-ai 只作为 Adapter 内部 wire engine；需要 per-provider proxy 且 pi-ai 无公开 scoped transport 时，确定性地走迁移后的 ActSpace transport backend。

## 2. 必读与基线

- [LLM Adapter 目标设计](../../../design-docs/agent-plugin-runtime/agent-target-llm-adapter.md)
- [Agent Core 目标边界](../../../design-docs/agent-plugin-runtime/agent-target-agent-core.md)
- `packages/agent-core/src/llm/`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/provider-config.ts`
- P02 的 compatibility report 与 fixtures

## 3. 文件与公共接口

新增：

```text
packages/agent-runtime/src/llm/
├── message.ts
├── stream.ts
├── usage.ts
├── failure.ts
├── route-registry.ts
├── prepared-call.ts
├── activation-lease.ts
├── retry-policy.ts
├── credential-port.ts
├── adapter.ts
├── pi-ai-adapter.ts
├── legacy-transport-adapter.ts
├── model-catalog.ts
├── redaction.ts
└── test/
```

固定接口名：`LlmService`、`LlmRouteRegistration`、`LlmAdapter`、`PreparedLlmCall`、`LlmStreamHandle`、`CredentialResolver`、`ResolvedLlmRequest`、`LlmFailure`、`LlmUsage`。SDK、pi-ai、OpenAI、Anthropic 和 `undici` 类型不得出现在 package public declarations、Session、Shared DTO 或 Host IPC 中。

## 4. 路由与 backend 决策

| 条件 | backend |
|---|---|
| pi-ai route 通过 P02，且请求不需要 proxy | `PiAiAdapter` |
| pi-ai 公开 API 支持 request-scoped proxy 且 P02 isolation 通过 | `PiAiAdapter` |
| 请求需要 proxy，pi-ai 没有合格公开注入面 | `LegacyTransportAdapter` |
| route 的 structured failure / retry / abort 门禁未通过 | 该 route 不使用 pi-ai；若 legacy 也不支持则启动验证失败 |

上层 route identity、Message、Failure 和 Usage 不随 backend 改变。禁止 global dispatcher、private deep import、monkey patch 或修改 pi-ai 源码。

## 5. 任务

### 05.1 ActSpace 消息与失败合同

- 实现 text、reasoning/signature、tool call、tool result、image attachment ref 和 provider-private replay state。
- stream 只产生 typed delta / done / aborted / failure；partial tool args 必须按 call identity 组装。
- Failure 至少分类 auth、permission、quota/payment、rate-limit、provider 5xx、proxy、DNS/network、timeout、abort、context overflow、invalid request、malformed/truncated stream、unsupported capability。
- usage 保留 input/output/cache read/cache write/reasoning/cost，并区分 reported 与 estimated。

### 05.2 Registry、PreparedCall 与 lease

- route id 冲突 fail-fast；registration 由 Cordis Effect 拥有。
- `prepare()` 一次性解析 exact route、model、defaults、retry policy 和 registration，返回只能 dispatch 一次的 `PreparedLlmCall`。
- prepared call 在 snapshot append fail、checkpoint fail、pre-dispatch abort、caller abandon 时 release/cancel；dispatch 后 lease 转给 stream handle，在 success/error/abort finally 中恰好释放一次。
- registration draining 后拒绝新 prepare；dispose 等待 active leases，超时后协作取消并再次等待 settle，不提前关闭 transport。

### 05.3 Credential、secret 与 retry

- Session/Profile 只持有 `credentialRef`；每次 dispatch 通过 Host `CredentialResolver` 解析 key、base URL、headers、proxy 和 pricing multiplier。
- redaction 覆盖 key、Authorization、proxy credential、provider body、nested cause、stdout/stderr 和 diagnostics。
- SDK 内部 retry 关闭；durable retry policy 每个 wire attempt 产生独立事实，尊重 Retry-After，abort 取消 backoff。

### 05.4 PiAiAdapter

- 使用 P02 验证过的公开 provider factory 实现 Completions、Responses、Anthropic 映射。
- 不在 Desktop 启动时初始化未使用 Provider SDK。
- 把 P02 golden fixture 升级为 Adapter contract tests，验证跨 Provider replay、reasoning signature、交错 tool args、image 和 usage 不丢失。

### 05.5 Legacy transport backend

- 从 `packages/agent-core/src/llm/provider-transport.ts` 及三个协议实现迁移 request-scoped proxy、结构化 HTTP 错误和 abort 能力。
- 只迁移 wire 与错误处理，不迁移旧 LLM public types、factory、Context 或 Agent retry。
- 对 direct 与 proxied 并发 route 注入不同 canary server，证明没有 transport 串流。

### 05.6 Catalog 与 registration lifecycle

- pi-ai catalog 只提供 provider/model facts；ActSpace 继续拥有安装、启停、purpose、fallback、credential 和价格倍率策略。
- Provider catalog snapshot 带 source/version/time；历史 usage 不依赖可变的当前价格解释。
- replacement 测试证明旧 PreparedCall 继续使用旧 registration，新调用使用新 registration，旧资源在 lease drain 后释放。

## 6. 允许修改

- `packages/agent-runtime/src/llm/**`
- P02 compatibility fixtures
- `packages/agent-runtime/package.json` 与 `pnpm-lock.yaml` 仅由主集成者按 P02 已锁版本更新
- `packages/shared/src/runtime-v2/llm.ts` 的 Host DTO
- exec-run、设计勘误和 history

禁止修改旧 `packages/agent-core/src/llm`、Host settings、Desktop/CLI、默认 Runtime 和真实 credential 文件。

## 7. 失败与回滚

- pi-ai 硬门禁失败按 P02 停线，不以 `any` 或字符串错误降级掩盖。
- 仅 proxy 门禁受限时启用本计划已定义的双 backend，不重开上层合同。
- canary secret 出现在任何序列化面即为阻断。
- 回滚删除新 LLM module 和依赖 pin；v1 Provider runtime 不变。

## 8. 验证

```bash
pnpm --filter @actspace/agent-runtime test -- src/llm
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime build
pnpm check:secrets
pnpm check:docs
git diff --check
```

预期：三 route 与双 backend fixture 通过；SDK retry wire count 为 1；所有未 dispatch / settled 路径 lease 恰好释放一次；测试结束无 socket、dispatcher 或 client 泄漏。

## 9. 完成标准

- P08/P10 只依赖 ActSpace LLM contract。
- route replacement、proxy、retry、failure、usage、abort 和 secret 行为均有自动化证据。
- 旧 LLM 代码尚未删除，但 v2 没有导入它；最终删除由 P15 完成。
