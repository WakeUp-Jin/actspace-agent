## [2026-08-31 23:58] | Task: 设置页面标题层级与默认模型职责收口

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 检查所有设置页面的标题层级，尤其是通用设置，并把任务默认模型、媒体默认选择放到通用；模型页面参考 Maka 的职责划分。

### 🛠 Changes Overview

- 新增 `PageShell`，统一设置页面使用一个 `h2` 页面标题。
- `SectionShell` 作为页面分组使用 `h3`，`SettingGroup` 默认使用 `h4`，通用页的顶层分组显式使用 `h3`。
- 模型页移除任务模型选择器，只保留 Provider 连接和模型目录；任务默认模型选择器迁移到通用页。
- 图片生成、图片分析配置入口迁移到通用页，模型页不再承载这些默认行为选择。
- Usage 空状态标题改为 `h2`，补充设置页标题契约测试和模型启用状态测试。

### 🧠 Design Intent (Why)

页面标题层级与 Maka 的设置语法保持一致，同时避免把 Provider、模型目录和应用默认行为混在一个页面。模型数据层仍可共享连接、凭据和能力定义，但用户按任务影响范围查找默认行为。

### ✅ Verification

- 设置页与 Provider/Model 设置测试已补充并通过其新增断言。
- 全量桌面测试仍受工作区已有的 `session-store` 和 Sidebar 测试失败影响，与本次设置页面改动无直接关系。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/components/settings/PluginsSettings.tsx`
- `apps/desktop/src/renderer/components/settings/SkillsSettings.tsx`
- `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `apps/desktop/src/renderer/test/settings-page.test.tsx`
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `docs/design-docs/frontend/front-设置中心重构规范.md`
- `docs/exec-plans/active/20260830-actspace-settings-center-refactor/README.md`
