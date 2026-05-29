## [2026-05-29 12:00] | Task: Follow-up Composer Bar

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 调整 Composer 输入框到参考图中的 follow-up bar 形态：保留品牌蓝，加入 Review / overflow 预留层、`+` command menu、状态行，并修复模型菜单 edit 入口。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer Composer UI and tests, frontend design docs, execution plan docs.

**Key Actions:**

- **[Composer UI]**: 将 Composer 默认态改为上方 Review demo、中央 follow-up 输入栏、下方 branch / Local / context usage 状态行的三层结构。
- **[Command Menu]**: 将左侧 `+` 改为 command menu 入口，第一版展示 Plan、Debug、Multitask、Ask、Image、Models、Skills、MCP Servers demo 项。
- **[Model Menu]**: 将模型 edit 入口与 `supportsThinkingToggle` 解耦，让 `deepseek-v4-flash` 也可显示 edit；2026-05-29 后 flash 支持 Thinking toggle，options 面板会显示 Thinking 开关。
- **[Interaction Hardening]**: 让当前选中的模型行稳定显示 `Edit`，同时保留 hover / focus 显示逻辑；`Edit` 保持可接收 pointer，避免 hover 过渡或测试环境事件差异导致入口不可点。
- **[Attachments]**: 保持附件区位于 Review 操作层下方、输入栏上方；图片继续显示缩略图，文件改为同一附件区内的轻量文件 chip，不进入 Review 行或输入文字行。
- **[Tests]**: 新增 Composer 专项测试，覆盖 follow-up shell、`+` 菜单、浮层互斥、模型 edit 和发送。
- **[Docs]**: 将 Composer 计划和设计文档同步为 follow-up bar 方向。
- **[Verification]**: 运行 Composer 专项测试和 desktop typecheck；用浏览器 mock 验证 `+` 菜单、模型菜单互斥、附件区位置和 `deepseek-v4-flash` options 入口。

### 🧠 Design Intent (Why)

参考图表达的是低高度 follow-up command bar，而不是原来的大块多行输入卡片。新的结构把复杂能力收到 `+` 菜单里，让消息流保持主视觉，同时预留未来 review 操作区和状态行，减少后续接附件、Context、review 交互时的布局返工。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/design-docs/frontend-ui/前端设计文档.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/01-composer-visual-and-model-menu.md`
- `docs/exec-plans/active/20260527-frontend-interaction-polish/README.md`
- `docs/learnings/2026-05/hover-actions-need-stable-hit-targets.md`
