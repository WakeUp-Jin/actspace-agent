# ActSpace v2 P02：pi-ai 0.82.1 准入门禁

状态：执行中（public export、三路契约与双 backend 已通过；fresh registry/package gate 待恢复）

父计划：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/README.md`

依赖：P00 `actspace-v2-p00-contracts-and-esm-island`

消费者：P05 LLM Adapter、P12 Base Profile/RuntimeHandle、后续 Agent Loop、Host Adapter 和最终跨宿主验收

exec-run slug：`actspace-v2-p02-pi-ai-admission`

## 目标

固定 `@earendil-works/pi-ai@0.82.1` 作为 v2 的首个 Provider wire/catalog 验证基线，验证 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages 三条 route 在 ESM Node runtime 与 packaged Electron 中的消息、stream、tool、reasoning、image、usage、abort/replay、结构化错误、secret redaction 和 retry 语义。proxy API 若只达到 LIMITED 级别，保留 ActSpace legacy transport 作为必须代理 route 的双 backend；若出现 CORE_HARD_FAIL，停止采用并重开 pi-ai ADR。

## 范围

包含：

- 在 `@actspace/agent-runtime` 中以 exact version `@earendil-works/pi-ai@0.82.1` 建立准入 probe。
- 验证三条 route、公开 exports、Node engine、ESM package、lockfile integrity 和 packaged Electron 加载。
- 验证统一 ActSpace adapter boundary，不让 pi-ai 类型进入 shared、Session、Host、IPC 或 Agent Loop 公共契约。
- 验证 direct route、scoped proxy route 和 legacy proxy route 的显式选择。
- 形成 `PiAiAdmissionReport`，明确 `PASS`、`PROXY_LIMITED`、`CORE_HARD_FAIL` 三种结果。
- 验证一次 PreparedCall 对应一次 wire attempt，关闭 SDK 内部 retry，并确保 lease 在所有退出路径释放。

不包含：

- 不把 pi-ai Message、Provider class、SDK error 或 SDK client 导出到 `@actspace/shared/runtime-v2`。
- 不在 P02 重写 Agent Loop、Session Journal、Tool Runtime、Host Adapter 或图片生成工具。
- 不设置全局 dispatcher、`HTTP_PROXY`、`HTTPS_PROXY` 或 monkey patch pi-ai。
- 不使用真实用户凭据，不把 secret 写入 fixture、日志、Session、diagnostics、stdout 或 replay state。
- 不因 proxy LIMITED 直接删除现有 ActSpace transport；双 backend 的 public Message/Failure 仍只有一套。

## 必读

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/PLANS_GUIDE.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-llm-adapter.md`
- `docs/design-docs/agent-plugin-runtime/agent-decision-cordis-adoption.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-decisions-v2-foundation.md`
- `packages/agent-runtime/package.json`（依赖字段由主集成者在 P01 后串行合并）
- `packages/agent-runtime/tsconfig.json`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-core/src/llm/`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/llm/convert.ts`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/provider-config.ts`
- `pnpm-lock.yaml`（由主集成者在 P01 lockfile 后串行合并）

## 当前基线

- P00 已提供 NodeNext ESM 隔离岛，但当前没有 pi-ai dependency、adapter 或 admission report。
- v1 `packages/agent-core/src/llm/` 仍维护 DeepSeek、Kimi 和 OpenAI-compatible transport；这些实现是 proxy LIMITED 时的 legacy backend 资产。
- 当前 ActSpace shared/Session/Host 契约不应引入 pi-ai 类型。
- 已审计设计基线要求 Node `>=22.19.0`，pi-ai exact version 为 `0.82.1`；registry fresh install 和 packaged Electron 仍需验证。
- 当前 v1 的 provider conversion、usage 和 error 形状不能直接当作 v2 public contract；P02 只记录 parity 事实。

## 输入契约

- package 固定为 `@earendil-works/pi-ai@0.82.1`，不接受浮动范围。
- ActSpace Adapter 上层使用独立的 `LlmRequest`、`LlmStreamEvent`、`LlmUsage`、`LlmFailure` 和 `PreparedCall` 语义；这些类型不能从 pi-ai 直接重导出。
- 三条 route 固定为 `"openai-completions" | "openai-responses" | "anthropic-messages"`。
- proxy 是 request-scoped/provider-scoped 配置，不能修改全局 dispatcher。
- Agent retry 由 ActSpace durable policy 所有；pi-ai/SDK 自动 retry 必须关闭。

## 输出契约

实现文件：

- `packages/agent-runtime/package.json`：加入 `@earendil-works/pi-ai` exact dependency。
- `packages/agent-runtime/src/compatibility/pi-ai/admission.ts`：定义 route、proxy 和准入结果。
- `packages/agent-runtime/src/compatibility/pi-ai/probe.ts`：执行公开 API 的本地 fake-provider probe。
- `packages/agent-runtime/src/compatibility/pi-ai/test/admission.test.ts`：三路由、消息、stream、错误、usage、abort 和 retry 断言。
- `packages/agent-runtime/src/compatibility/pi-ai/test/route-fixtures.ts`：无凭据本地 HTTP fixture 和 deterministic stream fixture。
- `packages/agent-runtime/src/compatibility/pi-ai/test/secret-redaction.test.ts`：secret、Authorization header 和原始 provider error redaction。
- `packages/agent-runtime/src/compatibility/pi-ai/test/packaged.test.ts`：Node/Electron packaged runtime import smoke。
- `pnpm-lock.yaml`：exact pi-ai 依赖和 integrity。

固定类型名：

- `PiAiRoute`
- `PiAiProxyMode`：`"direct" | "scoped" | "legacy"`
- `PiAiBackendMode`：`"pi-ai" | "actspace-legacy"`
- `PiAiAdmissionDecision`：`"PASS" | "PROXY_LIMITED" | "CORE_HARD_FAIL"`
- `PiAiAdmissionFailureCode`
- `PiAiRouteProbe`
- `PiAiAdmissionReport`

`PiAiAdmissionReport` 至少包含 `packageVersion: "0.82.1"`、三个 route probe、`proxyMode`、`backendMode`、`retryDisabled`、`secretRedaction`、`leaseDrain` 和失败码。该 report 由 P05 LLM Adapter 和 P12 Base Profile/RuntimeHandle 读取，但 pi-ai SDK 类型不能越过 `packages/agent-runtime/src/compatibility/pi-ai/**`。

## 允许修改

- `packages/agent-runtime/package.json`
- `packages/agent-runtime/src/compatibility/pi-ai/**`
- `packages/agent-runtime/src/test/**` 中与 pi-ai 准入边界直接相关的测试
- `pnpm-lock.yaml`
- `docs/exec-runs/actspace-v2-p02-pi-ai-admission/**`
- `docs/design-docs/agent-plugin-runtime/agent-target-llm-adapter.md` 仅在结果为 `PROXY_LIMITED` 或 `CORE_HARD_FAIL` 时记录证据和采用范围变化
- 对应 v2 pi-ai ADR 仅在 `CORE_HARD_FAIL` 时更新并等待重新评审
- 本计划的进度和决策记录

## 禁止修改

- `packages/shared/src/session.ts`、`packages/shared/src/ipc.ts`、`packages/shared/src/runtime-v2/**`
- `packages/agent-core/**` 的生产 transport、Agent Loop 或 Tool Runtime
- `apps/desktop/**`、`apps/cli/**` 和 renderer
- `plugins/**`、Browser Bridge、Kairos 和 fs-watch
- 全局 `fetch`、`undici` dispatcher、环境变量代理和用户凭据
- `packages/agent-runtime/src/index.ts` 的未评审公共 RuntimeHandle surface
- v1 默认 provider 选择、Session 数据和现有用户配置

## 任务与测试

### P02.1：精确包和 route exports

在 `package.json` 加入 `@earendil-works/pi-ai: "0.82.1"`，在干净临时目录执行 registry fresh install，验证 exports、Node engine、ESM import、lockfile integrity 和 provider factory 公开入口。禁止从私有路径导入。

测试：`packages/agent-runtime/src/compatibility/pi-ai/test/admission.test.ts` 读取实际 package metadata，并对三条 route 生成 `PiAiRouteProbe`。

### P02.2：三条 route 和消息流

使用本地 fake provider fixture，覆盖 text delta、reasoning/signature、交错 tool args、tool result、image input、done、abort、truncated stream 和跨 route replay。断言转换结果只生成 ActSpace 自有的上层 probe DTO。

### P02.3：usage、cost、failure 和 retry

断言 input/output/cache/reasoning/cost 的 provider-reported 与 estimated 标志；关闭 SDK 内部 retry；覆盖 401、402、403、429、5xx、Retry-After、proxy connect/DNS、timeout、abort、context overflow、invalid request 和 malformed stream 的结构化失败分类。

### P02.4：proxy 分级决策

同时运行 direct route 与 per-provider proxy route。若公开 API 能提供 scoped dispatcher，记录 `proxyMode: "scoped"`；若 pi-ai route 本身可用但 scoped proxy API 不足，记录 `PiAiAdmissionDecision: "PROXY_LIMITED"`、`backendMode: "actspace-legacy"`，仅把必须代理的 route 交给现有 transport。若核心 package、exports、三路由基本能力、ESM packaged load、abort/replay 或结构化错误无法成立，记录 `CORE_HARD_FAIL`。

### P02.5：secret 与 lease

在 `packages/agent-runtime/src/compatibility/pi-ai/test/secret-redaction.test.ts` 扫描 Session、日志、diagnostics、stdout、replay state 和 thrown error；在 admission tests 覆盖 PreparedCall 只能 dispatch 一次、pre-dispatch abort、snapshot/checkpoint failure、stream success/error/abort 和 replacement drain 均恰好释放一次 lease。

### P02.6：packaged runtime 和报告

在 Electron packaged child process 中执行三条无凭据 fake route smoke，并生成 `PiAiAdmissionReport`。执行过程写入 `docs/exec-runs/actspace-v2-p02-pi-ai-admission/execution-process.md`，结束时写入 `execution-summary.md`。

## 并行边界

- P02 依赖 P00，可与 P01 并行。
- P05/P12 可以读取 `PiAiAdmissionReport`，但只有 `PASS` 或明确记录的 `PROXY_LIMITED` 才能进入 LLM capability 组装；`CORE_HARD_FAIL` 必须停止 LLM required Provider 发布。
- P02 不改现有 legacy transport，因此可以与旧 provider 回归测试并行；任何共享 lockfile 修改必须串行合并。
- 真正的 PiAiAdapter 和 Agent Loop 消费由后续 LLM/Agent 计划负责，P02 不提前切流。

## 失败停线与回退

- **PROXY_LIMITED**：保留 `actspace-legacy` backend，只允许必须代理的 route 使用；Agent Loop 仍只看到一套 ActSpace Message/Stream/Failure/Usage 契约。不得把 LIMITED 当作完整 pi-ai 通过。
- **CORE_HARD_FAIL**：停止 pi-ai 采用，保留 v1 transport，记录完整失败证据并重开 pi-ai ADR；不得通过私有 API、monkey patch、全局代理或修改依赖源码伪造通过。
- route smoke、usage、retry、secret 或 lease 单项失败但核心可加载时，按门禁失败处理，不能删除现有 provider 能力。
- 回退只移除 P02 新增 pi-ai dependency、`src/compatibility/pi-ai/**` probe 和 lockfile 变更；P00、P01、v1 provider 和数据均保留。

## 验证命令

```bash
pnpm install --frozen-lockfile
pnpm --filter @actspace/agent-runtime typecheck
pnpm --filter @actspace/agent-runtime exec vitest run src/compatibility/pi-ai/test/admission.test.ts src/compatibility/pi-ai/test/secret-redaction.test.ts src/compatibility/pi-ai/test/packaged.test.ts
pnpm check:repo
pnpm check:secrets
pnpm check:docs
git diff --check
```

预期结果：`@earendil-works/pi-ai@0.82.1` 能在 ESM Node 和 packaged Electron 解析；三条 route 和统一 probe 通过；proxy 结果明确为 scoped 或 PROXY_LIMITED；CORE_HARD_FAIL 时没有默认切流或私有绕过。

## 完成标准

- `PiAiAdmissionReport.packageVersion` 为 `"0.82.1"`，三条 route 均有可复现 probe 结果。
- `PiAiAdmissionDecision` 为 `PASS` 或 `PROXY_LIMITED`；若为 `CORE_HARD_FAIL`，P02 只能以记录证据和重开 ADR 结束，不能标记采用完成。
- direct/proxy 并发、retry、usage/cost、结构化 Failure、abort/replay、secret redaction 和 lease drain 均有测试证据。
- pi-ai 类型只存在于 ESM adapter 内部，shared、Session、Host、IPC 和 Agent Loop 没有 SDK 类型泄漏。
- P05/P12 能读取准入结果并据此决定 LLM capability 是否可作为 required Provider，但 v1 默认 transport 未被删除。

## 进度

- [ ] P02.1：完成 exact pi-ai package 和三条 route exports 检查。
- [x] P02.2：完成消息、stream、tool、reasoning、image、abort/replay fixture。
- [x] P02.3：完成 usage、cost、failure、Retry-After 和 retry-disabled 检查。
- [x] P02.4：完成 scoped proxy / PROXY_LIMITED / CORE_HARD_FAIL 分级。
- [x] P02.5：完成 secret redaction 和 lease drain 检查。
- [ ] P02.6：完成 packaged smoke、准入报告和 exec-run 摘要。

## 决策记录

- 2026-08-22：pi-ai 验证基线固定为 `@earendil-works/pi-ai@0.82.1`。
- 2026-08-22：proxy 能力不足归类为 `PROXY_LIMITED`，保留 ActSpace legacy transport；这不改变统一上层 LLM 契约。
- 2026-08-22：核心加载、三路由、ESM packaged、abort/replay 或结构化错误无法成立时归类为 `CORE_HARD_FAIL`，必须重开 ADR，不使用私有 API 绕过。
