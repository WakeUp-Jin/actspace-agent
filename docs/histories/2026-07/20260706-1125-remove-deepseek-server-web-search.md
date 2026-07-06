# [2026-07-06 11:25] | Task: 移除 DeepSeek server web search，联网搜索统一走 Kimi-backed 本地 web_search

## 🤖 Execution Context

- **Agent ID**: Cursor Agent
- **Base Model**: Fable 5
- **Runtime**: Cursor IDE (macOS)

## 📥 User Query

> DeepSeek Anthropic 路线一跑「搜索 + 后续本地工具调用」就 DSML 泄漏整轮失败（session-mr8mkw9b-in655o，自动重试 3 次全败）。把关键词搜索和 URL 解析合并为一个 `web_search`（直接用 Kimi 封装好的 `$web_search`），前端统一显示 `Web Search xxxx`；无 Kimi key 时和 `analyze_media` 一样不暴露工具，executor 内保留缺 key 失败信息作兜底；同步更新 design-docs。

## 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/desktop`、`docs/`

**Key Actions:**

- **移除 DSML 泄漏触发器**: `AnthropicMessagesService` 不再声明 DeepSeek server tool `web_search_20250305`（删除 `providerNativeTools` / `createAnthropicWebSearchTool` / `PROVIDER_NATIVE_TOOL_NAMES` 过滤），请求 tools 只含 client tools。日志证实泄漏稳定发生在「server 搜索 + 本地工具混用」的轮次，网关根因修不了，移除混用场景等效修复。DSML guard 与 LLM 自动重试保留作二道防线；历史 session 的 `server_tool_use` 响应块处理不变。
- **联网搜索统一**: 两条 DeepSeek 路线都走 Kimi-backed 本地 `web_search`（`query` 关键词搜索 / `url` 读网页双模式，`$web_search` 内置 search + crawl）。`exposure.ts` 删除 anthropic 特例，回归纯 `hasKimiKey` 门控（与 `analyze_media` 一致：无 key 不注册）。
- **缺 key 兜底**: executor 开头检查 `env.KIMI_API_KEY`，为空时不发请求，返回结构化失败信息（原因 + 指导模型告知用户配置 key + 本轮禁止重试约束）；Kimi 401/403 认证失败附加「key 可能无效或过期」提示。
- **前端统一显示**: `bridge.ts` 两处 displayText 构造统一为 `Web Search <query 或 url>`（原 url 模式为 `Read Web Page ...`），`mode` 字段与 shared 类型不动，渲染层零改动。
- **测试**: 新增 `web-search-executor.test.ts`（缺 key 兜底 / 认证提示 / 正常搜索）；翻转 exposure、create-agent-deps、kairos-bootstrap 中 anthropic 路线的暴露期望；anthropic service 测试改为断言不含 server tool；agent-core 745 通过、desktop 380 通过，双包 typecheck 干净。

## 🧠 Design Intent (Why)

搜索本身没坏——故障轮次里 server 搜索每次都成功，失败在搜索后模型发起本地 bash 调用时网关把 DSML 工具标记吐成正文，重试只是重复烧 token（每次约 1.7 万 input tokens）。触发器（server tool 与本地工具混用）在我们手里，直接移除比解析 DeepSeek 私有 DSML 格式恢复更稳。关键词搜索和 URL 读取不拆两个工具：Kimi `$web_search` 原生同时具备 search + crawl，单工具双模式已够用（对比 claude code / opencode 的双工具方案，本仓库无需引入本地 fetch + HTML 转换链路）。无 key 时不暴露工具（避免模型反复调用必败能力），executor 兜底错误防御手动构造 ToolManager 漏传门控的场景。

## 📁 Files Modified

- `packages/agent-core/src/llm/services/anthropic-messages.ts`
- `packages/agent-core/src/llm/anthropic-convert.ts`
- `packages/agent-core/src/llm/index.ts`
- `packages/agent-core/src/tools/exposure.ts`
- `packages/agent-core/src/tools/tools/web-search/executor.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/tools/test/web-search-executor.test.ts`（新增）
- `packages/agent-core/src/tools/test/exposure.test.ts`
- `packages/agent-core/src/engine/test/create-agent-deps.test.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/agent-core/src/llm/test/deepseek-anthropic-service.test.ts`
- `packages/agent-core/src/llm/test/anthropic-convert.test.ts`
- `packages/desktop/src/main/kairos-bootstrap.ts`
- `packages/desktop/src/main/test/kairos-bootstrap.test.ts`
- `docs/design-docs/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/design-docs/agent-tool-preview-design-guidelines.md`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
