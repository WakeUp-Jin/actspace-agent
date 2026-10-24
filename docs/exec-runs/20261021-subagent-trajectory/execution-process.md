# 子智能体轨迹 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261021-subagent-trajectory.md`
- **执行模式**：交互
- **开始时间**：2026-10-21
- **结束时间**：2026-10-21

## 执行时间线


### 步骤 0：调研与定方向

- **操作**：
  - 对照 `tmp/deepseek-harness/packages/client/ui-trajectory` 和我们的轨迹管线。
  - 定位平铺来源：`attachSubagentTools` + `use-subagent-trajectories`。
- **决定**（用户逐项确认）：
  - 父轨迹只留 `agent` 一行。
  - 子轨迹放进右侧子 Agent 面板。
  - 入口是详情里的小按钮，不加行内图标。
  - 窄面板详情从下半部分弹出。
  - 切换按钮照搬 `SessionViewToggle`。
- **产物**：
  - `docs/design-docs/frontend/subagent-trajectory-demo.html`，用户认可「样子差不多」。
  - 计划（T1–T7）。

### 步骤 1：T1–T5 实现

- **操作**：
  - 删除子工具平铺、订阅 hook 和 `TrajectoryRecord.childSessionId`。
  - `subagents.ts` 只保留 `trajectoryDelegations`。
  - `useTrajectorySource(input, sessionId?)`：用 `store.peek` 读取，不用 `get`（`get` 每次都会造一个空 cell，导致无限重渲染）。
  - `TrajectoryView` 新增 `sessionId` / `variant` / `onOpenSubagent`。
  - 详情概述加「子智能体」一栏。
  - 右侧 Tab 增加 `focus`。
  - `SubagentsPanel` 增加对话 / 轨迹切换。
  - CSS 增加面板纵向分栏。
- **决定**：
  - `onOpenSubagent` 从 `ConversationView` 传入，原因见计划的决策记录。
  - 历史加载的守卫改成比较「视图自己的 sessionId」。
- **验证**：trajectory / subagents-panel 定向测试，84 项通过。

### 步骤 2：T6 mock 场景

- **操作**：
  - `mock-db` 支持 `delegation` 和 `parentSessionId`；journal 合成 `delegation/requested`。
  - `listPage` 过滤子会话。
  - 新增 `scenarios/subagent-trajectory.ts`。
- **验证**：typecheck 通过。`src/renderer/test/markdown-blocks.test.tsx` 的 `NodeListOf` 报错早已存在，与本计划无关。

### 步骤 3：浏览器验证与修正

- **操作**：`VITE_DEV_PORT=5188 dev:renderer` + `?mock=subagent-trajectory`，用 playwright-core 驱动系统 Chrome，走完「轨迹 → agent 行 → 查看轨迹 → 子轨迹某行 → 返回对话」。
- **发现并修复**：
  - 480px 窗口下 `@media (max-width: 760px)` 把详情改成右侧抽屉。面板变体重置了 `position / inset / z-index`。
  - 点子轨迹靠下的行后，详情弹出把它挡住了。面板里点表格行改为请求滚动。
- **未修（原有行为）**：
  - 矮窗口里，概述各分区会按比例压缩（DSH 同款）。
  - 子 Agent 对话页在 transcript 为空时，重试约 20 秒后退回摘要。
- **截图**：`screenshots/`，包括浅色、深色、1440 / 1100 / 480 窗口，面板宽 320–480。

### 步骤 4：测试与检查

- **新增和修改的测试**：
  - `trajectory-session-source.test.tsx`（2）：读取指定会话，watch 一次，卸载时释放；panel 不消费跳转。
  - `trajectory-details.test.tsx`（+1）：委派调用显示入口并回调子会话 id；子工具不显示。
  - `subagents-panel.test.tsx`（+2）：focus 定位到轨迹页，可以切换，从列表点进时默认对话；找不到时回到列表并说明。
  - `mock-bridge.test.ts`：场景一致性断言排除子会话。
- **验证**：见执行摘要。
