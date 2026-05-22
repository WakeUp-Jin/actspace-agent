## [2026-05-22 00:20] | Task: 完成 actspace 集成与验收闭环

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续完成最后一份执行计划，把 actspace 的集成与验收计划落地，并按规则归档到 completed。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `packages/shared`, `packages/agent-core`, `docs/exec-plans`, `docs/histories`

**Key Actions:**

- **[Session IPC]**: 新增 `session:list`、`session:get` 和恢复所需共享契约，补齐 renderer 与 main 的查询接口。
- **[Persistence recovery]**: 为 `agent-core` 增加 session 列表读取、session record 恢复和动态 turnCount 计算，支持本地重载。
- **[Renderer restore flow]**: 左侧会话栏改为读取真实本地 session 列表，应用启动时优先恢复本地会话，无历史时再触发 mock turn。
- **[Acceptance closure]**: 通过 `pnpm typecheck` 与 `pnpm build` 验证集成链路，并将最后一份 active plan 归档到 completed。

### 🧠 Design Intent (Why)

最后这份计划的本质不是再加一个孤立功能，而是让前面已经完成的 foundation、runtime 和 workbench UI 真正形成可验收系统。只有当应用能查询本地 session、恢复消息流、并通过统一 IPC 取回 turn 数据时，`actspace` 才达到了“可运行骨架”的完整定义。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `docs/exec-plans/active/actspace-v1-integration-and-acceptance.md`
- `docs/exec-plans/README.md`
- `docs/histories/2026-05/20260522-0020-integration-acceptance-complete.md`
