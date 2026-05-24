# DeepSeek + Kimi 混合能力接入

## 用户诉求

希望 `actspace` 首版只支持 DeepSeek 与 Kimi：Kimi 可作为主模型直接使用联网搜索和多模态；DeepSeek 作为主模型时，如果配置 Kimi key，则通过 Kimi 辅助补齐联网搜索、网页读取和媒体识别，没有 Kimi key 时隐藏这些能力。

## 主要改动

- 新增 Kimi env 契约：`KIMI_API_KEY`、`KIMI_BASE_URL`、`KIMI_MODEL`，并让 `envToLLMConfig()` 支持 `LLM_PROVIDER=kimi`。
- 新增 `KimiService` 与共享 OpenAI-compatible SSE 解析 helper，复用 DeepSeek/Kimi 的流式解析、tool call 重组、usage 映射和错误分类。
- 新增 `packages/agent-core/src/llm/kimi-assistants/`，把 `web-search`、`web-fetch`、`analyze-media` 三个 Kimi 子调用提示词版本化。
- 在 `ToolDefinitionSpec` 上新增 `exposeOnlyTo?: "deepseek" | "kimi"`，并用 `shouldExposeTool()` 做一次性工具注册过滤。
- 新增 DeepSeek-only 工具：`web_search`、`web_fetch`、`analyze_media`。DeepSeek 只看到应用级工具名，Kimi `$web_search` 和多模态 content parts 被封在 executor/provider 内部。
- 桌面端创建 ToolManager 时传入当前主模型和 `hasKimiKey`，让无 Kimi key 的 DeepSeek 会话不暴露联网与媒体工具。
- 更新 `.env.example`、架构、安全、可靠性和后端测试文档。

## 设计动机

这次没有做复杂 Capability Router，而是把“谁能看到哪个工具”压缩成一个工具定义字段和一个筛选函数。Kimi 原生能力属于 provider request builder，DeepSeek 补能力则通过普通 ToolManager 工具暴露，这样主模型看到的是稳定产品能力，不会被供应商协议污染。

## 验证

- `pnpm --filter @actspace/agent-core test`：104 tests passed。
- `pnpm typecheck`：shared、agent-core、desktop 均通过。

## 关键文件

- `packages/agent-core/src/llm/services/kimi.ts`
- `packages/agent-core/src/llm/services/openai-compatible.ts`
- `packages/agent-core/src/llm/kimi-assistants/`
- `packages/agent-core/src/tools/exposure.ts`
- `packages/agent-core/src/tools/tools/web-search/`
- `packages/agent-core/src/tools/tools/web-fetch/`
- `packages/agent-core/src/tools/tools/analyze-media/`
- `docs/design-docs/agent-core/deepseek-kimi-hybrid-capabilities.md`
