## [2026-10-21 21:50] | Task: 子智能体轨迹：父轨迹只留一行，右侧面板看子轨迹

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

轨迹页把子智能体的工具平铺在父会话列表里，看着不对。先参考 DeepSeek harness 的做法，再定方案：父轨迹只留一条，子智能体的轨迹放到右侧子 Agent 面板，详情里加个小按钮打开。先看 demo，再写计划，然后实现。

### 变更与动机

- **父轨迹**：对齐 DSH「轨迹只显示当前会话」。委派只占 `agent` 一行，删除子工具平铺和对子会话的订阅。原来只搬了工具、没有消息，还把父轨迹的调用计数、助手折叠和时间轴搅混了。
- **入口**：详情「概述」里加「子智能体」一栏和「查看轨迹」按钮，不在行上加图标，对表格的影响最小。
- **右侧面板**：子 Agent 面板可以按子会话 id 定位并停在轨迹页。标题前用和主会话一样的图标按钮切换对话 / 轨迹。窄面板里详情从下半部分弹出，面板不自动加宽。
- **TrajectoryView**：可以读取指定会话（`watch` + `peek`）。面板变体不处理 Context 面板跳转。

### 关键文件

- `apps/desktop/src/renderer/components/TrajectoryView.tsx`、`components/trajectory/use-trajectory-source.ts`、`trajectory/subagents.ts`
- `components/trajectory/details/{DetailPanel,RecordOverview}.tsx`、`styles/trajectory.css`
- `components/right-panel/{RightPanelContext,SubagentsPanel}.tsx`、`components/{RightPanel,ConversationView}.tsx`
- `mock/scenarios/subagent-trajectory.ts`、`mock/mock-db.ts`、`mock/handlers.ts`

### 验证与边界

- desktop vitest 1920 项通过；tokens、theme、renderer-bridge 检查通过。
- 浏览器 mock 截图包括浅色、深色和 480px 窗口。浏览器验证中修了两处：窄窗口媒体查询覆盖了面板布局；选中行被详情挡住。
- 未做：Electron 真实子智能体验收；提交。
