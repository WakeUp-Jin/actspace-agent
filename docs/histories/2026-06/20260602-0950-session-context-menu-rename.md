## [2026-06-02 09:50] | Task: 会话右键菜单与重命名

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 给会话列表增加鼠标右键菜单，包含 Pin、Rename、Archive，并支持会话重命名。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs`

**Key Actions:**

- **[Session Rename Contract]**: 新增 `SessionRenameInput/Result`、`session:rename` IPC、preload bridge 与 `window.actspace.renameSession` 类型。
- **[Persistence]**: 新增 `setSessionTitle`，复用 `meta.json` 的 `title` 字段并拒绝空标题。
- **[Sidebar UI]**: 会话行支持右键菜单 `Pin / Rename / Archive`；`Rename` 进入原地输入态，支持 `Enter` 保存、`Esc` 取消、失焦保存。
- **[State Sync]**: 重命名成功后刷新 session list，并同步当前 `sessionRecord.meta.title`，确保左栏与窗口标题同时更新。
- **[Tests]**: 补充 persistence rename 测试与 sidebar 右键重命名单测。
- **[Docs]**: 更新左侧会话栏规范中的右键菜单、重命名行为和后端契约。

### 🧠 Design Intent (Why)

右键菜单承载低频但重要的会话管理动作，不挤占高密度侧栏空间；Rename 采用原地编辑而不是弹窗，减少上下文切换，并让用户明确知道正在改哪条会话。Pin 和 Archive 继续复用既有行为边界，避免新增一套状态语义。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/index.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/agent-core/src/persistence/test/session-store.test.ts`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `docs/design-docs/front-左侧会话栏规范.md`
