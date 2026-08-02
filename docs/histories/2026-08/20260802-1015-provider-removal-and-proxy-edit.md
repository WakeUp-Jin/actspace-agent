## [2026-08-02 10:15] | Task: 完善服务商移除与代理编辑

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 服务商需要可以完整移除；已开启代理的 OpenRouter 编辑弹窗中无法保存其他配置。

### 🛠 Changes Overview

**Scope:** `packages/desktop`、服务商设计文档、安全约束与发布记录。

**Key Actions:**

- **[完整移除]**: 新增类型化 preload / IPC 路径和 main 进程原子清理，删除默认、管理和额外 Key，并重置 Base URL、代理与连接状态。
- **[数据保留]**: 保留已添加模型、凭据引用、历史会话和用量记录；缺失凭据继续显式不可用，不自动回退。
- **[代理编辑]**: 已配置代理地址不回显时允许留空保存，省略代理更新以保留原值；新开启代理仍要求有效地址，关闭开关会清除配置。
- **[交互与回归]**: 卡片增加带二次确认的移除图标，DuckCoding 多 Key 场景保留「断开默认」，并覆盖 Renderer 与 SettingsService 状态转换。

### 🧠 Design Intent (Why)

“断开默认 Key”与“移除整个服务商”是不同生命周期动作，不能共享一个只清单个密钥的实现。脱敏字段编辑也不能把空输入直接解释为清除：更新协议需要明确区分保持、替换和清除，才能在不向 renderer 暴露原值的前提下安全编辑其他字段。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/test/provider-model-settings.test.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `packages/desktop/src/main/test/settings-service.test.ts`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
- `docs/SECURITY.md`
- `docs/releases/feature-release-notes.md`
