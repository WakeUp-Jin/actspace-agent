## [2026-05-25 10:46] | Task: Centralize agent prompts

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 希望在 agent-core 下单独创建 prompt 文件夹，用于集中管理提示词，并为提示词补充注释，方便以后查找和修改。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, `docs`

**Key Actions:**

- **Centralized prompts**: 新增 `packages/agent-core/src/prompt/`，集中放置主 Agent 与 Kimi 辅助能力的系统提示词。
- **Updated imports**: 将桌面端主 Agent 初始化和 Kimi assistant client 改为从统一 prompt 模块读取提示词。
- **Documented boundary**: 在架构文档中补充 `prompt/` 模块职责和提示词维护边界。

### 🧠 Design Intent (Why)

将稳定提示词从调用逻辑中抽离，形成单一、可发现、可版本化的维护入口。这样后续修改提示词时不需要在 LLM、工具或桌面入口中搜索硬编码字符串，也能减少误把动态上下文、工具协议或配置写入 prompt 的风险。

### 📁 Files Modified

- `packages/agent-core/src/prompt/main-agent.ts`
- `packages/agent-core/src/prompt/kimi-assistants/web-search.ts`
- `packages/agent-core/src/prompt/kimi-assistants/web-fetch.ts`
- `packages/agent-core/src/prompt/kimi-assistants/analyze-media.ts`
- `packages/agent-core/src/prompt/index.ts`
- `packages/agent-core/src/llm/kimi-assistants/client.ts`
- `packages/desktop/src/main/index.ts`
- `docs/ARCHITECTURE.md`
