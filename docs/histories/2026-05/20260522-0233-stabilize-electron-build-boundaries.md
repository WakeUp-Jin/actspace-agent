## [2026-05-22 02:33] | Task: stabilize electron build boundaries

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用最稳定、最佳的方案修复桌面端启动链，不要只打补丁改错误产物路径。

### 🛠 Changes Overview

**Scope:** `packages/shared`, `packages/agent-core`, `packages/desktop`, `docs/`

**Key Actions:**

- **[收紧包边界]**: 将 `desktop` 和 `agent-core` 从直接引用 sibling `src/` 改为通过 `@actspace/shared` / `@actspace/agent-core` 消费标准包入口。
- **[稳定构建产物]**: 调整 `shared`、`agent-core` 为稳定的 CommonJS `dist/` 产物入口，并为 `desktop` 的 Electron 编译关闭根级源码路径映射。
- **[修复开发启动链]**: 为 `desktop` 增加 `build:deps`、`dev:shared`、`dev:agent-core`，让开发态先具备可消费产物，再启动 Electron main/preload。
- **[验证结果]**: `pnpm typecheck` 通过，且 `build:deps + build:electron + wait-on dist-electron/main/index.js` 已确认命中正确产物。

### 🧠 Design Intent (Why)

此前的问题不是“没编译”，而是桌面端 Electron 编译把 `shared` 和 `agent-core` 源码一起卷进来了，导致输出路径漂移，`wait-on` 一直在等不存在的文件。继续追着错误产物路径打补丁只能暂时止血。最稳定的方案是恢复正常 monorepo 包边界：库包先产出标准 `dist/`，桌面端再通过包入口消费，这样 `dist-electron/main/index.js` 才会长期稳定。

### 📁 Files Modified

- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/agent-core/package.json`
- `packages/agent-core/tsconfig.json`
- `packages/agent-core/src/index.ts`
- `packages/agent-core/src/agent.ts`
- `packages/agent-core/src/context.ts`
- `packages/agent-core/src/persistence.ts`
- `packages/agent-core/src/types.ts`
- `packages/desktop/package.json`
- `packages/desktop/tsconfig.json`
- `packages/desktop/tsconfig.electron.json`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/App.tsx`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/CICD.md`
- `docs/histories/2026-05/20260522-0233-stabilize-electron-build-boundaries.md`
