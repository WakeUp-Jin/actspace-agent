## [2026-05-28 03:07] | Task: Kairos 右侧紧凑视图落地

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 执行 `20260528-kairos-right-panel-compact-view` 计划，在聊天态右侧面板新增 Kairos compact view。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer、前端设计文档、execution plan、history。

**Key Actions:**

- **[Kairos selector]**: 新增 `kairosSelectors.ts`，抽取最近回复、展示 rows、状态文案、时间/耗时格式化和工具详情派生逻辑，供完整 Kairos 页面与右侧 compact 复用。
- **[Right panel tab]**: 将 `RightPanel` 从静态 mock 改为 `README.md` / `Session diff` / `Kairos` 三 tab 切换；右侧 Kairos tab 不切走主聊天区。
- **[Compact view]**: 新增 `KairosRightPanelView`，复用 `useKairos()` 数据流，展示 Header、最终回复、只读轨迹列表；不新增 compact 专属 IPC。
- **[Chrome hit-test]**: 修复隐藏标题栏下右侧 tab 被 `.chrome-center` 拖拽区覆盖的问题，让 `right-tabs` 高于 chrome 浮层并只让 tab 按钮接收 pointer event。
- **[Tests]**: 新增 renderer 测试覆盖右侧 tab 切换、无桥空态、compact 展示、轨迹列表不可点击和控制按钮调用。

### 🧠 Design Intent (Why)

Kairos 右侧 compact 是完整监控页的伴随式投影，应共享同一条事件与状态数据流，而不是新增后端契约。右侧面板宽度窄，信息层级只保留“当前状态、最近最终回复、最近轨迹”，工具结果详情和完整调试能力继续留在完整 Kairos 页面。

本轮浏览器 mock 验证发现一个真实交互陷阱：右侧 tab 行虽然视觉上与 chrome-right 按钮同高，但点击会被隐藏标题栏的 `.chrome-center` 拖拽区抢走。最终采用 `right-tabs z-index: 61 + pointer-events` 分层，既保留 tab 可点击，又不覆盖右上角 PanelRight 关闭按钮。

### 📁 Files Modified

- `packages/desktop/src/renderer/state/kairosSelectors.ts`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/styles.css`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md`

### ✅ Verification

- `pnpm --filter @actspace/desktop test`
- `pnpm typecheck`
- `pnpm build`
- Browser mock：打开右侧 panel，确认 `Kairos` tab 可点击切换；修复 chrome 拖拽区拦截后重新验证通过。
- Electron 真实窗口：聊天态打开右侧 panel，切到 `Kairos` tab；确认主聊天区未切走，右侧显示 `Stopped`、最终回复和最近轨迹；拖动右侧面板到 `320px` 附近后 Header、按钮、最终回复和轨迹列表仍可读。

### 📚 Learning

本轮命中“有陷阱 / 有模式”，但知识点已经由 `docs/learnings/2026-05/electron-hidden-titlebar-layout.md` 覆盖。这里补充到 history：右侧 tab 行同样属于 hidden titlebar hit-test 边界，不能只靠视觉避让，需要明确 pointer-event 和 z-index 分层。
