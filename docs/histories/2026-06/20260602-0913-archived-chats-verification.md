## [2026-06-02 09:13] | Task: Archived chats verification closeout

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行验收。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs`

**Key Actions:**

- **[Test environment]**: Wrapped Testing Library `render` with the same `TooltipProvider` used by the renderer root, so component tests that render tooltip-enabled UI match the app runtime.
- **[Archived chats verification]**: Re-ran Sidebar and SettingsPage archive tests after the provider boundary fix; both archive interaction suites passed.
- **[Electron verification]**: Opened the real Electron development window, confirmed the active session archive button is disabled, non-active archive buttons are visible, and the Settings page loads archived chats through the real bridge.
- **[Docs sync]**: Updated Sidebar and SettingsPage design docs to reflect the implemented archive / restore flow, and marked the archived chats execution plan tasks complete.

### 🧠 Design Intent (Why)

The archive UI was already implemented, but renderer component tests rendered tooltip-enabled components outside the app-level provider and failed before archive assertions could run. Centralizing the provider in the test setup keeps individual tests small while matching production runtime boundaries.

The real Electron check intentionally stopped before clicking 「恢复」, because that action would mutate local user session state. Automated tests cover the restore IPC call and list refresh behavior.

Learning note: this reinforces the existing tooltip primitive lesson in `docs/learnings/2026-06/icon-button-tooltip-accessibility.md`; no separate learning document was added.

### 📁 Files Modified

- `packages/desktop/src/renderer/test/setup.ts`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/exec-plans/active/20260602-archived-chats.md`
- `docs/histories/2026-06/20260602-0913-archived-chats-verification.md`
