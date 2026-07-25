## [2026-06-04 13:36] | Task: Restore Session Hover Preview Bridge

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户发现 main 分支状态异常：运行时 mock 数据疑似没有清理干净，且当前会话顶部悬浮详情卡不存在；需要确认是否合并时误删代码并修复。

### Changes Overview

**Scope:** `packages/desktop`, `docs/design-docs`

**Key Actions:**

- **[App bridge]**: 在 `App.tsx` 恢复顶部当前会话 hover preview 的真实 bridge resolver，并传给 `WorkbenchLayout`。
- **[No runtime fixture rollback]**: 保持 runtime mock fixture 清理结果，只在 Electron preload 存在时调用 `window.actspace.getSessionPreview`。
- **[Regression test]**: 补充 App 集成测试，覆盖顶部标题 hover 后会调用 `getSessionPreview` 并展示 workspace、模型和 context 信息。
- **[Docs sync]**: 更新 Composer 规范中旧的 demo `Review +4253 -5` 文案，改为 Review V1 的真实 Git summary 语义。

### Design Intent

清理 runtime mock 数据后，产品路径不能再依赖 renderer fixture；但顶部当前会话详情卡仍应通过真实 IPC 获取 session preview。修复只恢复 App 到 preload 的接线，不恢复任何运行时假数据，避免把 `codex/mock-delete` 的目标回滚掉。

Review V1 已接入真实 Git provider，Composer 规范继续保留旧 demo 数字会误导后续实现，所以同轮同步文档。

### Files Modified

- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
