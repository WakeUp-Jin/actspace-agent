# S6 界面、设置与文档

## 目标

桌面端与 Web 端按设计 [05](../../../design-docs/子智能体和后台任务设计规范/05-界面与设置设计规范.md) 显示新的子智能体与后台任务；设置换成「子智能体默认模型」；插件页出现两个外部后端插件；现行文档、包 README 与官网文档改写为新设计。

## 范围

- 包含：设计 05 全部；文档改写（下面第 6 步）。
- 不包含：新的视觉元素。实施中如果现有组件表达不了（例如需要新的标签样式），先停下来做 HTML demo 给用户看。

## 必读

- 设计 05；[前端新功能开发清单](../../../design-docs/frontend/front-新功能开发清单.md)、[全局视觉语言规范](../../../design-docs/frontend/front-全局视觉语言规范.md)
- S1 的共享类型；S3 的 `getSubagents` / `interruptSubagent` IPC
- 下面各步列出的文件

## 步骤

### 1. 对话区

- `apps/desktop/src/renderer/components/messages/AgentRunBlock.tsx`：`kindLabel` 改为按 `subagentKind` / `preset` 显示通用、探索、Fork、Codex、Claude Code；标题用 `description`；老会话（只有 `agentKind`）照旧显示 Agent / Explore。
- `components/conversation/render-message.tsx`、`turns.ts`：`send_message`、`wait_agent`、`list_agents`、`list_subagent_models`、`interrupt_agent` 的一行工具行文字（设计 05 §1）；点目标打开子 Agent 面板并选中。
- `components/messages/BackgroundNoticeRow.tsx`：`taskKind: "subagent"` 与 `"agent_message"` 两种行；`"agent"` 留给老会话。
- `components/messages/BashRunBlock.tsx`：不变（`output_path` 已是会话目录路径）。
- `components/messages/SubAgentTranscriptModal.tsx`：确认仍被使用；不再使用就删除。

### 2. 右侧面板

- `components/right-panel/SubagentsPanel.tsx`：列表按子智能体（`getSubagents` 新返回结构）；状态文字、「第 N 轮」、停止按钮（调 `interruptSubagent`）；详情按种类分支：本地 / fork 用现有对话 / 轨迹切换，fork 顶部「从主会话 [#N] 分出」；外部只显示结果与原生记录路径（复制、在 Finder 中显示，复用现有打开路径的 IPC）。
- `components/right-panel/RightPanelContext.tsx`、`RightPanel.tsx`、`ConversationView.tsx`：`SubagentFocus` 用 `agentId`。
- `components/right-panel/BackgroundTasksPanel.tsx`：只显示 Bash。

### 3. 设置与插件页

- `components/settings/models/model-view.ts`（第 24 行用途行）、`components/settings/sections/TaskModelDefaultsSection.tsx`（第 80 行）：explore 行换成「子智能体」，下拉第一项「跟随主智能体」，保存 `subagentDefaultModel`。
- `components/settings/sections/SubagentSection.tsx`：改为「子智能体」一组，文字照设计 05 §3。`SettingsNav.tsx`、`SettingsPage.tsx` 的标题跟着改。
- 扩展 › 插件：两个外部插件由插件清单自动出现；不可用原因显示在插件行（确认现有插件页是否支持「不可用原因」，不支持就在插件页组件里补一行说明文字，用现有样式）。

### 4. 轨迹、统计、Web

- `renderer/trajectory/subagents.ts`、`components/TrajectoryView.tsx`、`components/trajectory/details/{RecordOverview.tsx,DetailPanel.tsx}`、轨迹 `strings.ts`：委派与续派行按新事件取种类、描述、子会话。
- `components/harness-stats/RuntimeTab.tsx`：按种类 / 预设统计。
- `apps/web/src/pages/session/blocks/EventRow.tsx`（第 16 行附近）：同样的种类文字与通知行。

### 5. Mock

- `renderer/mock/scenarios/subagent-trajectory.ts`、`scenarios/background-tasks.ts`、`mock/fixtures.ts`、`mock/mock-db.ts`、`mock/handlers.ts`、`mock/harness-stats-fixture.ts`、`mock/plugins-fixture.ts`：改为新结构，覆盖运行中、空闲多轮、fork、Codex、已中断、lost、两个外部插件（一个可用一个不可用）。
- Space demo 相关 mock 里有 `explore` 的地方一起改（grep `explore`、`agentKind`）。

### 6. 文档

- 改写现行设计文档为新设计（保留文件名，正文换成现状，状态写「已实施」）：`docs/design-docs/collaboration/agent-subagent-runtime.md`、`agent-background-tasks.md`；`agent-explore-subagent.md` 删除并从索引中去掉（由设计 02 取代，删除前确认无其他文档链接，有则改链）。
- `docs/design-docs/agent-runtime/agent-session-transcript.md`：子 Agent 的写入时机改为「每步重写」，补 `→ running`、`agent_message`、bash `(log pruned)`。
- `docs/design-docs/index.md` 的 `collaboration/` 行与本专题条目状态。
- 包 README：`packages/subagent/README.md`（新增两个外部包）、`packages/background-tasks/README.md`（只管 Bash）、`packages/context/README.md`（新增 `context-subagents`）、`packages/README.md`（第 44 行附近）。
- 官网：`apps/site/src/content/docs/subagents.md` 按新设计重写；`harness-tools.md`、`model-selection.md`、`settings-and-data.md`、`what-is-actspace.md` 中提到 explore 或子 Agent 的地方同步。

## 验证

- `pnpm --filter @actspace/desktop test`、`pnpm --filter @actspace/web test`、`pnpm test:frontend-tokens`。
- 浏览器 mock 截图（`pnpm --filter @actspace/desktop dev` 后用 `?mock=subagent-trajectory`、`?mock=background-tasks`）：设计 05 的 U1–U7，浅色与深色各一组，存到执行记录目录。
- `pnpm check:site`、`pnpm test:site`。
- 统一验证命令（含 `check:docs`、`check:current-docs`）。
- Electron 实机检查写成交接清单（设计 02 §10、03 §4、04 §6、05 §5 合并去重），放 `docs/exec-runs/20261103-subagent-background-redesign/acceptance-handoff.md`。

## 回滚

revert 本提交：界面回到旧组件；数据层（S1–S5）不受影响，但老界面不认识新事件，所以应与 S3 一起回滚。
