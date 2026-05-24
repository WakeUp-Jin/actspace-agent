## [2026-05-24 00:21] | Task: create session flow

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 实现 `New chat` 最小闭环：点击后立即创建本地空会话，左侧列表新增并选中，中间消息区清空，后续发送消息使用新的 `sessionId`。mock 数据保留为无 Electron bridge 时的兜底。

### Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs`

**Key Actions:**

- **Shared contract**: 新增 `SessionCreateInput`，作为 renderer/preload/main 之间创建会话的类型契约。
- **Persistence**: 新增 `createSessionRecord()`，基于本地 session root 创建 `meta.json`、空 `session.jsonl` 和 `attachments/`。
- **IPC bridge**: 新增 `session:create` 通道，preload 暴露 `createSession()`。
- **Renderer wiring**: `New chat` 和 section 小按钮接入创建逻辑，创建成功后刷新会话、切换 active session、清空旧 turn 状态。
- **Mock fallback**: 浏览器 mock 模式下创建前端空会话，避免缺少 preload 时阻断 UI 验证。
- **Session switching**: 补齐会话列表点击切换，把 active session 更新和会话内容恢复接到统一状态流。
- **Demo data scope**: 将 Composer 里的图片与 `README.md` demo 附件限制到 `Learning doc plan` 示例会话，新建会话默认不再显示模拟附件。
- **Docs**: 更新架构文档中的 IPC 和创建会话数据流。

### Design Intent (Why)

创建会话必须先成为独立闭环，否则发送消息会继续复用旧的 `sessionId`，导致用户看到“新建会话”按钮但数据仍写入旧会话。采用“点击即落盘”的方式可以让 UI 状态、本地目录和后续 Agent turn 的 `sessionId` 保持一致；mock fallback 则保证浏览器样式验收仍可独立进行。

### Verification

- `pnpm --filter @actspace/agent-core test`
- `pnpm typecheck`

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/index.ts`
- `packages/agent-core/src/persistence/test/session-store.test.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `docs/ARCHITECTURE.md`
