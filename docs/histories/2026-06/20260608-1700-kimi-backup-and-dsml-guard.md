## [2026-06-08 17:00] | Task: 接入 Kimi 备用主模型 + DeepSeek DSML 泄漏兜底

### 🤖 Execution Context

- **Agent ID**: `n/a（本地会话）`
- **Base Model**: `Claude Opus 4.8`
- **Runtime**: `Cursor IDE / actspace-agent monorepo`

### 📥 User Query

> 两个任务：(1) 排查某会话报错——疑似 DeepSeek 联网搜索导致的裸 DSML 泄漏；(2) DeepSeek 近期降智，希望聊天框可选 Kimi 备用模型，并评估跨模型续聊格式问题、Explore/Kairos 是否放出 Kimi、Usage 余额如何展示。确认后按 execution plan 完整实现。

### 🛠 Changes Overview

**Scope:** `@actspace/agent-core`、`@actspace/shared`、`@actspace/desktop`

**Key Actions:**

- **Phase 0 DSML 兜底**: `anthropic-convert.ts` 新增 `detectLeakedDsmlToolCalls`；`AnthropicMessagesService` 在流结束时若 `toolCalls` 为空且正文含裸 `｜｜DSML｜｜tool_calls/invoke`，按可重试 `server_error` 处理并丢弃垃圾正文（保留 usage），不再落库展示。
- **Phase 1 Kimi public**: `model-config.ts` 把 `kimi-k2.6` 改为 `visibility: "public"` 并补 CNY pricing，聊天框模型选择器自动出现 Kimi。
- **Phase 2 Kimi 主模型联网搜索**: `OpenAICompletionsService.stream` 主入口检测 `provider === "kimi"` 时追加 builtin `$web_search` 并禁用 thinking，在 service 内部完成 `$web_search` 回填循环（不暴露 builtin tool_call、跨轮累加 usage、记入 `serverToolUse.webSearchRequests`），helper 路径不受影响。
- **Phase 3 Explore/Kairos**: Explore 下拉因 public 化自动含 Kimi；`KairosModelId` 与 `kairos/env.ts` allowlist 放开 `kimi-k2.6`，Kairos 设置页加 Kimi 选项与成本提示。
- **Phase 4 Kimi 余额卡**: `ipc.ts` 泛化出 `ProviderBalanceSnapshot` + `KimiBalanceSnapshot`；main 新增 `kimi:balance:get`（Moonshot `/v1/users/me/balance`）；preload/global.d.ts/WorkbenchLayout 接线；`UsageStatisticsPage` 的 `DeepSeekBalanceCard` 泛化为 `ProviderBalanceCard`，DeepSeek 与 Kimi 各一张卡。
- **测试与文档**: 新增 DSML guard 单测、Kimi 主模型 `$web_search` 循环单测；更新 model-config / kairos env / usage 页测试；同步双模型能力设计文档与决策记录，plan 归档至 completed。

### 🧠 Design Intent (Why)

- DSML 泄漏是 DeepSeek Anthropic 网关偶发问题（原生 tool-call token 没被转成结构化 `tool_use`）。当一次可重试错误处理，能在不解析私有标记的前提下快速止血，避免垃圾正文污染会话与统计。
- DeepSeek 降智时需要备用主模型；Kimi 提升为 public 即可复用既有 `buildLLMConfig` 路由（provider=kimi→OpenAI-compatible + Kimi key）。
- Kimi 主模型联网搜索沿用「provider 原生能力归 LLM service 层」的既定原则，与 DeepSeek server web search 对称，不经 ToolManager、不暴露本地 `web_search`，避免“Kimi 调 Kimi”的多余分层。
- 跨模型续聊由既有 `transform-messages` 归一兜底（thinking 降级、tool id/signature 标准化），无需额外改动。
- 余额按 provider 拆成独立卡，结构清晰且便于后续扩展。

### 📁 Files Modified

- `packages/agent-core/src/llm/anthropic-convert.ts`
- `packages/agent-core/src/llm/services/anthropic-messages.ts`
- `packages/agent-core/src/llm/services/openai-completions.ts`
- `packages/agent-core/src/llm/test/anthropic-dsml-guard.test.ts`
- `packages/agent-core/src/llm/test/kimi-service.test.ts`
- `packages/agent-core/src/kairos/env.ts`
- `packages/agent-core/src/kairos/test/env.test.ts`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/settings.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/test/model-config.test.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/exec-plans/completed/20260608-kimi-backup-and-dsml-guard.md`
