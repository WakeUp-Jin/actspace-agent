## [2026-05-29 13:36] | Task: DeepSeek Anthropic Service

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 新增 DeepSeek Anthropic-compatible service，先直接使用 Anthropic 格式下的原生 web search；保留现有 OpenAI-compatible 路线和 Kimi 辅助搜索路线，后续再分阶段讨论工具格式转换。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, repository docs, env template

**Key Actions:**

- **新增 service**: 增加 `DeepSeekAnthropicService`，通过 `@anthropic-ai/sdk` 调用 DeepSeek Anthropic Messages API。
- **新增协议适配**: 增加 Anthropic context/message/usage 转换函数，第一阶段只转换文本、图片和 thinking，暂不回放本地 tool history。
- **配置路由**: 增加 `DEEPSEEK_API_FORMAT=openai|anthropic` 与 `DEEPSEEK_ANTHROPIC_BASE_URL`，DeepSeek provider 可按格式选择服务类。
- **工具边界**: DeepSeek Anthropic 路线下默认声明 server `web_search_20250305`，并隐藏 Kimi-backed 本地 `web_search`，避免同名搜索入口冲突。
- **测试覆盖**: 增加 factory、service、转换函数、env、工具暴露等单测，锁定 Anthropic route 的阶段一行为。
- **阶段二工具接入**: 将 provider-neutral 本地工具转换为 Anthropic client tools，解析 `tool_use` 为内部工具调用，并把工具执行结果回放为 user `tool_result`。
- **循环验证**: 增加 DeepSeek Anthropic 工具 loop 测试，覆盖 `tool_use -> ToolManager -> tool_result -> final` 的完整本地链路。
- **默认路由收口**: DeepSeek 默认切到 Anthropic-compatible route，主 Agent 与 Kairos 都沿用同一 `apiFormat`；`DEEPSEEK_API_FORMAT=openai` 保留为旧 OpenAI-compatible route 的手动回退开关。
- **模型默认收口**: 主 Agent 默认模型切到 `deepseek-v4-pro` 且默认开启 thinking；`deepseek-v4-flash` 也暴露 Thinking toggle。Kairos 模型独立通过 env 控制，默认 `KAIROS_MODEL_ID=deepseek-v4-flash`、`KAIROS_THINKING=true`。
- **搜索观测增强**: 将 Anthropic `usage.server_tool_use` 映射为内部 `serverToolUse.webSearchRequests/webFetchRequests`，进入 run/session usage metadata 和 agent-run assistant summary，避免把 provider-native 搜索误判成本地 ToolManager 工具。

### 🧠 Design Intent (Why)

DeepSeek 的 Anthropic-compatible API 已经能通过 server tool 执行联网搜索，因此第一阶段不再把搜索包装成应用级 Kimi 工具。这样可以保留现有 OpenAI-compatible + Kimi 辅助路线，同时给 DeepSeek 增加一条更直接的 provider-native 搜索路线。Context 和 ToolManager 继续保持 provider-neutral，Anthropic 私有协议集中在 LLM service adapter 内，后续再单独补本地 `tool_use/tool_result` 历史回放。

阶段二继续沿用同一边界：Context 仍然只保存内部 `ToolCallContent` / `ToolResultMessage`，ToolManager 仍然只执行内部工具；Anthropic 的 `tool_use/tool_result` 只在 adapter 层进出。这样 DeepSeek Anthropic route 可以使用本地文件、grep、bash 等工具，同时 provider-native `web_search_20250305` 继续保留为联网搜索入口。

默认路由收口后，DeepSeek 在主 Agent 和 Kairos 中都会优先使用 Anthropic-compatible service。Kairos 的 ToolManager 工厂会用实际 LLM config 的 `apiFormat` 注册工具，因此默认不会再暴露 Kimi-backed 本地 `web_search`；只有显式设置 `DEEPSEEK_API_FORMAT=openai` 时，旧 DeepSeek OpenAI-compatible + Kimi 辅助搜索路径才会恢复。

模型默认值现在分成两层：主 Agent 面向用户即时交互，默认 `deepseek-v4-pro` + thinking on；Kairos 面向后台自治，默认独立使用 `deepseek-v4-flash` + thinking on，并允许通过 env 手动覆写。Anthropic provider-native 搜索是否真实触发，则通过 usage metadata 和 agent-run summary 的 `serverToolUse` 计数观察，而不是依赖本地 `toolCallCount`。

### 📁 Files Modified

- `packages/agent-core/package.json`
- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/messages.ts`
- `packages/agent-core/src/adapters.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/agent-core/src/engine/test/deepseek-anthropic-tool-loop.test.ts`
- `packages/agent-core/src/kairos/env.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/agent-core/src/kairos/test/env.test.ts`
- `packages/agent-core/src/kairos/test/runner.test.ts`
- `packages/agent-core/src/llm/types.ts`
- `packages/agent-core/src/llm/factory.ts`
- `packages/agent-core/src/llm/index.ts`
- `packages/agent-core/src/llm/anthropic-convert.ts`
- `packages/agent-core/src/llm/services/deepseek-anthropic.ts`
- `packages/agent-core/src/tools/exposure.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/llm/test/anthropic-convert.test.ts`
- `packages/agent-core/src/llm/test/deepseek-anthropic-service.test.ts`
- `packages/agent-core/src/llm/test/factory.test.ts`
- `packages/agent-core/src/engine/test/create-agent-deps.test.ts`
- `packages/agent-core/src/test/env.test.ts`
- `packages/agent-core/src/tools/test/exposure.test.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/main/test/kairos-bootstrap.test.ts`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/session.ts`
- `.env.example`
- `docs/exec-plans/active/20260529-deepseek-anthropic-service.md`
- `docs/design-docs/agent-core/deepseek-kimi-hybrid-capabilities.md`
- `docs/SECURITY.md`
- `docs/learnings/2026-05/provider-native-vs-agent-tools.md`
- `pnpm-lock.yaml`
