## [2026-07-25 22:33] | Task: 浏览器工具渐进式披露

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 浏览器系列工具不应在用户不使用浏览器时全部展示和注入上下文；希望提供一个浏览器入口，再渐进披露完整工具包。

### 🛠 Changes Overview

**Scope:** `packages/agent-core` 工具与执行循环、`packages/desktop` runtime context / 设置页，以及 Browser / Frontend 设计文档。

**Key Actions:**

- **注册态与暴露态分离**：ToolManager 稳定注册全部 executor，默认只导出 `browser_help` definition；隐藏工具在披露前按不存在拒绝执行。
- **下一次调用再展开**：gateway 成功后先写 pending disclosure，Agent Loop 到下一次 LLM 调用前才提交完整 Browser group，避免同一批 tool calls 意外放行隐藏工具。
- **Turn 级重置**：每次 `Agent.run()` 和 Kairos tick 开始时恢复为单入口；Context usage、Context 详情与手动 compact 统一使用当前可见 definitions。
- **设置页收敛**：浏览器改成一个总开关，执行工具和敏感 capability 默认折叠；关闭总开关保留子项偏好，并关闭 Browser prompt / Socket runtime 注入。
- **回归覆盖**：补充 ToolManager、Agent Loop、Browser Socket、runtime context 和设置页测试。

### 🧠 Design Intent (Why)

工具 executor 的生命周期与模型 schema 的生命周期不是同一件事。稳定注册保证权限、Socket 和 disposer 不反复构造；动态暴露减少普通 Turn 的工具 token 和选择噪声。使用 pending → commit 两阶段，则把能力披露严格绑定到下一次模型请求，而不是当前 assistant 已经生成的整批调用。

### 📁 Files Modified

- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/tools/browser/definition.ts`
- `packages/agent-core/src/engine/agent.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/engine/compact-context.ts`
- `packages/agent-core/src/kairos/runner.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/components/settings/tool-catalog.ts`
- `docs/design-docs/browser/agent-browser-use-index.md`
- `docs/design-docs/browser/agent-browser-use-integration-design.md`
- `docs/design-docs/frontend/front-设置页规范.md`

### ✅ Verification

- 定向 Agent Core 回归：32/32 通过；Browser Socket 回归：13/13 通过。
- 定向 Desktop 回归：24/24 通过。
- 全量 `pnpm test`：169 个测试文件、1376 个测试全部通过。
- `pnpm typecheck`、`pnpm build`、`pnpm check:browser`、`pnpm check:docs`、`pnpm check:frontend-theme`、`pnpm check:repo`、`git diff --check` 全部通过。
- 未启动 Desktop / Electron 做界面验收；按用户约定，浏览器总开关、默认折叠和交互状态由用户手工验证。

### 📚 Learning

- `docs/learnings/2026-07/20260725-progressive-tool-disclosure.html`
