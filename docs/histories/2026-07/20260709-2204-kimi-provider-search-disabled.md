# Kimi 主模型停用 provider-native 搜索

## 用户诉求

Kimi 主模型不用再挂 provider-native `$web_search`，现有本地 `web_search` / `web_fetch` 工具已经够用，搜索能力应统一走工具系统。

## 主要改动

- 移除 `OpenAICompletionsService` 中 Kimi 主入口自动追加 `builtin_function.$web_search` 的逻辑。
- 删除 Kimi `$web_search` 的内部回填循环、builtin tool call 过滤和跨轮 serverToolUse 累加。
- Kimi OpenAI-compatible 请求不再发送 `thinking: { type: "disabled" }`；只有 `thinkingEnabled === true` 时发送 `thinking: { type: "enabled" }`。
- 更新 Kimi service 测试，锁定默认不声明 builtin `$web_search`、不发送 disabled thinking。
- 同步设计文档，把 Kimi 主模型搜索路径收敛为本地 `web_search` / `web_fetch` 工具。

## 设计动机

Provider-native `$web_search` 会让搜索链路分叉：一部分搜索隐藏在 LLM service 内部，一部分搜索走本地 ToolManager。统一使用本地工具后，key 门控、工具预览、失败诊断、日志和模型行为都更一致，也避免 `kimi-k2.7-code` 因不接受 `thinking: disabled` 而在普通 turn 开始阶段直接报 400。

## 受影响文件

- `packages/agent-core/src/llm/services/openai-completions.ts`
- `packages/agent-core/src/llm/types.ts`
- `packages/agent-core/src/llm/test/kimi-service.test.ts`
- `docs/design-docs/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/design-docs/agent-web-tools.md`
