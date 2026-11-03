# 子 Agent 列表与详情顶部栏样式调整

## 目标

右侧「子 Agent」面板换成用户在 demo 里选定的样式：列表用设置页分组卡（右上 token、右下耗时），详情顶部栏精简成一行（返回 · 头像标题 · 模型 · 状态耗时 · 轨迹切换）。规范见 `docs/design-docs/frontend/front-子Agent列表与详情顶部栏.md`。

## 范围

- 包含：`sessions.getSubagents` 补子 Agent 的 token 用量；`SubagentsPanel` 列表和顶部栏；`AgentIdentity` 公用小件；mock 场景补齐多种状态；测试与文档。
- 不包含：详情正文、轨迹视图、对话里的子 Agent 卡片样式。

## 背景

- demo：`docs/design-docs/frontend/subagent-style-demo.html`（默认显示选定版本）。
- `AgentToolStats.totalTokens` 早已在类型里，但列表投影一直没填。子会话快照 `usage.totalTokens` 有现成累计值。

## 步骤

1. 投影：`projectSubagentList` 增加 `childTokens` 入参，按子会话 id 填 `stats.totalTokens`；新增 `subagentChildren(journal)` 列出全部子会话和是否结束。
2. main：`getSubagents` 逐个读子会话快照拿 `usage.totalTokens`，已结束的缓存（上限 500，与模型缓存同规则）。
3. `AgentIdentity`：`AgentAvatar` 支持 18px；新增 `AgentStatusIcon`、`agentLatestActivity`、`formatAgentDuration`；`AgentRunBlock` 改用公用的 `agentLatestActivity`。
4. `SubagentsPanel`：列表改分组卡；顶部栏改精简单行。
5. mock `subagent-trajectory`：补运行中、后台运行中、失败、已停止四个子 Agent，带 token 和不同模型。
6. 测试：投影 token 用例；面板列表 / 顶部栏用例。
7. 文档：规范、DSH 轨迹规范里切换按钮位置、验证文档场景表、history。

## 验证方式

- `pnpm --filter @actspace/desktop test`（相关用例）、`pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、typecheck。
- 浏览器 mock `?mock=subagent-trajectory`：浅色 / 深色、380 / 480 面板宽度截图。
- Electron 真实运行：待用户 / Codex 验收。

## 进度记录

- [x] demo 三轮，用户选定（2026-11-03）。
- [x] 1–7 实现（2026-11-03）。
- [x] 工程验证 + 浏览器 mock 浅深色截图；Electron 待验收。

## 决策记录

- 2026-11-03：顶部栏放模型名。子 Agent 可能各用不同模型，窄面板下标题会多截几个字，用悬停补完整标题。
- 2026-11-03：token 由 main 读子会话快照，不在 renderer 再发请求；已结束的缓存，避免每秒重读。

## 执行模式

- **交互模式**。
