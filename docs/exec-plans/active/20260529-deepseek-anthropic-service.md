# DeepSeek Anthropic Service 与原生联网搜索接入计划

## 目标

在不删除现有 DeepSeek OpenAI-compatible 路线和 Kimi 辅助搜索路线的前提下，新增 DeepSeek Anthropic-compatible LLM service。第一阶段先让 DeepSeek 通过 Anthropic server tool 直接使用原生 `web_search_20250305`；后续阶段再把 Anthropic `tool_use/tool_result` 接入本地 ToolManager。

## 范围

- 包含：
  - 新增 `DeepSeekAnthropicService`，实现现有 `LLMService` 接口。
  - 新增 Anthropic Messages API 的 context/message/usage 转换函数。
  - 新增配置开关，让 DeepSeek provider 可选择 `openai` 或 `anthropic` API format。
  - 第一阶段默认在 Anthropic route 声明 server-side `web_search_20250305`。
  - 第一阶段避免 Kimi-backed 本地 `web_search` 与 Anthropic server `web_search` 同名冲突。
  - 补充单测、配置示例、设计文档和 history。
- 不包含：
  - 不删除 `DeepSeekService`、`KimiService`、Kimi assistant helper 或现有 Kimi-backed `web_search` executor。
  - 第一阶段不把本地 `read_file/grep/glob/bash` 等工具迁到 Anthropic `tool_use`。
  - 第一阶段不新增 provider format 的可视化切换控件。
  - 不把 Anthropic server tool result 作为本地 ToolManager 工具事件展示。

## 背景

- 相关文档：
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/design-docs/agent-core/deepseek-kimi-hybrid-capabilities.md`
  - `docs/SECURITY.md`
  - `docs/PLANS_GUIDE.md`
- 相关代码路径：
  - `packages/agent-core/src/llm/types.ts`
  - `packages/agent-core/src/llm/convert.ts`
  - `packages/agent-core/src/llm/factory.ts`
  - `packages/agent-core/src/llm/services/deepseek.ts`
  - `packages/agent-core/src/llm/services/kimi.ts`
  - `packages/agent-core/src/engine/create-agent-deps.ts`
  - `packages/agent-core/src/tools/index.ts`
  - `packages/agent-core/src/tools/exposure.ts`
  - `packages/agent-core/src/context/manager.ts`
  - `packages/agent-core/src/context/modules/conversation.ts`
- 已知约束：
  - `ToolManager` 保持 provider-neutral，不直接输出 OpenAI 或 Anthropic 私有协议格式。
  - API key 只在 main/agent-core 运行时读取，不能进入 renderer、session 事件或日志。
  - Anthropic server web search 是 provider-native server tool，不应由本地 ToolManager 执行。
  - Context 模块当前输出 provider-neutral `Context`，第一阶段不改其消息所有权，只在 LLM adapter 层转换。

## 目标架构

```txt
Agent / ContextManager
  -> provider-neutral Context(messages, tools, systemPrompt)
  -> LLMService

LLM services:
  DeepSeekService              OpenAI-compatible，现有路线
  DeepSeekAnthropicService     Anthropic-compatible，新增路线
  KimiService                  OpenAI-compatible + Kimi builtin，现有路线

ToolManager:
  继续维护本地工具定义和执行，不知道 OpenAI/Anthropic 协议细节。
```

## 阶段一：DeepSeek Anthropic + 原生 Web Search

1. 新增 `@anthropic-ai/sdk` 依赖到 `packages/agent-core/package.json`。
2. 在 `LLMConfig` 中新增 `apiFormat?: "openai" | "anthropic"`。
3. 在 env 中新增：
   - `DEEPSEEK_API_FORMAT=openai|anthropic`
   - `DEEPSEEK_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`
4. `buildLLMConfig()` 对 DeepSeek 读取 `DEEPSEEK_API_FORMAT` 与 Anthropic base URL。
5. `createLLMService()` 当 `provider=deepseek` 且 `apiFormat=anthropic` 时创建 `DeepSeekAnthropicService`。
6. 新增 `anthropic-convert.ts`：
   - `Context.systemPrompt -> system`
   - user text/image 内容 -> Anthropic content blocks
   - assistant text/thinking 历史 -> Anthropic assistant content blocks
   - 第一阶段跳过历史中的本地 `toolCall/toolResult`，避免生成不完整 Anthropic tool history
7. 新增 `DeepSeekAnthropicService`：
   - 使用 `@anthropic-ai/sdk`
   - 默认请求 `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]`
   - 解析 `thinking`、`text`、usage
   - 保留 `server_tool_use.web_search_requests` 作为真实响应观测字段，并映射到内部 usage metadata（`serverToolUse.webSearchRequests`），不混成本地工具事件
8. 当 `apiFormat=anthropic` 时，`ToolManager` 第一阶段不注册 Kimi-backed 本地 `web_search`，避免与 server tool 同名冲突。
9. 补单测：
   - factory 能选中 `DeepSeekAnthropicService`
   - Anthropic request 包含 `web_search_20250305`
   - text/thinking/usage 可被映射
   - `apiFormat=anthropic` 时本地 `web_search` 不暴露，普通本地工具仍保留

## 阶段二：Anthropic Tool Use 接入本地工具

1. 新增/启用 `toAnthropicClientTools(tools)`，把 provider-neutral `Tool` 转成 Anthropic client tool：
   - `name`
   - `description`
   - `input_schema`
2. `DeepSeekAnthropicService` 解析 `tool_use` content block 为内部 `ToolCallContent`。
3. Context 历史转换补齐：
   - assistant `ToolCallContent` -> Anthropic `tool_use`
   - internal `ToolResultMessage` -> Anthropic user `tool_result`
4. Agent loop 继续执行本地 ToolManager，不需要修改工具 scheduler 主流程。
5. 明确 server tool 与本地工具命名策略：
   - server web search 使用 provider-native `web_search`
   - 本地 Kimi-backed web search 在 Anthropic route 下默认关闭或改名后再暴露

## 阶段三：能力策略收口

1. 文档化三条稳定路线：
   - DeepSeek + OpenAI format：本地工具 + Kimi-backed `web_search`
   - DeepSeek + Anthropic format：DeepSeek server `web_search` + 本地工具 via Anthropic `tool_use`
   - Kimi：保留 Kimi 原生 builtin 能力
2. 已根据真实验证结果把 Anthropic format 设为 DeepSeek 默认路线，`DEEPSEEK_API_FORMAT=openai` 保留为临时回退开关。
3. 主 Agent 默认模型调整为 `deepseek-v4-pro` 且默认 thinking on；Kairos 默认模型独立为 `deepseek-v4-flash` 且默认 thinking on，可通过 `KAIROS_MODEL_ID` / `KAIROS_THINKING` 手动覆写。
4. 如前端需要，增加 provider format 显示或开发开关入口。
5. 更新质量评分与后续技术债。

## 风险

- 风险：Anthropic SDK 类型未内置 DeepSeek server web search 扩展。
  - 缓解方式：在 service 层使用窄范围本地类型或 `as any`，不污染公共类型。
- 风险：第一阶段跳过历史 toolCall/toolResult 会让已有本地工具调用历史不完整。
  - 缓解方式：仅在 Anthropic adapter 内跳过，并在第二阶段补完整回放；OpenAI route 不受影响。
- 风险：server `web_search` 和本地 `web_search` 同名，导致模型/协议混淆。
  - 缓解方式：第一阶段 Anthropic route 下不注册本地 Kimi-backed `web_search`。
- 风险：真实 API 返回 `server_tool_use` 但最终文本可能出现 DeepSeek 内部 DSML 片段。
  - 缓解方式：第一阶段单测锁定 usage/block 解析，真实验收时记录现象，不把 server tool result 映射成本地 tool event。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/shared build`
  - `pnpm --filter @actspace/agent-core build`
- 手工检查：
  - `DEEPSEEK_API_FORMAT=anthropic` 时 DeepSeek service 走 `https://api.deepseek.com/anthropic`。
  - Anthropic route 请求中包含 `web_search_20250305`。
  - 不配置 `DEEPSEEK_API_KEY` 时仍返回结构化 auth 错误。
- 观测检查：
  - 使用 `scripts/probe-deepseek-web-search.js` 或后续真实 turn 验证 `serverToolUse.webSearchRequests >= 1`。

## 进度记录

- [x] 通过真实探针确认 DeepSeek Anthropic-compatible route 支持 `server_tool_use` / `web_search_tool_result`。
- [x] 收敛分阶段方案：第一阶段只新增 Anthropic service 与 server web search。
- [x] 完成 active execution plan。
- [x] 完成阶段一实现。
- [x] 完成阶段一单测与类型检查。
- [x] 同步配置、设计、安全文档和 history。
- [x] 完成阶段二实现：Anthropic client tools、`tool_use` 解析、`tool_result` 历史回放。
- [x] 完成阶段二单测与 loop 链路测试。
- [x] 完成阶段三默认路由收口：主 Agent 与 Kairos 默认走 DeepSeek Anthropic route，OpenAI-compatible route 保留为显式回退。
- [x] 完成模型默认与 Kairos env 收口：主 Agent 默认 `deepseek-v4-pro` + thinking on；Kairos 默认 `deepseek-v4-flash` + thinking on。
- [x] 完成 provider-native server search 观测收口：`usage.serverToolUse.webSearchRequests/webFetchRequests` 进入 run/session usage metadata，并写入 agent-run assistant summary。

## 决策记录

- 2026-05-29：保留现有 DeepSeek OpenAI route 和 Kimi-backed `web_search`，新增 Anthropic route；原因是 Anthropic server web search 已实测可用，但本地工具迁移还需要独立处理 `tool_use/tool_result` 历史回放。
- 2026-05-29：第一阶段不改 ContextManager 本体，只新增 Anthropic adapter 转换；原因是 Context 当前已经是 provider-neutral，协议差异应留在 LLM service 边界。
- 2026-05-29：优先使用 `@anthropic-ai/sdk`，必要时在 service 内局部放宽 server tool 类型；原因是后续 streaming、tool_use 和 Messages API 维护会比手写 fetch 更稳定。
- 2026-05-29：第二阶段继续不改 ContextManager 和 ToolManager 主流程，只在 Anthropic adapter 中转换 client tool、`tool_use` 与 `tool_result`；原因是内部消息结构已经足够表达工具调用，协议差异不应上移到 context 模块。
- 2026-05-29：Anthropic route 下仍不暴露 Kimi-backed 本地 `web_search`，server `web_search_20250305` 继续承担联网搜索；原因是避免同名工具导致模型和协议混淆。
- 2026-05-29：DeepSeek 默认 route 切到 Anthropic-compatible，并让 Kairos ToolManager 使用同一 `apiFormat`；原因是实测 server web search 可用，且默认链路应避免继续依赖 Kimi-backed 搜索。`DEEPSEEK_API_FORMAT=openai` 保留为故障回退，不删除旧 service。
- 2026-05-29：主 Agent 默认模型切到 `deepseek-v4-pro`，Kairos 默认模型保持独立的 `deepseek-v4-flash`，两者都默认启用 thinking；原因是主交互优先保证搜索触发和推理质量，后台自治优先控制成本但仍保留规划能力。
- 2026-05-29：把 Anthropic `usage.server_tool_use` 映射到内部 usage metadata，而不是本地工具事件；原因是 provider-native server tool 不由 ToolManager 执行，但真实触发次数需要能在 session usage 和 agent-run summary 中观察。
