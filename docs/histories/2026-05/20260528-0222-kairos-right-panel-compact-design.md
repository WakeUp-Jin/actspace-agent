## [2026-05-28 02:22] | Task: Kairos 右侧紧凑视图设计与计划

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 设计 Kairos 在右侧视图 tab 中的紧凑展示：右侧宽度只有约三分之一，不使用完整 Kairos 页面布局，只展示标题与控制按钮、最终回复、不可点击轨迹列表；先做计划和设计文档。

### Changes Overview

**Scope:** `docs`

**Key Actions:**

- **[Compact view design]**: 新增 `front-Kairos监控页规范.md`，明确右侧 compact view 是伴随式状态卡，而不是完整监控页。
- **[Data flow decision]**: 设计中明确使用同一条 `useKairos + aggregateKairosEvents` 数据流服务完整页面和右侧 compact 视图，不新增 compact 专属后端 IPC。
- **[Component reuse boundary]**: 规划 `kairosSelectors.ts`、`KairosPage`、`KairosRightPanelView` 的拆分边界：共享 selectors 和格式化 helper，不共享完整页面布局。
- **[Execution plan]**: 新增 active plan `20260528-kairos-right-panel-compact-view.md`，拆出 selectors、RightPanel tab state、compact component、CSS、测试和验证任务。
- **[Navigation sync]**: 同步前端设计索引、总设计索引、exec-plans README、TODO 和右侧面板总计划，避免和 `20260527-right-panel-views.md` 重复实现。

### Design Intent (Why)

Kairos 完整页面适合专门监控，右侧 compact 视图适合聊天时伴随观察。两者展示密度不同，但事实来源必须相同，否则后续会出现状态、事件和工具轨迹不一致。将 compact 视图单独成文并拆出 active plan，可以让后续实现按稳定边界推进。

### Files Modified

- `docs/design-docs/kairos/front-Kairos监控页规范.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/index.md`
- `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md`
- `docs/exec-plans/active/20260527-right-panel-views.md`
- `docs/exec-plans/README.md`
- `docs/TODOLIST.md`
