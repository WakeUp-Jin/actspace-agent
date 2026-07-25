## [2026-07-25 19:16] | Task: 隐藏 Lab 入口并修复 Kairos 配置加载

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> Lab 功能暂时不做，去掉侧栏按钮；同时修复 Kairos 设置页读取配置时提示 `kairos:read-config` 未注册的问题。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer / Electron main，以及 Lab / Kairos 设计文档。

**Key Actions:**

- **隐藏 Lab 入口**：移除 Sidebar 的 Lab 按钮与对应交互测试，保留 V0 页面、测试和设计资产供未来评估。
- **拆分 Kairos IPC 生命周期**：让配置读写通道在模型未配置时也常驻注册，不再依赖 Kairos Controller 创建成功。
- **补齐当前进程初始化**：用户选择可用 Kairos 模型后，即时创建 Controller 和运行态 IPC，不需重启应用。
- **增加回归覆盖**：覆盖无 Controller 时的配置缺失返回、JSON / Markdown 读写与非法 JSON 拒绝。

### 🧠 Design Intent (Why)

Kairos 设置页是创建运行时的前置控制面，不能反过来依赖运行时已经成功启动。将配置 IPC 与 Controller 生命周期解耦后，首次配置、模型失效和运行时重建都能保持可恢复。

### 📁 Files Modified

- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/kairos-ipc.ts`
- `packages/desktop/src/main/kairos-ipc-internals.ts`
- `packages/desktop/src/main/test/kairos-ipc-internals.test.ts`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/kairos/agent-kairos-autonomous-mode.md`
- `docs/design-docs/lab/README.md`
- `docs/design-docs/lab/lab-implementation-progress.md`

### ✅ Verification

- `pnpm --dir packages/desktop exec vitest run src/main/test/kairos-ipc-internals.test.ts src/renderer/test/sidebar.test.tsx src/renderer/test/kairos-config-files.test.tsx src/renderer/test/kairos-settings.test.tsx`
- `pnpm --dir packages/desktop test`（60 个测试文件，469 个测试通过）
- `pnpm typecheck`
- `pnpm build`
- `pnpm check:docs`
- `pnpm check:frontend-theme`
- `pnpm check:repo`
- Electron UI 由用户按请求手动验收，本轮不自动启动或操作桌面窗口。

### 📚 Learning

- `docs/learnings/2026-07/control-plane-must-not-depend-on-runtime-readiness.md`
