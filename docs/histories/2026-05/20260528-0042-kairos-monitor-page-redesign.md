## [2026-05-28 00:42] | Task: Kairos 监控页视觉与交互改造

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 根据 `docs/exec-plans/active/kairos-monitor-page-redesign.md` 继续执行 Kairos 监控页改造，并参考新的 Kairos 设计图完成页面视觉和交互。

### 🛠 Changes Overview

**Scope:** `packages/desktop`, `docs`

**Key Actions:**

- **监控台结构**: 将 Kairos 页面收敛为精简 header、运行轨迹、左侧执行列表、右侧统计和共享详情容器的两列布局。
- **详情交互**: 默认展示最终回复；选中工具执行行时，同一详情容器自动切到工具结果 tab，避免最终回复与工具输出同时抢空间。
- **执行列表**: 增加 10 条/页分页、固定关键列宽、无色线性类型图标和明确选中态，状态颜色只留给 badge。
- **运行轨迹**: 固定蓝/黄/红/灰四种语义色，并限制少量事件时的块宽，避免状态块变成大色条。
- **测试补强**: 增加 KairosPage renderer 测试，覆盖 header 精简、运行轨迹色调、分页和工具行自动切 tab。
- **计划归档**: 将 `kairos-monitor-page-redesign` execution plan 移入 completed，并同步 `QUALITY_SCORE.md`。

### 🧠 Design Intent (Why)

Kairos 页面不是普通日志表，而是后台自治 Agent 的运行监控台。列表负责定位事件，右侧负责解释当前选中或最近事实；最终回复是用户最关心的结果，所以默认完整可见，工具结果只在主动查看或选中工具行时出现。视觉上把语义色限制在状态和轨迹，能降低长时间观察时的彩虹噪音。

### 📁 Files Modified

- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`
- `docs/exec-plans/completed/kairos-monitor-page-redesign.md`
- `docs/exec-plans/README.md`
- `docs/QUALITY_SCORE.md`
- `docs/learnings/2026-05/monitoring-ui-fact-list-detail-split.md`

### ✅ Verification

- `pnpm --filter @actspace/desktop test -- kairos-page`
- `pnpm typecheck`
- `pnpm dev:log` + Electron 真实窗口观察：确认 Kairos controller ready、页面两列布局、最终回复默认展示、工具执行行切换到工具结果 tab。
