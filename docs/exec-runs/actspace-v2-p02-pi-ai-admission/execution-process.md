# ActSpace v2 P02：pi-ai 0.82.1 准入 - 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p02-pi-ai-admission.md`
- **当前状态**：public API、三路 ActSpace fixture、双 backend、结构化错误与 lease/retry seam 通过；fresh registry/package、packaged Electron 与真实 provider gate 待外部 registry/credential

## 已验证

- DSH 构建的 `@earendil-works/pi-ai@0.82.1` public core `createModels/createProvider` 与 `api/openai-completions`、`api/openai-responses`、`api/anthropic-messages` 的 `stream/streamSimple` 均可加载。
- ActSpace fixture 覆盖 text、reasoning/signature、交错 tool args、历史 tool call/result 回放、image artifact、usage/cost、AbortSignal、abort terminal、truncated stream 和三路消息映射。
- `PiAiAdapter` 对 direct route 使用 pi-ai，对 scoped proxy 使用显式 `LegacyProxyWireEngine`；不设置 global dispatcher，不使用 private deep import。
- OpenAI/Anthropic SDK compatibility backend 使用 scoped `undici.ProxyAgent`，SDK `maxRetries: 0`；直连与兼容 backend 的错误保留 status/provider code/Retry-After，并区分 401、402、403、429、5xx、timeout、socket reset、DNS、context overflow、invalid request、abort 与 malformed stream。
- LLM 错误与 header 脱敏覆盖 Bearer/token 和 URL 内嵌凭据；Session secret guard、projection/diagnostics redaction 与 PreparedCall one-shot/lease drain 的全量回归通过。
- AgentLoop durable retry 通过：一次 wire attempt 失败且无 observable delta 时写 `llm/error`、`llm/retry`、checkpoint、可取消 backoff、`llm/retry-started`，再用相同 registration 生成新 PreparedCall。
- `packages/agent-runtime` 全量本地回归为 36 files、153 passed、6 个真实依赖 smoke 默认 gated；显式 Cordis/pi-ai 公共包门禁为 6/6。

## 外部门禁

- npm registry metadata/integrity 无法下载，不能把本地 DSH package softlink 视为可发布制品。
- 未使用真实 credential 对三家 provider 发起网络调用；需要在 registry fresh install、packaged managed ESM 和人工 provider canary 中完成。
- `pnpm install --frozen-lockfile --offline` 仍被 Cordis package entry 缺失阻断；pi-ai 本地 public export smoke 不能替代 registry lock integrity。
