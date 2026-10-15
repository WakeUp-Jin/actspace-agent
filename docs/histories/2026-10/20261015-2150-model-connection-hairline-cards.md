## [2026-10-15 21:50] | Task: 设置 › 模型连接改用发丝卡片视觉

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS）`

### 📥 User Query

> 提交一个 commit，补充更新文档。（模型连接页按 `model-connection-3-directions.html` 的方向 A 重做视觉，此前没有单独记录。）

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer settings、styles）、`docs`

**Key Actions:**

- **样式文件**：新增 `styles/model-connection.css`（`.mc-*`，`components` layer）：发丝卡片、连接行、状态圆点、分组标题、可点行、填写屏字段、模型清单、34×20 小开关、页脚操作条。颜色全部走语义 token。
- **连接列表**：内置服务商和自定义连接/中转站都改成一行一张卡片（`ConnectionRow` / `CustomConnectionCard`），右侧是「圆点 + 短语」状态，不再是分隔线列表。
- **详情、配置与模型清单**：`AnthropicKeySetup`、`ConnectionModelPicker`、`CustomConnection*`、`custom-connection-shared` 接入同一套类名；`SettingGroup` 新增 `plain`，让行直接落进 `.mc-models` 卡片。
- **规范**：`front-模型设置页面-Maka重做规范.md` 新增 §4.0 发丝卡片规则，更新 §3.2 和 §4.1 的列表示意。

### 🧠 Design Intent (Why)

原来的列表是「大分组框 + 行间分隔线」，连接一多就像表格。方向 A 让每个连接独立成卡片，靠留白和圆角分组，状态改成圆点加一句短语，扫一眼就能看出哪条连接有问题。样式集中在一个 CSS 文件，避免组件里堆 Tailwind 任意值。数据模型和交互流程不变。

### 📁 Files Modified

- `apps/desktop/src/renderer/styles/model-connection.css`（新增）
- `apps/desktop/src/renderer/styles/index.css`
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/components/settings/AnthropicKeySetup.tsx`
- `apps/desktop/src/renderer/components/settings/ConnectionModelPicker.tsx`
- `apps/desktop/src/renderer/components/settings/CustomConnectionDetail.tsx`
- `apps/desktop/src/renderer/components/settings/CustomConnectionModels.tsx`
- `apps/desktop/src/renderer/components/settings/CustomConnectionWizard.tsx`
- `apps/desktop/src/renderer/components/settings/custom-connection-shared.tsx`
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`
- `docs/design-docs/frontend/model-connection-3-directions.html`（新增，方向对比 demo）
- `docs/design-docs/frontend/model-connection-redesign-demo.html`（新增，v2 demo）

### ✅ Verification

- `pnpm --dir apps/desktop typecheck` 通过。
- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm check:docs` 通过。
- `vitest run src/renderer/test/provider-model-settings.test.tsx`：44 个测试通过。
- 还没做 Electron 浅色/深色主题实机检查。
