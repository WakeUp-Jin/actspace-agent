## [2026-08-08 10:53] | Task: 默认隐藏 Kairos

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> Kairos 当前效果一般，希望默认不显示、不启用，但在设置页保留一个按钮供用户主动开启。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`、`docs`

**Key Actions:**

- **功能门控**：新增默认关闭的 `settings.kairos.featureEnabled`，旧设置缺少字段时同样按关闭迁移，保留全部 Kairos 数据与配置。
- **生命周期**：功能关闭时持久化 `preferences.enabled=false`、停止并释放 Controller；开启功能只恢复入口和运行时能力，不自动启动自主循环。
- **入口与设置**：默认隐藏左侧栏、右侧对象启动页和对象菜单中的 Kairos；设置导航始终保留 Kairos，关闭时仅展示功能 Toggle。
- **回归保障**：覆盖设置默认值与迁移、配置暂停写入、设置页、侧栏和右侧入口门控。

### 🧠 Design Intent (Why)

将“产品能力是否开放”与“自主循环是否运行”建模为两层状态，既满足当前默认隐藏的产品判断，也避免隐藏功能后留下不可见后台任务，或重新开启入口时意外恢复有成本的自治循环。

### 📁 Files Modified

- `packages/shared/src/settings.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/kairos-ipc-internals.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`

### ✅ Validation

- Kairos 聚焦 Vitest：7 个文件、162 项测试通过。
- Desktop 全量 Vitest：94 个文件、763 项通过；`app-streaming-user-message.test.tsx` 仍有 2 个任务开始前已有的紧凑侧栏状态断言失败，与本次 Kairos 改动无关。
- `pnpm typecheck`
- `pnpm build`（通过；保留既有 Vite 大 chunk 警告）
- `pnpm check:docs`
- `pnpm check:frontend-theme`
- `git diff --check`
- 浏览器 renderer 实测：默认 Sidebar、右侧对象启动页和 `+` 菜单均无 Kairos，设置导航仍有 Kairos。
- `pnpm dev:log` 启动成功，renderer / shared / agent-core / Electron TypeScript 均为 0 编译错误；Computer Use 读取动态 Electron 窗口超时，因此真实设置持久化和 Controller 生命周期点击链路仍需人工验收。
