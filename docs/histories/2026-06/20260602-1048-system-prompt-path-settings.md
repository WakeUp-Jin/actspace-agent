## [2026-06-02 10:48] | Task: 收口主 Agent 系统提示词文件契约

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行：`shared` 契约已把 `AgentSettings` 迁到 `systemPromptPath`，需要让 `desktop` Settings 页面、main 和测试不再读写旧的 `agent.systemPrompt` 正文字段，并重新验证附件链路。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/desktop`, `docs`

**Key Actions:**

- **[Shared Contract]**: `AgentSettings` 只保留 `systemPromptPath`，并新增系统提示词文件读写 IPC 输入/输出类型。
- **[Settings Service]**: `SettingsService` 默认创建 `<userData>/prompts/main-agent.md`，兼容迁移旧 `agent.systemPrompt` 正文，并通过单独方法读写 prompt 文件。
- **[Settings UI]**: 设置页智能体分区通过 `readAgentSystemPrompt` / `writeAgentSystemPrompt` 加载和保存正文，不再把系统提示词正文写回 settings。
- **[Tests + Docs]**: 更新 Settings 页面和服务测试，并同步设置页规范中的配置生效说明。

### 🧠 Design Intent (Why)

系统提示词正文可能较长，也更接近可版本化的 prompt 资产；把正文从 `settings.json` 移到独立 prompt 文件后，settings 只负责保存路径和轻量配置。这样 renderer 不直接处理本地文件系统，真实 turn、Context describe 和设置页编辑也能共享同一份主系统提示词来源，避免契约漂移。

### 📁 Files Modified

- `packages/shared/src/settings.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `packages/desktop/src/main/test/settings-service.test.ts`
- `docs/design-docs/front-设置页规范.md`
