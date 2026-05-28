## [2026-05-28 15:39] | Task: Fix Kairos realtime tool event display

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> Kairos short-term JSONL 中已有 list/read/sleep 等工具调用记录，但前端 Kairos 页面执行列表没有显示 list/read 工具；同时运行轨迹色块显示成白色。重点排查实时推送链路，而不是仅做文件回读。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[Realtime event preservation]**: `useKairos` 的 `onEvent` 改为函数式 `setEvents`，避免同一批 IPC 同步事件基于旧 `eventsRef.current` 互相覆盖，导致 `tool_call` 丢失、孤立 `tool_result` 被聚合器忽略。
- **[Trace color stability]**: Kairos 运行轨迹色块改用显式 `backgroundColor` 映射，避免动态 Tailwind class 在运行时或热更新链路中失效。
- **[Regression test]**: 新增 Kairos 页面测试，模拟一次 IPC flush 内连续推送 `tick -> assistant -> tool_call -> tool_result -> sleep_start`，断言执行列表、统计和工具详情都保留工具事件。
- **[Reset UX alignment]**: `reset_today` 成功后，Kairos 页面立即清空本地事件列表、轨迹和详情区，视觉上回到“今日刚开始”的空态。
- **[Kairos chrome exception]**: Kairos 主页面隐藏窗口 chrome 右上角右侧面板折叠按钮，避免把全局对象预览交互带入自治监控页。
- **[Stop state final emit]**: `KairosController.stop()` 在 scheduler 停止后补发一次 `enabled=false` 的完整 runtime state，修复“后端已停但 Kairos 主按钮仍显示暂停”的状态不同步问题。
- **[Button copy tightening]**: Kairos 主页面与右侧紧凑视图把 `立即唤醒` / `重置今日` 收敛为双字文案 `唤醒` / `重置`，统一按钮节奏，不改控制语义。

### 🧠 Design Intent (Why)

Kairos 后端已经按“写盘成功 -> push ring buffer -> emit IPC”的顺序发出事件，问题出在 renderer 对连续事件的状态合并。React 会批处理同一轮同步回调里的 state 更新，如果每次都用旧 ref 拼接新数组，后发事件会覆盖先发事件。函数式更新让每条事件都基于最新 state 追加，符合事件流 append-only 语义。

运行轨迹色块属于状态可视化，不应依赖动态生成的 utility class 是否被 Tailwind 扫描或 HMR 正确保留；用显式颜色映射更稳定，也更容易测试。

### 📁 Files Modified

- `packages/agent-core/src/kairos/controller.ts`
- `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/state/useKairos.ts`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/test/kairos-page.test.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `docs/design-docs/agent-core/kairos-autonomous-mode.md`
- `docs/design-docs/frontend-ui/Kairos监控页规范.md`
- `docs/design-docs/frontend-ui/Kairos上下文Sheet规范.md`
