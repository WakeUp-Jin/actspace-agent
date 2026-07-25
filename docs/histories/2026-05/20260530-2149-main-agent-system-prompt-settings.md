## [2026-05-30 21:49] | Task: 主 Agent 系统提示词设置

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 在设置页智能体部分增加主 Agent 的系统提示词修改能力；本轮只做主 Agent，不做 Kairos。设置页里的「自定义系统提示词」就是主 Agent 当前使用的完整系统提示词。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs/design-docs`

**Key Actions:**

- **[Settings 契约]**: `AppSettings.agent` 新增 `systemPrompt`，由 SettingsService 持久化到 `settings.json`，首次默认值来自代码里的 `MAIN_AGENT_SYSTEM_PROMPT`。
- **[Agent 注入]**: `buildAgentConfig` 支持接收主 Agent 当前完整 `systemPrompt`，`createAgentFromConfig` / `createAgentForSession` 均以该值初始化 `SystemPromptContext`。
- **[Desktop wiring]**: 主 Agent turn 和 Context 详情重建都从 SettingsService 读取同一份系统提示词，保证真实调用和上下文查看一致。
- **[Settings UI]**: 设置页「智能体」新增「主 Agent / 自定义系统提示词」大文本编辑区，带字符计数、保存、撤销更改；Kairos 设置保留在下方不动。
- **[UI 调整]**: 根据试用反馈将系统提示词 textarea 默认高度收窄到约一半，并保留内部滚动与手动 resize。
- **[Tests]**: 覆盖 SettingsService 持久化、Agent runtime 注入、设置页编辑保存交互。

### 🧠 Design Intent (Why)

本轮采用「一个完整系统提示词」语义，而不是「内置 prompt + 用户附加规则」分层。这样 UI 显示什么，主 Agent 后续就使用什么；代码默认 prompt 只作为首次 settings 播种来源，保存后以本机设置为事实源。

### 📁 Files Modified

- `packages/shared/src/settings.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/context-describe-service.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
