## [2026-08-01 22:00] | Task: 增加全局快捷唤起

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex Desktop

### 📥 User Query

> 在设置中增加快捷键区域，从其他应用快速唤起紧凑 Actspace 窗口；支持默认工作区、默认会话和首项目降级，并自动聚焦输入框。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/desktop`、`docs`

**Key Actions:**

- **设置与注册**：增加快捷键设置分区、组合键录制、启停、目标选择和冲突反馈；main 进程负责系统注册与退出清理。
- **快速路由**：支持指定会话恢复、指定工作区新建、侧边栏首项目降级和无项目空 New chat。
- **紧凑窗口**：快捷唤起复用主窗口，收敛到约 640px 宽并聚焦 Composer。
- **可靠性**：待处理 request 由 renderer 显式消费，覆盖窗口首次加载和实时唤起；增加注册、设置迁移、路由、设置 UI 与焦点测试。

### 🧠 Design Intent (Why)

把系统级副作用留在 Electron main，把会话与工作区导航留在现有 renderer 状态机；通过先注册后持久化的顺序避免“配置已保存但快捷键不可用”。

### 📁 Files Modified

- `packages/shared/src/settings.ts`
- `packages/desktop/src/main/quick-open-shortcut-controller.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/quick-open-routing.ts`
- `packages/desktop/src/renderer/components/settings/ShortcutSettings.tsx`
- `packages/desktop/src/renderer/App.tsx`

### ✅ Validation

- `pnpm --filter @actspace/shared build`
- 快捷键相关定向 Vitest：5 个文件、60 项测试通过。
- App 无 preload bridge 的降级回归测试：1 项测试通过。
- `pnpm typecheck`
- `pnpm build`
- `pnpm check:frontend-theme`
- `pnpm check:docs`
- `git diff --check`
- Electron 开发日志确认默认快捷键注册成功；按用户要求，跨应用唤起、深浅主题与窗口视觉由用户手动验收。
- 扩展回归中 `sidebar.test.tsx` 的 39 项测试通过；当前混合工作区的 `app-streaming-user-message.test.tsx` 仍有 2 项既有布局断言失败（紧凑布局下未找到侧边栏等待审批/失败状态按钮），本任务未扩大范围修改。
