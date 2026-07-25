## [2026-05-31 01:02] | Task: 精简 Kairos 运行节奏设置

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 将 Kairos 运行偏好里的时间段改为固定默认时间，不再暴露开始/结束时间；保留工作时段和晚上时段的运行频率可修改。

### 🛠 Changes Overview

**Scope:** `packages/desktop`、`packages/agent-core`、`docs`

**Key Actions:**

- **Settings UI**: Kairos 运行偏好不再展示起止时间输入；工作时段固定 `09:00 - 21:00`，晚上时段固定 `23:00 - 07:00`，只保留运行频率下拉。
- **UI Polish**: 固定时间只放在左侧描述里说明，右侧控件区不再额外显示时间徽标，避免挤占下拉框位置。
- **Runtime Parsing**: `parsePreferences()` 强制使用默认起止时间，避免历史 `preferences.json` 里手动改过的时间继续影响运行。
- **Tests & Docs**: 补充 renderer 与 agent-core 测试，更新设置页规范。

### 🧠 Design Intent (Why)

用户想要的是两个常用时间段的简单频率控制，而不是完整作息编辑器。UI 隐藏时间输入还不够，因为旧配置仍可能携带自定义起止时间；因此运行时也统一固定默认时段，只把 `sleepBias` 作为可配置项保留。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`
- `packages/desktop/src/renderer/test/kairos-config-files.test.tsx`
- `packages/agent-core/src/kairos/config/schema.ts`
- `packages/agent-core/src/kairos/config/test/schema.test.ts`
- `docs/design-docs/frontend/front-设置页规范.md`
