## [2026-06-02 10:08] | Task: 收口 AGENTS.md runtime loader

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行：把 `AGENTS.md` 加载抽成 main 侧小服务方便测试，并更新 Context describe 测试来匹配默认主系统提示词现在有内容。

### 🛠 Changes Overview

**Scope:** `packages/desktop/src/main`, `docs`

**Key Actions:**

- **[AGENTS.md Service]**: 新增 `agents-md-service.ts`，集中加载 `<userData>/AGENTS.md` 与 `<workspaceRoot>/AGENTS.md`，缺失跳过、读取失败 warning，并输出 `rules` system prompt segments。
- **[Runtime Context Wiring]**: `loadMainAgentRuntimeContext()` 继续作为真实 turn 与 `context:describe` 的共享装配入口，主系统提示词文件和 `AGENTS.md` rules 走同一链路。
- **[Context Describe Test]**: 更新 main 侧 Context describe 测试，不再假设默认主系统提示词为空，而是断言 `Main agent system prompt` entry 和非零 systemPrompt bucket。
- **[Tests]**: 新增 `agents-md-service.test.ts` 覆盖双源加载、缺失跳过和读取失败 warning。

### 🧠 Design Intent (Why)

`AGENTS.md` 属于运行时规则上下文，不应该散落在真实 turn 和 Context 检查视图各自的临时代码里。抽成 main 侧小服务后，读取策略可以独立测试；同时让 `context:describe` 复用真实 runtime context loader，避免右侧上下文视图展示的规则和 LLM 实际收到的规则不一致。

### 📁 Files Modified

- `packages/desktop/src/main/agents-md-service.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/test/agents-md-service.test.ts`
- `packages/desktop/src/main/test/context-describe-service.test.ts`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/exec-plans/active/20260527-agent-tool-capabilities-breakdown/01-bash-tool-choice-boundary.md`
- `docs/learnings/2026-06/runtime-inspection-reuses-runtime-loaders.md`
