## [2026-06-04 19:47] | Task: Local update settings page

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望把「本地更新」从通用设置中单独放一页，并在设置导航「归档会话」下面显示「更新」入口。

### Changes Overview

**Scope:** desktop renderer settings UI, docs

**Key Actions:**

- **[Settings navigation]**: 在设置页左侧导航中新增「更新」分区，位置紧跟「归档会话」。
- **[Local update page]**: 将原「通用」里的本地更新分组迁移为独立「本地更新」页面，保留源码目录、安装目标、构建并更新三段式信息和原 IPC 行为。
- **[Regression tests]**: 更新 SettingsPage 测试，确认默认通用页不再加载本地更新状态，点击「更新」后才能选择目录并启动更新。
- **[Docs]**: 同步设置页规范中的信息架构和更新页说明。

### Design Intent (Why)

本地更新是维护工作流，不是日常偏好设置。把它独立成设置页中的专门页面，可以减少通用页负担，也让安装目标、当前进程和构建日志这些诊断信息有更稳定的展示空间。

### Files Modified

- `packages/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/design-docs/front-设置页规范.md`
