# 子 Agent 列表与详情顶部栏

> 状态：现行规范（2026-11-03，用户在 `subagent-style-demo.html` 里选定「列表 B 调整版 + 顶部栏 A 精简 · 带模型」）。
> 范围：右侧「子 Agent」面板的列表页和打开某个子 Agent 后的顶部栏。详情正文（执行记录 / 轨迹）和对话里的子 Agent 卡片（`AgentRunBlock`）不在本文范围。
> 代码：`apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`、`components/messages/AgentIdentity.tsx`。

## 1. 列表：分组卡

- 按「运行中」「已结束」分两组。组标题一行：左边组名，右边数量，`text-act-xs text-text-faint`。
- 每组是一张设置页同款分组卡：`divide-y divide-line/60 overflow-hidden rounded-act-group border border-line bg-surface`。
- 每个子 Agent 一行，三列：
  - 左：28px 头像（`AgentAvatar`，按子会话 id 固定）。
  - 中：两行。上面是任务标题（`description`），下面一句话：运行中是最近一步动作（「正在读取 …」），结束后是结果第一行；失败显示错误，用 `text-on-danger`。这句话和对话卡片用同一个取值函数（`agentLatestActivity`）。
  - 右：两行，右对齐。上面是本次消耗的 token（`18.4K tokens`），下面是耗时（`38s`、`1m 12s`）。运行中耗时用 `text-operational` 并带转圈图标。
- 不显示类型（Explore / Agent）、模型、「后台」标签和状态文字；状态只靠运行中的绿色转圈和失败的红字表达。
- token 没有数据（旧会话、子会话还没发出请求）时不显示上面那行，只留耗时。

## 2. 详情顶部栏：精简单行

一行，高 44px，从左到右：

1. 返回按钮：只有 `‹` 图标（`IconButton`，可读名称「返回子 Agent 列表」，Tooltip「返回」）。不再写「子 Agent /」面包屑。
2. 18px 头像 + 标题（`h2`，单行截断）。悬停标题看完整标题、类型和「后台」。
3. 模型名（`agentModelLabel`，`text-text-muted`，最宽约 96px，超出截断，悬停看原始模型 id）。没有模型时连同后面的分隔点一起不显示。
4. 状态图标 + 耗时：运行中绿色转圈，已完成对勾，失败红色叹号且耗时变红，已停止方块。
5. 最右：对话 / 轨迹切换（`SessionViewToggle`，图标不变）。

正文保持原样。

## 3. 数据

- 耗时：`stats.durationMs`。运行中由列表投影每秒按「现在 − 委派开始时间」重算，面板每秒轮询，数字会跟着走。
- token：`stats.totalTokens`，取子会话快照的 `usage.totalTokens`（每次请求的 input + output + cache read + cache write 累加，和输入框用量胶囊同一口径）。
  - 由 main 的 `sessions.getSubagents` 在投影列表时逐个读子会话快照填进去；已结束的子会话结果缓存起来，不再每秒重读，缓存规则和子会话模型一致。
  - 读子会话失败时不填，界面不显示 token。

## 4. 格式

- token：`formatTokenCount`（`999` / `18.4K` / `1.2M`）后接「tokens」。
- 耗时：不到一分钟写 `38s`；一分钟以上写 `1m 12s`；一小时以上写 `1h 05m`。
