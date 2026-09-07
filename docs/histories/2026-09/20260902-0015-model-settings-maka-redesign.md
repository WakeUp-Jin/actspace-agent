## [2026-09-02 00:15] | Task: 重做 Maka 风格模型设置页

### 🤖 Execution Context

- **Agent ID**: `codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 参考 Maka 的模型设置页面，重新设计 ActSpace 模型设置页，并先完成设计规范、执行计划和实现。

### 🛠 Changes Overview

**Scope:** `apps/desktop` 设置前端、模型设置设计文档与执行记录。

**Key Actions:**

- **模型连接列表**：将 Provider 大卡片改为扁平连接行，首屏只展示连接状态和模型启用摘要。
- **页面路由**：添加连接进入服务商目录，配置和编辑改为页面内路由，避免继续使用旧的中心弹窗布局。
- **连接详情**：使用 Maka 风格的分隔设置行，并将模型目录按 Provider 嵌入详情页。
- **标题层级**：模型页使用单个 h2，连接与模型分组使用 h3/h4，模型页内容宽度提升至 880px。
- **回归测试**：更新卡片/弹窗断言，覆盖目录筛选、Escape 返回、详情余额、扁平列表和标题契约。
- **列表交互收口**：移除列表行内测试、编辑、移除按钮，改为整行点击与右侧箭头；管理动作只在详情页提供。
- **品牌与额度**：接入 DeepSeek、Kimi、OpenRouter 品牌 Logo；余额改为详情页紧凑分隔行，保留刷新、失败和上次结果。
- **模型选择**：详情页嵌入模型管理改为可搜索、可全选的多选下拉，避免逐项 Toggle 堆叠。
- **回归护栏**：增加列表无操作按钮断言，并修正路由箭头返回、详情编辑和移除流程测试。
- **详情页收敛**：移除 Provider 详情外层 SectionShell、顶部操作组和独立额度条，改为页面级 h2 下的 Provider 路由头、h4 双栏分区、紧凑余额行与底部删除区。
- **模型操作**：详情内只保留测试连接和模型多选；更新模型目录以禁用态占位，避免在没有对应 IPC 能力时伪造成功行为。

### 🧠 Design Intent (Why)

旧实现虽然增加了路由状态，但仍把旧卡片和弹窗包在路由里，导致视觉结构没有真正变化。本次按 Maka 的页面语法重做容器和交互：列表负责浏览，目录负责选择，配置负责输入，详情负责持续管理；余额、地址、代理和模型启用状态只在详情中出现，降低首屏噪声并保持后续扩展空间。进一步对照 Maka 源码后，列表交互收敛为整行选择，品牌图形和模型多选器也作为一等组件落地。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/components/settings/ModelSettings.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `apps/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`
- `docs/exec-plans/active/20260901-actspace-model-settings-maka-redesign/README.md`
- `docs/exec-runs/20260901-actspace-model-settings-maka-redesign/`

### 2026-09-03 追加验证

- `provider-model-settings.test.tsx` 已补充详情页标题层级、双栏分区、无顶部操作组和模型多选回归断言。
- Provider 设置测试 16/16 通过。SettingsPage 测试仍有一组既有通用设置初始化断言未通过，与本次模型详情布局改动无关，待通用设置迁移单独修复。
