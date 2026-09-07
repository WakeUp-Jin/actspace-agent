## [2026-09-03 00:39] | Task: 收紧设置页分组与视觉层级

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 设置中心不只需要调整工具页；通用、外观、模型等页面也要采用更简洁的分组与行式布局，并解释 Ink & Emerald 的含义。

### 🛠 Changes Overview

**Scope:** `apps/desktop` renderer settings UI and its focused tests.

**Key Actions:**

- **[Shared syntax]**: 收紧 PageShell、SectionShell、SettingGroup 和 SettingRow 的字号、间距与容器样式，使用浅色分组底加 hairline 行分隔，避免白卡套白卡。
- **[Information architecture]**: 工具页按代码库、终端、联网、浏览器和多媒体分组，其中联网合并搜索开关与搜索服务；通用页收拢为个人偏好、Agent 指令、任务默认、媒体默认和快捷键；归档页直接展示已归档列表，去掉重复的页面说明与“会话列表”层。
- **[Interaction density]**: 通用页的个人偏好和 Agent 指令默认以行式摘要呈现，编辑器按需展开；回复参数归入任务默认，未实现的界面语言选择器不再显示。
- **[Cross-page polish]**: 同步模型、服务商、外观、快捷键、扩展、Skills 和归档行项目的密度与控件对比度，保留 operational / danger 等语义色职责。
- **[Verification]**: 更新标题层级测试，确保每个普通设置页只有一个 h2，并覆盖工具分组的简化结构。

### 🧠 Design Intent (Why)

设置页的复杂感主要来自同一语义被页面标题、Section 标题和卡片标题重复表达，以及每个分组都使用高对比卡片。新的语法把页面标题作为唯一入口，分组只承担用户任务边界，组内使用连续行和细分隔线，让用户能够快速扫描而不牺牲说明、状态和操作入口。

颜色继续遵守 Ink & Emerald：中性灰阶承担背景、选中和层级；ink action 只用于主要确认；emerald 只表示启用、已连接、运行健康和成功，不把设置页变成黑绿主题。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/components/settings/PluginsSettings.tsx`
- `apps/desktop/src/renderer/components/settings/SkillsSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ShortcutSettings.tsx`
- `apps/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/design-docs/frontend/front-设置中心重构规范.md`
- `docs/histories/2026-09/20260903-0039-settings-page-grouping-visual-density.md`

### ✅ Verification

- `pnpm check:frontend-theme` 通过。
- `pnpm --filter @actspace/desktop run build:renderer` 通过。
- 设置页与 Provider/Model 定向测试：42/42 通过，其中设置页测试 25/25。
- `pnpm --filter @actspace/desktop typecheck` 通过。
- 曾启动 `pnpm dev:log` 检查真实 Electron 链路，Vite 与 preload 启动成功；临时开发 bundle 未被 Computer Use 的应用发现接口识别，因此未把自动化截图当作完成凭据。
