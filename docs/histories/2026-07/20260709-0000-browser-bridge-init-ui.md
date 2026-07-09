## [2026-07-09 00:00] | Task: wire Browser Bridge initialization

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 用户确认 Browser Bridge 首阶段应按设计通过 bash 调 `abb`，并要求参考 fs-watch 初始化方式，把 browser-bridge 的初始化链路接进 ActSpace。

### 🛠 Changes Overview

**Scope:** desktop main / preload / renderer settings / shared IPC contracts / docs

**Key Actions:**

- **Main service**: 新增 `BrowserBridgeService`，负责从 `actspace-plugins/plugins/browser-bridge/` 构建安装 `abb`、注册 Native Messaging host、读取 `doctor` 与 `capabilities` 状态。
- **IPC contract**: 新增 browser-bridge 状态、安装和 native host 初始化相关共享类型与 IPC/preload bridge。
- **Settings UI**: 设置页「插件」分区新增 `browser-bridge（Browser Use）` 卡片，展示安装状态、`abb` 路径、Chrome extension 目录与 doctor checks。
- **Design sync**: 在 Browser Bridge 设计文档补充 v0 初始化流程，明确它不同于 fs-watch 的 spawn/heartbeat 模型。

### 🧠 Design Intent (Why)

原设计要求首阶段站在 self-describing CLI 边界：ActSpace 先提供受控初始化和状态检查，让 Agent 继续通过 bash 调 `abb`。Browser Bridge 的 host 生命周期由 Chrome Native Messaging 管理，因此不套用 fs-watch 的常驻进程守护模型。

### 📁 Files Modified

- `packages/shared/src/plugins.ts`
- `packages/desktop/src/main/plugins/browser-bridge-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/settings/PluginsSettings.tsx`
- `packages/desktop/src/renderer/components/settings/fs-watch-shared.ts`
- `docs/design-docs/agent-browser-bridge-design.md`
- `docs/histories/2026-07/20260709-0000-browser-bridge-init-ui.md`
