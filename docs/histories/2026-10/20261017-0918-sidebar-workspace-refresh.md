## [2026-10-17 09:18] | Task: 新登记的工作区不出现在侧栏

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS）`

### 📥 User Query

> 我创建工作区的时候，侧边栏不会出现，但默认首页的下拉列表里却有。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer）

**Key Actions:**

- **原因**：`selectWorkspaceDirectory({ registerWorkspace: true })` 在 main 里已经把目录写进 registry，但 renderer 没有重新读取工作区列表。侧栏只读 registry，所以看不到；Composer 下拉框还会额外合入「当前选中的目录」，所以能看到。以前「添加工作区」会立刻建会话并顺带刷新 registry，改成首条消息发送时才建会话以后，这次刷新就没了。重启应用后才会出现。
- **修复**：新增 `pickAndRegisterWorkspace`，选完目录后立即 `refreshWorkspaces()`。侧栏「添加工作区」、Composer「使用已有文件夹…」、切换模式时补选工作区这三处都改用它。
- **测试**：新增 `app-workspace-register.test.tsx`，覆盖 Composer 和侧栏两个入口。修复前失败，修复后通过。

### 📁 Files Modified

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/test/app-workspace-register.test.tsx`（新增）
