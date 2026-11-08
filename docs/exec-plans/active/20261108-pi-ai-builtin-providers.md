# pi-ai 1.5.0 与复用内置服务商

## 目标

按 [LLM Core Pi §17](../../design-docs/agent-plugin-runtime/agent-llm-core-pi.md#17-pi-ai-150-与复用内置服务商2026-11-08) 实施：pi-ai 升到 1.5.0；连接 Base URL 命中 pi-ai 内置服务商时复用它的实现（按模型取协议、地址、思考参数、兼容开关和会话请求头）；代理改走 pi-ai 的请求级 `fetch`。做完后，新增 pi-ai 已内置的服务商（如 OpenCode Go）只需要加模板。

## 范围

- 包含：
  - 依赖升级与用量补丁移植（已完成，见进度）。
  - 内置服务商地址表、按需加载、包装 Provider、模型字段合并（§17.2、§17.3）。
  - 复用时思考参数交给 pi-ai，自定义中转保留 `reasoning-options.ts`（§17.4）。
  - 代理改走 `fetch`，`needsLegacy` 去掉代理条件（§17.5）。
  - 回放身份分离、`adapterVersion` 升版（§17.6）。
  - Desktop `DesktopLegacyLlmAdapter` 与 CLI `NodeLlmAdapter` 两个 Host 同步。
  - 测试、执行记录、history。
- 不包含：
  - OpenCode Go 模板、图标（外部 PR #34 的贡献者在新基础上重做）。
  - 智谱、MiniMax 模板改地址。
  - OpenRouter 账单金额、DeepSeek 文件上传迁出兼容 backend。
  - 模型目录、价格逻辑。

## 背景

- 设计：上面的 §17；[多供应商 LLM](../../design-docs/model-context/agent-multi-provider-llm.md) §LLM Service 与请求构造。
- 代码：
  - `packages/llm/llm-pi-ai/src/pi-ai-stream.ts`、`pi-ai-adapter.ts`、`reasoning-options.ts`、`legacy-proxy-wire-engine.ts`；
  - `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts`；
  - `packages/host/agent-host/src/node-ports/llm-adapter.ts`。
- 参考：`tmp/deepseek-harness/packages/llm/llm-pi-ai/src/provider.ts` 的 `reuseCatalogProvider`。
- 约束：pi-ai 公开导出只用 `.`、`./api/*`、`./providers/*`；不引用私有路径；Node ≥ 22.19。

## 任务

| # | 内容 | 位置 |
|---|---|---|
| T1 | 依赖升级、补丁移植、重装后既有测试全过 | `package.json`、`patches/` |
| T2 | 地址表 `BUILTIN_PROVIDER_BY_BASE_URL` + `builtinProviderForBaseUrl(url)`（规范化去尾 `/`）+ 按 id 动态导入 `providers/<id>` 并缓存实例 | 新文件 `builtin-providers.ts` |
| T3 | `streamPiAi` 分两条：复用内置 → 包装 Provider、合并模型（§17.3 表）；不复用 → 现有自建路径。最终模型的 `api` 决定图片准备、usage 口径、回放 | `pi-ai-stream.ts` |
| T4 | 复用时 `onPayload` 不调用 `withReasoningPayload`，只做 DeepSeek 请求体校验；`reasoning` 档位照旧传 | `pi-ai-stream.ts` |
| T5 | 回放：信封用 `options.providerId`；交给 pi-ai 的历史消息用最终模型的 provider / api / id | `pi-ai-stream.ts` |
| T6 | 代理：`PiAiConnectionOptions` 加 `proxies?: ProviderProxyPool`；有 `proxyUrl` 时取 `fetch` 传给 pi-ai；代理失败归类 `proxy`；`needsLegacy` 去掉代理条件；兼容 backend 的 OpenRouter / DeepSeek 图片两条保持 | `pi-ai-stream.ts`、`pi-ai-adapter.ts` |
| T7 | `adapterVersion`：`PiAiAdapter` 默认 `pi-ai-1.5.0`；Desktop `actspace.desktop-pi-ai.v3`；CLI `actspace.cli-pi-ai.v3` | 三处 |
| T8 | 两个 Host 把 `proxies` 传进 `wire` 选项 | Desktop / CLI adapter |
| T9 | 测试：地址表与 `builtinProviders()` 一致；复用 / 不复用选择；认识 / 不认识模型取值；opencode-go 按模型分协议并带 `x-opencode-session`；思考参数（DeepSeek、Kimi、Anthropic、OpenAI Responses）；代理 `fetch`；回放签名同模型保留；既有用量、兼容 backend 测试 | `packages/llm/llm-pi-ai/src/test/` |
| T10 | 文档收尾：执行记录、history、计划归档 | `docs/` |

## 风险

- 内置模型的 `maxTokens`、`contextWindow` 和我们设置不同 → 以我们的设置为准，pi-ai 只补缺。
- pi-ai 把不支持的档位就近取整，与原来“未声明档位直接报错”的 Host 校验叠加 → Host 校验不变，只影响 Host 已放行的档位。
- 升级后 OpenAI Responses 默认 `cacheRetention` 等行为变化 → 照旧显式传入；测试覆盖。
- 外部依赖：真实 Key 验收需要用户。

## 验证方式

- `pnpm --filter @actspace/llm-pi-ai test`、`tsc`；
- Desktop main 测试与 typecheck；`packages/host/agent-host` 测试；
- `pnpm check:docs`、`check:packages`；
- 离线 `pnpm install --frozen-lockfile --offline` 能装上带补丁的 1.5.0；
- 手工（用户）：Electron 里 DeepSeek、Kimi、Anthropic、OpenRouter、自定义中转各发一条带思考和工具的消息；开代理再发一条。

## 进度记录

- [x] T1 依赖升级与补丁移植，llm-pi-ai 124/124 通过（2026-11-08）。
- [x] T2–T9 实现与测试（2026-11-08）：llm-pi-ai 146/146，Desktop main 616，agent-host 64 + process 0 失败；执行摘要见 `docs/exec-runs/20261108-pi-ai-builtin-providers/execution-summary.md`。
- [x] T10 执行记录与 history。
- [ ] 用户：真实 Key 与 Electron 实机检查（摘要里的人工验证指引）。

## 决策记录

- 2026-11-08：用户确认 A–D：只按 Base URL 完全相同复用；不认识的模型借同服务商实现；代理走 `fetch`，OpenRouter 账单与 DeepSeek 图片留兼容 backend；复用时思考参数交给 pi-ai。回放身份沿用稳定 id 由主智能体决定，理由是旧会话签名要继续匹配。
- 2026-11-08：实现中发现 pi-ai 对不认识的 id 按地址识别思考格式不全（Kimi 会被识别成不发思考字段），改为只有 pi-ai 认识的模型才把思考参数交给它，其余保留 ActSpace 规则；§17.4 已同步。
- 2026-11-08：只加载命中的那一个服务商模块，不导入 `providers/all`，启动和内存都更省。

## 执行模式

- **交互模式**。
