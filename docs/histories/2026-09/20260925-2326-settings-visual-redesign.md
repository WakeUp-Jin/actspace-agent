## [2026-09-25 23:26] | Task: 设置中心视觉重设计

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（后台会话，交互模式）`

### 📥 User Query

> 觉得设置页样式有问题、不好看，先讨论并做 demo HTML；确认后选内嵌分组、翡翠绿开关，把联网搜索通道单独拿出来放到「能力 → 搜索」，使用统计只微调，搜索通道不要 logo；随后要求按计划执行。

### 🛠 Changes Overview

**Scope:** `apps/desktop` renderer 设置中心、主题 token、前端设计文档

**Key Actions:**

- **基础部件统一**：`SettingsPrimitives` 改为内嵌分组、统一行高与控件（按钮、下拉、输入框、开关、步进器），新增链接行、行内编辑器、状态点、行内提醒、标签、键帽、管理菜单与底部“已保存”提示。
- **新增「搜索」页**：`web_search` 开关与四个搜索通道从工具页移出；Key 在行下展开输入，已连接显示管理菜单；工具页与搜索页共用 `useToolToggle`。
- **逐页改造**：通用（模型与生成失焦即保存、Explore 改为跳转、语音与快捷键改为即时保存）、外观（主题缩略图 + 字体预览）、模型列表与连接详情、工具（从属行、显示分组）、子 Agent（可直接选 Explore 模型）、归档、更新。
- **使用统计微调**：分段时间范围、白底指标卡与琥珀提醒、标签缩短、搜索图标、统一状态下拉、“显示明细”、表头底色与状态点。
- **token**：新增 `--act-color-toggle-off` 与外观缩略图专用 `--act-preview-*`。

### 🧠 Design Intent (Why)

旧设置页分组底色与页面几乎同色、分组标题比行标题还弱、控件和保存方式各不相同，导致“丑且不清楚”。按用户确认的 demo 统一视觉语法后，每一页只用同一套部件；搜索服务与模型服务同属外部连接，独立成页更好找。没有数据支撑的 demo 内容（子 Agent 启用开关与思考级别、搜索 Key 预检测试、连接测试历史）未实现。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsNav.tsx`
- `apps/desktop/src/renderer/components/settings/SearchSettings.tsx`（新增）
- `apps/desktop/src/renderer/components/settings/useToolToggle.ts`（新增）
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ModelPurposeSelect.tsx`
- `apps/desktop/src/renderer/components/settings/ShortcutSettings.tsx`
- `apps/desktop/src/renderer/components/settings/SpeechSettingsSection.tsx`
- `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `apps/desktop/src/renderer/styles/tokens.css`、`tailwind.css`、`scripts/check-frontend-theme-colors.mjs`
- `apps/desktop/src/renderer/test/`：`settings-primitives`、`search-settings`（新增），`settings-page`、`provider-model-settings`、`english-learning`、`usage-statistics-page`、`settings-color-semantics`（更新），`fixtures/settings-preview.*`（新增）
- `docs/design-docs/frontend/`：`settings-redesign-demo.html`（新增）、`front-设置中心重构规范.md`、`front-全局视觉语言规范.md`、`front-主题与配色规范.md`、`README.md`

### 📚 Learning

未单独写学习文档：本次主要是既有模式（portal 菜单规避 `overflow-hidden`、语义 token）的应用，只有“主题缩略图需要固定色、放进只定义一次的 token”一条新约定，已写入《主题与配色规范》合法例外。
