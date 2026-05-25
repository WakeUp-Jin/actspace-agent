## [2026-05-25 17:05] | Task: configurable tool disable

### 🤖 Execution Context

- **Agent ID**: `Codex GPT-5`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 现在工具是如何注册，我需要取消注册一个工具如何取消呢？后续要求改成可配置取消，适合长期维护。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`, `packages/desktop`, `docs`

**Key Actions:**

- **Configurable disable path**: 为 `ToolManager` 配置新增 `disabledTools`，让工具在注册阶段即可按名称跳过。
- **Env-driven runtime wiring**: 新增 `ACTSPACE_DISABLED_TOOLS` 环境变量，并由桌面端主进程解析后传入 `createToolManager()`。
- **Coverage and docs**: 补充工具暴露测试、env 解析测试，以及 `.env.example`、可靠性、安全文档说明。

### 🧠 Design Intent (Why)

把“取消注册工具”做成注册阶段的统一配置，比事后隐藏或执行时拒绝更稳。这样模型看不到被禁用工具，前后端工具定义也保持一致，后续接 UI 设置或会话级配置时只需要复用同一条 `disabledTools` 通路。

### 📁 Files Modified

- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/tools/test/exposure.test.ts`
- `packages/agent-core/src/test/env.test.ts`
- `packages/desktop/src/main/index.ts`
- `.env.example`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
