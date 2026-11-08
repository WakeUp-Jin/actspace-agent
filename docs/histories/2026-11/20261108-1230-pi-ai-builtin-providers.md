## [2026-11-08 12:30] | Task: pi-ai 1.5.0 与复用内置服务商

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI`

### 📥 User Query

> 审外部 PR #34（OpenCode Go）时发现：同一服务商下不同模型走不同协议、需要会话请求头，我们自己拼 Provider 做不到，pi-ai 新版内置服务商已经做好。用户确认 A–D：只按 Base URL 完全相同复用；不认识的模型借同服务商实现；代理走 `fetch`，OpenRouter 账单与 DeepSeek 图片留兼容 backend；复用时思考参数交给 pi-ai；SDK 跟 pi-ai 版本走。

### 🛠 Changes Overview

**Scope:** `@actspace/llm-pi-ai`、`@actspace/desktop`、`@actspace/agent-host`、`patches/`、docs

**Key Actions:**

- **升级**：pi-ai 0.82.1 → 1.5.0，openai 7.19.0，Anthropic SDK 0.129.0；用量补丁移植到 1.5.0。
- **复用内置服务商**：静态地址表 + 按需导入单个服务商模块；包装 Provider 转给内置实现，认识的模型用 pi-ai 的协议、地址、思考表和兼容开关。
- **代理**：改走 pi-ai 请求级 `fetch`，不再进兼容 backend。
- **回放**：信封身份不变，交给 pi-ai 的历史用内置服务商 id，同模型思考块得以保留。

### 🧠 Design Intent (Why)

按地址复用让 pi-ai 维护的服务商细节（每个模型的协议、思考格式、OpenCode 会话头）直接生效，加 pi-ai 已内置的服务商只需要模板。只按地址完全相同判断，避免智谱、MiniMax 这类“同名不同接口”的误判。pi-ai 不认识的模型保留我们的思考规则，因为 pi-ai 对它们没有档位表，交给它会丢掉 Kimi 等服务商的思考开关。

### 📁 Files Modified

- `packages/llm/llm-pi-ai/src/builtin-providers.ts`（新增）
- `packages/llm/llm-pi-ai/src/pi-ai-stream.ts`、`pi-ai-adapter.ts`、`reasoning-options.ts`
- `packages/llm/llm-pi-ai/src/test/pi-ai-builtin-providers.test.ts`（新增）、`pi-ai-adapter.test.ts`
- `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts`
- `packages/host/agent-host/src/node-ports/llm-adapter.ts`
- `patches/@earendil-works__pi-ai@1.5.0.patch`（替换 0.82.1）
- `docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md` §5.2、§7、§14、§17
- `docs/design-docs/model-context/agent-multi-provider-llm.md`、`agent-model-catalog-and-usage-cost.md`
