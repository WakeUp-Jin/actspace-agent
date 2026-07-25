## [2026-06-02 09:27] | Task: Delayed workspace switch

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 顶部 Workspace 选择不应每选一次就迁移 session；用户可多次选择，发送消息时再把最终选择写入当前 session。

### Changes Overview

**Scope:** `packages/desktop`, `docs/design-docs`, `docs/histories`

**Key Actions:**

- **Deferred workspace persistence**: 顶部 Workspace 下拉只更新 renderer 本地选中值；发送消息前若最终选择与当前 session meta 不同，先写 `session:set-workspace`，再执行 `agent:run-turn`。
- **Turn workspace source**: main 侧 turn 编排读取当前 session `meta.workspaceRoot`，缺省时回退应用默认 workspace root，保证工具根目录跟随会话归属。
- **Workspace file preview**: 右侧文件树接收当前选中 workspace root，并在目录列出与文件读取 IPC 中透传该根目录。
- **Composer workspace selector**: 初始态 Composer 复用 App 聚合出的 workspace options，显示当前选中 workspace label，并在菜单中提供同一组选项；`Default workspace` 以应用默认 root 作为 value，避免空 root 丢失或写入哨兵值。
- **Verification coverage**: 新增/更新 renderer 测试，锁定“选择不立即写、发送时才写”和文件树 workspaceRoot 透传行为。

### Design Intent (Why)

Workspace 选择属于用户发送前的准备态，可能被多次调整；把每次选择都写入 session meta 会制造不必要的持久化 churn，也会让 session 归属在没有真实 turn 的情况下跳动。改为发送时提交最终选择，可以让 UI 预览新 workspace，同时保持 session 事实只在真正使用该 workspace 时更新。

### Files Modified

- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/WorkspaceFileTree.tsx`
- `packages/desktop/src/renderer/styles/electron.css`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `packages/desktop/src/renderer/test/workspace-file-tree.test.tsx`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
