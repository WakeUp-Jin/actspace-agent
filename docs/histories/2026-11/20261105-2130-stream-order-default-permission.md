## [2026-11-05 21:30] | Task: 流式残留段修复、新会话默认权限

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 消息流里有几段文字一直以流式样式挂着闪动；新会话开始前没有地方选权限模式，参考 Cursor 放进设置，默认「自动」，发出第一条消息后仍在底部状态行切换。

### 🛠 Changes Overview

**Scope:** `apps/desktop/src/main`、`apps/desktop/src/renderer/components/settings`、`packages/util/shared/src/settings.ts`、`docs/design-docs/frontend`

**Key Actions:**

- **流式残留段**：`fixed-renderer-ipc` 在发出任何非 chunk 的 journal 事件前，先冲刷正文增量通道（`flushRendererStream`）。此前只有正文通道会先冲刷 journal 通道，反过来没有：一步结束时「消息已完成」先到、最后 33ms 内的增量后到，renderer 把迟到的增量画成新的流式段，挂到整轮结束。
- **新会话默认权限**：`SettingsV4General.defaultPermissionMode`（缺省 `default`，即「自动」）；`sessions.create` 对本机新建的 Agent 形态会话按它写入 `permission/mode-set`，Chat 形态不写；设置 → 通用新增「新会话 › 默认权限」下拉，选「完全权限」先确认。状态行的权限控件只改当前会话。
- **测试**：journal 消息不得超过之前的增量；create 按设置写权限（Agent / Chat / 缺省）；设置页下拉、确认、失败保留弹窗；设置快照补新字段。

### 🧠 Design Intent (Why)

两条合并通道必须互相保证顺序，单向冲刷不够。权限是每个新会话开跑前就要定的东西，新建页没有会话可挂控件，放进设置作为默认值最简单，也和 Cursor 一致；「完全权限」作为默认值影响面大，所以保留确认。

### 📁 Files Modified

- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`、`test/runtime-v2-live-batching-ipc.test.ts`、`test/runtime-v2-worktree-create.test.ts`、`test/runtime-v2-workspace-picker.test.ts`、`test/fixtures/settings/expected/*.json`
- `apps/desktop/src/main/settings/defaults.ts`、`settings/migrations.ts`、`packages/util/shared/src/settings.ts`
- `apps/desktop/src/renderer/components/settings/sections/SessionDefaultsSection.tsx`（新增）、`settings/SettingsPage.tsx`、`workbench/PermissionModeControl.tsx`、`test/session-defaults-settings.test.tsx`（新增）
- `docs/design-docs/frontend/front-设置页规范.md`、`front-聊天输入框规范.md`
