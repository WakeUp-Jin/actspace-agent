# 子 Agent 列表与详情顶部栏

> 状态：现行规范（2026-11-03，用户在 `subagent-style-demo.html` 里选定「列表 B 调整版 + 顶部栏 A 精简 · 带模型」）。
> 2026-11-04 与子智能体改造（[05 界面与设置](../子智能体和后台任务设计规范/05-界面与设置设计规范.md) §2）合并：保留本文外观，数据换成一个子智能体一行，补状态文字和行内停止按钮。
> 2026-11-04 验收修正：状态只写文字，不再叠图标；去掉「第 N 轮」；没有最终回复时左侧不再重复写状态。
> 范围：右侧「子 Agent」面板的列表页和打开某个子 Agent 后的顶部栏。详情正文（执行记录 / 轨迹）和对话里的子 Agent 卡片（`AgentRunBlock`）不在本文范围。
> 代码：`apps/desktop/src/renderer/components/right-panel/SubagentsPanel.tsx`、`components/messages/AgentIdentity.tsx`。

## 1. 列表：分组卡

- 按「运行中」「其他」分两组（「其他」含空闲、已中断、失败、已结束）。组标题一行：左边组名，右边数量，`text-act-xs text-text-faint`。
- 每组是一张设置页同款分组卡：`divide-y divide-line/60 overflow-hidden rounded-act-group border border-line bg-surface`。
- 每个子 Agent 一行，三列：
  - 左：28px 头像（`AgentAvatar`，按子会话 id 固定）。
  - 中：两行。上面是任务标题（`description`），下面一句话：结束后是结果第一行（去掉 `**`、反引号和标题 / 列表标记，原样显示，不补文案）；运行中或没有结果时不写这一行，状态只在右侧出现一次。
  - 右：两行，右对齐。上面是子会话累计 token（`18.4K tokens`），下面是「状态文字 · 耗时」（运行中、空闲、已中断、失败、已结束），只写文字不加图标；运行中整段绿色（`text-operational`），失败用 `text-on-danger`。耗时是最近一次激活的。不显示「第 N 轮」。
  - 运行中的行最右有停止按钮（`IconButton`，可读名称「停止 ‹描述›」），效果同 `interrupt_agent`。
- 不显示类型（通用 / 探索 / Fork / Codex / Claude Code）、模型和「后台」标签。
- token 没有数据（外部子智能体、旧会话、子会话还没发出请求）时不显示上面那行。

## 2. 详情顶部栏：精简单行

一行，高 44px，从左到右：

1. 返回按钮：只有 `‹` 图标（`IconButton`，可读名称「返回子 Agent 列表」，Tooltip「返回」）。不再写「子 Agent /」面包屑。
2. 18px 头像 + 标题（`h2`，单行截断）。悬停标题看完整标题、类型和「后台」。
3. 模型名（`agentModelLabel`，`text-text-muted`，最宽约 96px，超出截断，悬停看原始模型 id）。没有模型时连同后面的分隔点一起不显示。
4. 「状态文字 · 耗时」：与列表行右下同一个 `SubagentStatus`，运行中绿色，失败红色；不显示「第 N 轮」，也不用状态图标。
5. 最右：对话 / 轨迹切换（`SessionViewToggle`，图标不变）。Codex / Claude Code 没有轨迹，不显示切换。

正文保持原样：Fork 顶部一行「从主会话 #N 分出」，运行中底部有「停止」。

## 3. 数据

- 列表项是 `SubagentListItem`（`projectSubagentItems`）。
- 耗时：renderer 按最近一次激活算，运行中是「现在 − `activeSince`」，结束后是「`endedAt` − `activeSince`」；面板每秒轮询，数字会跟着走。
- token：`SubagentListItem.totalTokens`，取子会话快照的 `usage.totalTokens`（每次请求的 input + output + cache read + cache write 累加，和输入框用量胶囊同一口径），只有通用 / 探索 / Fork 有。
  - 由 main 的 `sessions.getSubagents` 逐个读子会话快照填进去；不在运行的子会话按「子智能体 id + 激活次数」缓存，续派后激活次数变了会重读。
  - 读子会话失败时不填，界面不显示 token。

## 4. 格式

- token：`formatTokenCount`（`999` / `18.4K` / `1.2M`）后接「tokens」。
- 耗时：不到一分钟写 `38s`；一分钟以上写 `1m 12s`；一小时以上写 `1h 05m`。
