# 子智能体轨迹：父轨迹只留一行，右侧面板看子轨迹

状态：2026-10-21 完成（交互模式，未提交）。分支沿用 `fix/settings-model-select`，分支上已有的未提交改动保留，未重置工作区。自动化测试与浏览器 mock 截图已通过；Electron 真实会话验收尚未进行。执行记录见 `docs/exec-runs/20261021-subagent-trajectory/`，Electron 验收步骤见其中的 `acceptance-handoff.md`。

## 目标

父会话轨迹里，子智能体只占 `agent` 工具调用那一行，不再把子会话的工具平铺进来。要看子智能体做了什么，点开 `agent` 行的详情，用「子智能体」一栏的「查看轨迹」小按钮在右侧「子 Agent」面板打开它自己的完整轨迹；面板标题前用和主会话一样的图标按钮切换对话 / 轨迹。

已确认的交互见 demo：`docs/design-docs/frontend/subagent-trajectory-demo.html`（用户 2026-10-21 认可，「样子差不多」）。

## 背景

- 现状：`R/trajectory/subagents.ts` 的 `attachSubagentTools` 把子会话的工具记录复制到父 `agent` 记录后面，`R/trajectory/layout.ts` 因为它们带 `parentCallId` 标成「子工具」；`R/components/trajectory/use-subagent-trajectories.ts` 为每个子会话 `bridge.watch` 并构建轨迹。问题：只搬了工具、没有子智能体的消息；父轨迹「调用」计数、助手折叠和时间轴被子工具搅混；父轨迹要订阅全部子会话。
- DeepSeek harness 的做法（`tmp/deepseek-harness/packages/client/ui-trajectory`）：轨迹只显示当前会话；`subagent` 调用是一行普通工具；子会话轨迹在切换到子会话后由该会话自己的「轨迹」标签显示。DSH 的「子工具」只指同一会话里 PTC `run_code` 的嵌套派发。
- 我们的子智能体不能再委派（`packages/subagent/src/provider.ts:63` 只给读工具，`maxDelegationDepth`），所以子轨迹里不会出现 `agent` 调用，不需要做孙级跳转。
- 主会话的对话 / 轨迹切换：`R/components/SessionViewToggle.tsx`（看对话时 Activity 图标「查看执行轨迹」，看轨迹时 MessageSquare 图标「返回对话」）。

路径缩写：`R/` = `apps/desktop/src/renderer/`。

必读：`AGENTS.md`、`docs/design-docs/frontend/front-新功能开发清单.md`、`docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md`、`docs/FRONTEND_VERIFICATION.md`。

## 范围

包含：

1. 父轨迹去掉子工具平铺及其订阅、提示条。
2. 轨迹详情「概述」对委派调用显示「子智能体」一栏 + 「查看轨迹」小按钮。
3. 右侧「子 Agent」Tab 支持「定位到某个子会话并停在轨迹页」。
4. `SubagentsPanel` 详情头部加对话 / 轨迹切换（复用 `SessionViewToggle`），轨迹页渲染子会话轨迹。
5. `TrajectoryView` 支持读取指定（非当前选中的）会话，以及右侧面板窄布局：详情从下半部分弹出。
6. 浏览器 mock 场景 `?mock=subagent-trajectory`，测试与文档同步。

不包含：

- 后端、Journal、IPC 契约改动（子会话投影已能经 `getProjectionSnapshot` + `bridge.watch` 读取）。
- 侧栏显示子会话、会话层级面包屑、把子会话作为主会话打开。
- 同会话嵌套调用（`parentCallId`）的「子工具」类型：保留不动。
- 右侧面板自动加宽、详情高度拖拽。

## 契约

- `R/components/right-panel/RightPanelContext.tsx` 的 `subagents` Tab 新增可选字段 `focus?: { childSessionId: string; view: "chat" | "trajectory"; revision: number }`。`revision` 每次点击递增（用 `Date.now()`），让同一 Tab 再次定位。原有 `selected` 保持不变（对话卡片入口继续用）。
- `R/trajectory/subagents.ts` 只保留 `trajectoryDelegations(snapshot)`，返回 `{ parentCallId, childSessionId, presetId: string | null }[]`；删除 `attachSubagentTools`。
- `TrajectoryViewProps` 新增 `sessionId?: string`（读这个会话而不是当前选中会话）和 `variant?: "main" | "panel"`（默认 `main`）。
- `DetailPanel` / `RecordOverview` 新增 `subagentFor?(callId: string): { childSessionId: string; label: string } | null` 与 `onOpenSubagent?(childSessionId: string): void`；只有两者都存在且该工具记录的 `callId` 命中委派时才显示「子智能体」一栏与按钮。
- 删除 `TrajectoryRecord.childSessionId`（`R/trajectory/contract.ts:129`）及 `R/trajectory/requests.ts:15` 对它的判断、`RecordOverview` 的「子会话」行。`subtoolCalls` 计数保留（同会话嵌套调用仍用）。

## 任务

### T1 父轨迹去平铺

- `R/components/TrajectoryView.tsx`：删掉 `useSubagentTrajectories`、`attachSubagentTools` 的使用和「子工具：正在加载 / 加载更早的子工具」提示条；`runtime` 直接用 `ownRuntime`。
- 删除 `R/components/trajectory/use-subagent-trajectories.ts`。
- `R/trajectory/subagents.ts`：按契约精简，补 `presetId`。
- `R/trajectory/contract.ts`、`R/trajectory/requests.ts`、`R/components/trajectory/details/RecordOverview.tsx`：按契约删除 `childSessionId` 相关代码。
- 测试：`R/test/trajectory-context-sections.test.ts` 删除 `attachSubagentTools` 用例，改为 `trajectoryDelegations` 的用例（取出 parentCallId/childSessionId/presetId，忽略指向自身会话的节点）。
- 验证：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/trajectory-*` 通过；`rg "attachSubagentTools|useSubagentTrajectories|childSessionId" apps/desktop/src/renderer` 只剩 shared 投影类型以外的零命中。

### T2 TrajectoryView 读取指定会话

- `R/components/trajectory/use-trajectory-source.ts`：`useTrajectorySource(input, sessionId?)`。给了 `sessionId` 时：effect 里 `projection.bridge?.watch(sessionId)`，卸载或换 id 时释放；cell 取 `projection.store.get(sessionId)`（Provider 的 `version` 变化会让 context value 更新，组件随之重渲染）；不加载 fixture。
- `R/components/TrajectoryView.tsx`：
  - `variant === "panel"` 时不消费 `useTrajectoryNavigation()` 的 pending（只有主区域轨迹处理 Context 面板跳转）。
  - 加载更早历史：把 `bridge.store.selectedSessionId === sessionId` 的守卫改为「当前视图的 sessionId 仍是发起时的那个」（用 ref），否则子会话加载完 loading 不会复位。
  - 错误条「重试」：`panel` 用 `bridge.refreshRelated(sessionId)`，`main` 保持 `bridge.open`。
  - 根节点加 `data-variant`。
- 测试（新增 `R/test/trajectory-session-source.test.tsx`）：给 `sessionId` 时渲染该会话的记录、调用一次 `watch`、卸载时调用返回的 dispose；`panel` 不消费 navigation pending。

### T3 详情里的「子智能体」入口

- `R/components/TrajectoryView.tsx`：`useMemo` 从 `source.snapshot` 得到 `trajectoryDelegations`，建 `Map<parentCallId, delegation>`；`subagentFor(callId)` 返回 `{ childSessionId, label }`，`label` 取该工具记录输入里的 `description`，没有时用 `presetId`，再没有用「子智能体」。
- `variant === "main"` 时 `onOpenSubagent = id => openTab({ id: "subagents", kind: "subagents", title: "子 Agent", sessionId: runtime.sessionId, focus: { childSessionId: id, view: "trajectory", revision: Date.now() } })`（`useRightPanel()`）；`panel` 不传。
- `R/components/trajectory/details/DetailPanel.tsx` 透传两个 prop；`RecordOverview.tsx` 在「状态」后加一行：`<dt>子智能体</dt><dd>{label} <Button size="xs" variant="ghost">查看轨迹</Button></dd>`，按钮带 `PanelRight` 图标（lucide，12px），可读名称「在右侧查看子智能体轨迹」。样式只用 token / 现有 `tj-*` 类。
- 测试（`R/test/trajectory-details.test.tsx` 增补）：委派调用的概述出现「子智能体」与按钮，点击以子会话 id 调用 `onOpenSubagent`；普通工具没有这一行。

### T4 右侧面板：定位子会话 + 对话 / 轨迹切换

- `RightPanelContext.tsx`：按契约加 `focus`。`R/components/RightPanel.tsx:241` 把 `tab.focus`（仅当 `tab.sessionId === sessionId`）传给 `SubagentsPanel`。
- `R/components/right-panel/SubagentsPanel.tsx`：
  - 新状态 `view: "chat" | "trajectory"`，从列表点进来默认 `chat`；`focus.revision` 变化时记下待定位的 `childSessionId` 与 `view`。
  - 列表加载后按 `transcriptRef.runId === childSessionId` 选中；待定位且列表尚未拿到时显示「正在加载子智能体…」，不闪出列表；拿到列表仍找不到时回到列表并显示「找不到这个子智能体。」。
  - 详情头部：返回按钮 → `SessionViewToggle`（`view` / `onToggle`）→ 头像 → 标题。
  - `view === "trajectory"` 时内容区渲染 `<TrajectoryView sessionId={childId} variant="panel" />`，不做对话记录轮询（对话的轮询 effect 只在 `chat` 时运行）。
- 测试（`R/test/subagents-panel.test.tsx` 增补）：带 `focus` 打开后选中对应子智能体并渲染轨迹视图；切换按钮的可读名称在「查看执行轨迹」/「返回对话」之间切换，内容随之切换；从列表点进默认是对话。

### T5 右侧面板窄布局

- `R/styles/trajectory.css` 增加 `.tjv-root[data-variant='panel']` 规则：`.tj-split` 改为纵向；`.tj-details` 宽度占满、`max-width: none`、高度 56%、去左边框加上边框；隐藏 `.tj-detailsResizeHandle`。颜色、圆角只用已有变量与 token。
- 选中行由表格自身滚动区域负责定位（纵向分栏后表格区域只剩上半部分，现有 `scrollToId` 逻辑不变）。
- 窄宽度（320–420px）下表格列若溢出，按浏览器截图结果在同一选择器下收紧（隐藏参数预览，保留工具名和结果）。
- 验证：浏览器 mock 截图 320 / 420 / 560 宽，浅色、深色各一张。

### T6 浏览器 mock 场景

- 新增 `R/mock/scenarios/subagent-trajectory.ts` 并注册到 `index.ts`：一个父会话（含一次 `agent` 调用与对应 `delegation/requested`）和一个子会话（用户任务、上下文、几条助手消息与读工具）；覆盖 `getSubagents`（返回一个 `kind: "agent"` 条目，`transcriptRef.runId` 为子会话 id）和 `getSubAgentTranscript`。如果 mock 的 `sessionProjection` 无法表达 `delegation/requested`，在场景里覆盖 `getProjectionSnapshot`，直接返回带这些事件的窗口。
- `docs/FRONTEND_VERIFICATION.md` 场景表加一行。

### T7 文档与收尾

- `docs/design-docs/frontend/front-DSH轨迹能力迁移规范.md`：写明子智能体在父轨迹只占一行、子轨迹在右侧子 Agent 面板查看，「子工具」只指同会话嵌套调用。
- 执行记录 `docs/exec-runs/20261021-subagent-trajectory/{execution-process,execution-summary}.md`；history `docs/histories/2026-10/`；完成后本计划移到 `completed/`，同步 `docs/exec-plans/README.md`。

## 验证方式

在仓库根运行：

```bash
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:frontend-tokens
pnpm check:frontend-theme
pnpm check:renderer-bridge
pnpm check:current-docs
```

浏览器 mock：`pnpm --filter @actspace/desktop dev:renderer`，打开 `?mock=subagent-trajectory`，切到轨迹 → 点 `agent` 行 → 「查看轨迹」→ 右侧停在子轨迹 → 点子轨迹一行看下半部分详情 → 切回对话。浅色、深色、480px 窄窗各截图。

Electron 真实会话（用户验收）：真实运行一次 Explore 子智能体，运行中和完成后各看一次父轨迹与右侧子轨迹。

## 风险与回退

- 子会话投影读取失败或历史不完整：子轨迹自身的错误条与「加载更早历史」处理，父轨迹不受影响。
- 右侧面板同时 watch 子会话：只在轨迹页挂载时 watch，切走即释放；对话页仍用原有轮询。
- `SessionViewToggle` 的 `chrome-button` 样式依赖窗口标题栏变量；若在面板里尺寸不对，改用 `IconButton` 按同样的图标、文案和按下态实现，不改标题栏的组件。
- 回退：只撤销本计划列出的文件改动，不动分支上其他未提交改动。

## 进度记录

- [x] T1 父轨迹去平铺
- [x] T2 TrajectoryView 读取指定会话
- [x] T3 详情里的「子智能体」入口
- [x] T4 右侧面板定位 + 切换
- [x] T5 右侧面板窄布局
- [x] T6 浏览器 mock 场景
- [x] T7 文档与收尾

## 决策记录

- 2026-10-21：参照 DSH，轨迹只显示当前会话；不在父轨迹平铺或展开子工具。
- 2026-10-21：入口不加行内图标，放在 `agent` 行详情「子智能体」一栏的小按钮；点击后右侧打开子 Agent 并停在轨迹页。
- 2026-10-21：右侧窄时详情从下半部分弹出；面板不自动加宽。
- 2026-10-21：对话 / 轨迹切换照搬主会话标题前的 `SessionViewToggle`，不用分段按钮。
- 2026-10-21（实施）：`onOpenSubagent` 由 `ConversationView` 传入，`TrajectoryView` 不直接调用 `useRightPanel()`。这样它在没有右侧面板 Provider 的地方（测试、Space、面板里的子轨迹）也能渲染，不会抛错。不传这个回调时只显示「子智能体」名称，不显示按钮。
- 2026-10-21（实施）：`subagentFor` 返回 `TrajectoryDelegation`，标签由 `RecordOverview` 从工具参数取，依次用 `description`、`presetId`，最后用「子智能体」。
- 2026-10-21（实施）：mock 子会话带 `isChildSession`，`listPage` 和真实 `App.tsx` 一样把它过滤掉，不进侧栏。
- 2026-10-21（浏览器验证后）：
  - 窗口 ≤760px 时，原有媒体查询会把详情改成右侧抽屉；面板变体重置了定位，详情一律从下半部分弹出。
  - 面板里点表格行会请求滚动，详情弹出后选中行仍保持可见。
