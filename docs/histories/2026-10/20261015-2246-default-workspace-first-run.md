## [2026-10-15 22:46] | Task: 默认工作区改为首次启动兜底

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS）`

### 📥 User Query

> 现在的会话会有一个默认的会话，我之前设计的，我觉得不够好，应该是要用户自己创建的吧。参考 deepseek-harness、Codex、opencode、Cursor，没有任何 Project 时怎么使用？

### 🛠 Changes Overview

**Scope:** `packages/shared`、`apps/desktop`（main、renderer、mock）、`docs`

**Key Actions:**

- **首次启动兜底**：registry 一个工作区都没有时才创建 `~/Documents/ActSpace/default-workspace`，登记成普通工作区「默认工作区」；可移除，移除后不重建；旧的 Downloads 默认项读取时丢弃。
- **不再静默回退**：去掉 `kind: "default"` / `defaultWorkspaceId`；没有工作区时新建会话页不能发送，提示「请先选择工作区」。
- **不再自动建空会话**：移除/归档工作区没有可切会话时回到新建会话页。
- **旧会话**：没有路径也匹配不到工作区的本地会话不在侧栏显示，不写删除逻辑。
- **顺带修复**：工作区列表不再等会话目录加载；侧栏不再把已移除工作区的空文件夹加回来。
- **Mock**：新增 `?mock=no-workspace`。

### 🧠 Design Intent (Why)

特殊的默认工作区（指向 Downloads、不可移除、每次读取都补回）让用户分不清会话落在哪，也删不掉。参考 DSH：只在首次启动没有任何工作区时给一个普通的兜底目录，之后完全由用户管理；用户把工作区都移除了就明确提示选择，而不是偷偷再建一个。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/workspace-registry-service.ts`
- `apps/desktop/src/main/workspace-access.ts`
- `apps/desktop/src/main/test/workspace-registry-service.test.ts`
- `apps/desktop/src/main/test/workspace-access.test.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/components/composer/composer-run-context.ts`
- `apps/desktop/src/renderer/components/settings/ShortcutSettings.tsx`
- `apps/desktop/src/renderer/components/sidebar/WorkspaceSection.tsx`
- `apps/desktop/src/renderer/components/sidebar/session-grouping.ts`
- `apps/desktop/src/renderer/quick-open-routing.ts`
- `apps/desktop/src/renderer/target/readiness.ts`
- `apps/desktop/src/renderer/mock/{handlers,mock-db}.ts`、`mock/scenarios/{empty,index}.ts`
- `apps/desktop/src/renderer/test/*`（夹具补 `workspaceRoot`、新行为断言）
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/exec-plans/completed/20261015-default-workspace-first-run.md`、`docs/exec-plans/README.md`
- `docs/exec-runs/20261015-default-workspace-first-run/`
