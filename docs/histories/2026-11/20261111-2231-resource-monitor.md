## [2026-11-11 22:31] | Task: 资源监控悬浮窗与「资源占用」页

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI (macOS)`

### 📥 User Query

> 做一个资源监控：能看到 ActSpace 的 CPU、内存、主线程和进程占用，用来本地排查性能；替换侧栏那行不稳定的性能文字；数字要准，监控本身不能成为累赘。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（main / renderer / public）、`packages/util/shared`、`scripts/`、`docs/`

**Key Actions:**

- **采集器**：`ResourceCollector` 按订阅计数启停，2 秒一次；CPU 由 `cumulativeCPUUsage` 增量算单核百分比，主线程延迟用 `monitorEventLoopDelay`；Agent 子进程每 6 秒 `ps` 一次（只读进程名），采集器和 `ps` 的开销归到「监控自身」，不计入合计。
- **悬浮窗**：常驻最上层、可拖动的小窗（`public/monitor/` 静态页，复用主 preload），一行读数，展开看 5 分钟曲线和进程表；主进程 4 秒无推送显示「主进程无响应」；位置写 `resource-monitor-window.json`。
- **设置页**：系统组新增「资源占用」（悬浮窗开关、三张指标卡、分组进程表、复制快照，macOS 快照附 footprint）。
- **删除**：侧栏 / 设置导航底部的性能文字、`performance` IPC 域及其测试；IPC 契约改为 `resourceMonitor`。
- **主窗口**：`activate` 改为判断主窗口是否存在，非 macOS 关主窗口时一并关悬浮窗。

### 🧠 Design Intent (Why)

旧面板常驻采集、口径不清（CPU 按核数归一）、位置占地方。新方案把口径写死（100% = 1 核、内存含共享页），开销显式列出、不看时完全不采集；悬浮窗让人在任意操作时都能盯着读数。

### 📁 Files Modified

- `apps/desktop/src/main/resource-monitor/*`、`apps/desktop/src/main/index.ts`、`apps/desktop/src/main/ipc/guards.ts`
- `apps/desktop/public/monitor/*`
- `apps/desktop/src/renderer/components/settings/resources/*`、`SettingsNav.tsx`、`SettingsPage.tsx`、`Sidebar.tsx`、`WorkbenchLayout.tsx`
- `packages/util/shared/src/resource-monitor.ts`、`desktop-bridge/contract.ts`
- `scripts/check-ipc-channels.mjs`、`scripts/check-frontend-design-tokens.mjs`
- `docs/design-docs/frontend/front-资源监控规范.md` 等前端规范、`docs/releases/feature-release-notes.md`
