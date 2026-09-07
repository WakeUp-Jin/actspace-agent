## [2026-08-30 23:11] | Task: 收敛 Session 持久化事实源与投影运行时

### 🤖 Execution Context

- **Agent ID**: `Codex / root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 执行已批准的 Session 持久化事实源与 Projection 计划，让 ActSpace 对齐 DSH 的 Session-bound snapshot、revision、Trajectory 和 Client projection 使用方式，同时保持工具具体执行逻辑不变。

### 🛠 Changes Overview

**Scope:** `@actspace/shared`、`@actspace/session-projection`、`@actspace/session-projection-cache`、`@actspace/session-persistence`、`@actspace/client`、Desktop main/preload/renderer，以及对应设计和执行记录。

**Key Actions:**

- **Projection contract**：增加带 `sessionId`、`throughJournalSeq`、`schemaVersion` 的公共 revision/snapshot/change 类型，复用 Journal-owned Surface。
- **Projection registry/cache**：实现 per-session projection cells、纯 fold、change feed、checkpoint、restore floor 和 stateVersion 失效；cache 可删除且不改变 Journal 真相。
- **Client runtime**：增加 framework-neutral `ClientSessionStore`、live overlay、stale response/gap/runtime identity 处理和 projection selectors。
- **Desktop bridge**：增加 typed projection snapshot/live IPC envelope，App 当前 Session identity 改为显式 `selectedSessionId`。
- **Product projections**：增加 provider usage、request context estimate、composer phase 和同源 Trajectory projection。
- **Renderer consumers**：新增 `SessionProjectionProvider`，让 Workbench 的 Composer phase、durable Surface message count、Context snapshot 和 Trajectory 读取 Client selectors；Right Panel 已启用只读 Trajectory UI。
- **运行器兼容性**：移除新增 Projection/Cache 路径对 `Array.prototype.at` 的依赖，并重建跨包 dist，修复 Compaction 在旧 Node 测试运行器中的回归。

### 🧠 Design Intent (Why)

Session Journal 是唯一持久化事实源，UI、Context、Usage、Composer 和 Trajectory 都是带一致水位的投影。通过 revision-bound store 丢弃旧异步结果，通过可删除 cache 加速冷读取但不改变恢复语义，通过纯 registry 避免 Provider、Electron 和 React 反向耦合。工具 executor、LLM wire、事件物理格式和 UI 视觉样式均未在本轮重写。

### 📁 Files Modified

- `packages/shared/src/runtime-v2/projection.ts`
- `packages/shared/src/runtime-v2/fixed-renderer.ts`
- `packages/session/projection/src/projection.ts`
- `packages/session/projection/src/registry.ts`
- `packages/session/projection/src/product-projections.ts`
- `packages/session/projection/src/trajectory.ts`
- `packages/session/projection-cache/src/**`
- `packages/client/src/sessions/**`
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/session/**`
- `apps/desktop/src/renderer/App.tsx`
- `docs/exec-plans/active/20260830-actspace-session-persistence-projection/**`
- `docs/exec-runs/20260830-actspace-session-persistence-projection-p00/**`
- `docs/exec-runs/20260830-actspace-session-persistence-projection-p01/**`
- `docs/exec-runs/20260830-actspace-session-persistence-projection-p02/**`
- `docs/exec-runs/20260830-actspace-session-persistence-projection-p03/**`

### ✅ Verification

- Shared, Client, Session Projection, Projection Cache、Session Persistence、Runtime、Headless typecheck passed。
- Projection、Cache、Persistence、Client tests passed；Desktop projection/bridge 定向 tests passed。
- `pnpm run check:current-docs`、`pnpm run check:docs`、`git diff --check` passed。

### ⏳ Remaining Gates

P02/P03 的基础通道和首批 renderer consumers 已落地；Conversation 富消息 adapter、真实 Electron reload/quit/flush、真实 Provider 和人工 UI 验收仍待后续 G1 收口。Context popup/Session hover 已可从当前 Session selector 取得投影 fallback，但仍保留既有 props/resolver 兼容接口。Desktop 全量回归现为 80 个测试文件、529 个 tests 通过。
