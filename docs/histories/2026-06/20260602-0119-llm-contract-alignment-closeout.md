## [2026-06-02 01:19] | Task: 收口 LLM 契约对齐计划

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行 LLM 契约对齐收尾：只做仓库内事实同步，不再碰协议代码本身；更新模块地图和 DeepSeek/Kimi 混合能力文档，归档 execution plan，并补 history 与 learning。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/exec-plans`, `docs/histories`, `docs/learnings`

**Key Actions:**

- **[Design Doc Sync]**: 将 LLM 服务层事实口径从品牌 service 职责改为 `AnthropicMessagesService` / `OpenAICompletionsService` 协议实现层 + Kimi 内部 helper。
- **[Hybrid Capability Sync]**: 明确 Kimi 现在是 `internal` helper provider，不再作为公开主模型选项；DeepSeek 公开模型列表只保留 `flash` / `pro`。
- **[Plan Closeout]**: 将 `20260601-pi-style-llm-contract-alignment.md` 从 `active/` 迁到 `completed/`，并勾完进度记录。
- **[Learning]**: 新增一篇学习文档，总结 `api/provider` 分层和 public/internal 模型收口的可迁移模式。

### 🧠 Design Intent (Why)

这轮收口的核心不是再改协议代码，而是避免文档继续把 `DeepSeekService`、`DeepSeekAnthropicService`、`KimiService` 描述成主要职责边界。当前实现已经转向 `api` 驱动的协议服务分层，`provider` 只表达供应商身份、凭据和默认端点，Kimi 也从公开主模型变成内部辅助能力。把这些事实落回文档和 completed plan，能让后续 Agent 不再沿旧品牌 service 路径继续扩展。

### 📁 Files Modified

- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/model-context/agent-deepseek-kimi-hybrid-capabilities.md`
- `docs/exec-plans/completed/20260601-pi-style-llm-contract-alignment.md`
- `docs/exec-plans/active/20260601-pi-style-llm-contract-alignment.md`
- `docs/histories/2026-06/20260602-0119-llm-contract-alignment-closeout.md`
- `docs/learnings/2026-06/20260602-api-provider-boundary-public-internal.md`
