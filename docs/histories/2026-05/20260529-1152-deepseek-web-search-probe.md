## [2026-05-29 11:52] | Task: DeepSeek 联网搜索探针脚本

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 研究 DeepSeek 是否支持联网搜索，并在 `scripts/` 下写一个 JS 脚本，同时测试 Anthropic 格式和 OpenAI 格式。

### 🛠 Changes Overview

**Scope:** `scripts`, `docs/histories`

**Key Actions:**

- **[Probe Script]**: 新增 `scripts/probe-deepseek-web-search.js`，用原生 `fetch` 分别请求 DeepSeek Anthropic-compatible Messages API 与 OpenAI-compatible Chat Completions API。
- **[Diagnostics]**: 输出状态码、响应摘要、Anthropic block types、OpenAI annotations/tool_calls，并给出当前请求是否看起来触发了供应商原生搜索的判断。
- **[Key Hygiene]**: 脚本只从 `DEEPSEEK_API_KEY` 读取密钥，输出时脱敏 Authorization header，不写入本地日志或结果文件。

### 🧠 Design Intent (Why)

DeepSeek 的普通聊天兼容 OpenAI 格式，但供应商原生联网搜索能力涉及不同协议的 server tool 支持。把 Anthropic `web_search_20250305` 和 OpenAI `web_search_options` 放进同一个可复现探针里，可以直接用真实 key 验证“支持、拒绝、忽略”三种情况，避免只靠文档字段猜测。

### 📁 Files Modified

- `scripts/probe-deepseek-web-search.js`
- `docs/histories/2026-05/20260529-1152-deepseek-web-search-probe.md`
