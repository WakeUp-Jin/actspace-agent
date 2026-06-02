# Kairos 监控页规范

本文档是 Kairos 页面视觉与信息架构的前端事实来源。后端自治模型、存储、IPC 和聚合契约仍以 `docs/design-docs/agent-kairos-autonomous-mode.md` 为准；本文只约束 renderer 的页面布局、组件关系和交互状态。

## 设计目标

- 让用户一眼判断 Kairos 是否正在睡眠、是否出现异常，以及最近一次最终回复是什么。
- 把运行过程从“原始事件表”升级为“可点击执行列表”：列表负责定位，右侧负责解释。
- 最终回复默认完整可见；工具结果只在用户主动查看时出现，避免和最终回复抢空间。
- 控制区、轨迹区、列表区、详情区都保持紧凑，适合长时间作为运维式监控界面停留。

## 页面结构

```txt
+--------------------------------------------------------------------------------+
| Kairos · Sleeping · 5s                                  [暂停] [唤醒] [重置] |
+--------------------------------------------------------------------------------+
| 运行轨迹（近 60 分钟）                                                           |
| [灰][灰][蓝][黄][灰][红] ...       legend: 回复 / 睡眠 / 异常 / 其他              |
+--------------------------------------------+-----------------------------------+
| 执行列表                                   | 统计                               |
| 时间 / 类型 / 状态 / 摘要 / 耗时            | 工具调用 5 / 巡检 4 / 异常 1 / ... |
| - 最终回复 success                         +-----------------------------------+
| - 工具执行 success                         | 详情                               |
| - 巡检 success                             | [最终回复] [工具结果]              |
| - 睡眠 success                             | 环境无变化，仍无配置路径、无会话、 |
| - 异常 failed                              | 无 briefs。继续休眠。              |
+--------------------------------------------+-----------------------------------+
```

桌面端主区域使用两列布局：左侧执行列表约 70%，右侧统计/详情列约 30%。右侧再上下分为统计区和详情区。`xl` 以下可以退化为单列：轨迹在上，执行列表在中，统计和详情在下。

## 顶部控制区

- 左侧依次显示 `Kairos` 标题、状态胶囊（如 `Sleeping · 5s`、`Ticking`、`Paused`、`Cooldown · 42s`），以及用量胶囊（双维度可切换，例如 `[Coins] 12.4K tok · ¥0.0234 [本阶段]`）。
- 顶部不再显示 `Workspace`、`Session`、`Last wake`、`Sleep today` 等元信息 chip。
- 用量胶囊规范见 [用量胶囊](#用量胶囊)；它和状态胶囊并列在标题右侧，是 header 第一行允许出现的两个数据胶囊。
- 右侧按钮组从左到右固定顺序为 `开启 / 暂停`、`唤醒`、`上下文`、`重置`，遵循"先查看、后破坏"的从左到右心智。未启用时首按钮变为 `开启`。
- `暂停` 的显示依据是运行态里的 `enabled === true`，不是单看 `state !== "stopped"`；后端停机后如果回推 `enabled: false`，主按钮要立刻切回 `开启`。
- `上下文` 按钮打开右侧滑入的 Sheet，展示当前 tick 会看到的系统提示词、会话历史与工具列表；详细规范见 `front-Kairos监控页规范.md`。
- 标题、状态胶囊、用量胶囊和按钮垂直居中对齐，减少 header 高度。
- 点击 `重置` 后，页面立即回到“刚进入 Kairos 且尚无事件”的空态：执行列表、运行轨迹和详情区清空，用量胶囊的 `本阶段` 维度归零（`累计` 维度不动，仍显示全期账）。

### 用量胶囊

- 形态：状态胶囊右侧的弱化胶囊。从左到右依次是：**模式切换图标按钮**、`<总 token>`、分隔点、`<总成本>`、**模式 chip**。例如 `[Coins] 12.4K tok · ¥0.0234 [本阶段]` 或 `[∞] 124K tok · ¥0.2410 [累计]`。
- 数据来源：**`KairosRuntimeState.usageLifetime` + `KairosRuntimeState.usageSinceReset`**——由 KairosController 的 `KairosUsageAccumulator` 维护**两份**累加器，每条 `llm_usage` 写入短期记忆 jsonl 时**同步**累加到两份维度并 debounce 写入 `<kairosRoot>/memory/usage-accumulator.json`（schemaVersion=2），再通过 IPC `kairos:state` 推送给 renderer。
- **不再**在 renderer 端从 ring buffer 实时聚合：ring buffer 默认 200 条会滚动，会把"全期累计"切掉；新方案让胶囊数字成为 controller 的"运行账本"，跨进程重启不丢、不受 buffer 容量限制。
- 双维度语义：
  - **`累计`（lifetime）**：从 Kairos 第一次有 `llm_usage` 起的全期账。`重置今日` 按钮**不动它**；**只有手动删 `usage-accumulator.json`** 才归零（此时下次启动会扫描全部短期记忆 jsonl 段重建）。语义：持久化历史即真相。
  - **`本阶段`（sinceReset）**：自上一次 `重置今日` 起累计，与 `todayTickCount` / `totalSleepSecondsToday` 同生命周期——`重置今日` 时清零。accumulator 文件被删时也会一并归零（reset 边界只能由 accumulator 文件维护）。
- 切换交互：胶囊左侧 logo 是可点击按钮。`sinceReset` 模式用 `Coins` 图标，`lifetime` 模式用 `Infinity` 图标。点击切换两种模式；用户的选择持久化到 `localStorage["kairos.usageBadgeMode"]`，跨开关页保持。默认 `sinceReset`（更贴合日常关注的"本阶段"心智）。
- 没有 `llm_usage` 事件时只显示 `0 tok`，省略成本部分，避免误展示 `¥0.0000` 让用户疑惑。
- 货币符号按 `payload.cost.currency` 自适应：USD → `$`、CNY → `¥`、多次调用混合不同币种时退化为 `≈ $X.XX` 并在 tooltip 标注"混合币种"。
- token 紧凑格式：`< 1000` 显示原始整数；`< 100K/M` 保留 1 位小数（`15.4K`、`1.2M`）；其它整数（`124K`、`15M`）。
- 成本格式：紧凑模式下 `< 0.01` 用 4 位小数（`$0.0034`），否则 2 位；tooltip 详情统一 4 位小数。
- hover tooltip：`【<当前模式>】LLM 调用 N 次 · Token 合计 X` / `输入 X（缓存命中 Y） · 输出 Z` / 推理 token / 累计成本（精确小数）。tooltip 底部追加一行"点击图标切换至「<另一模式>」：<对方维度的简要 token + 成本>"，让用户瞥一眼就能对比两个维度。
- 与运行状态胶囊视觉差异化：用量胶囊不带左侧状态色 dot，背景色更弱；模式切换图标按钮的高亮态保持低饱和，避免抢走主信息（数字 + 成本）的视觉焦点。

## 运行轨迹

运行轨迹只表达最近一段时间的事件密度、关键状态和相对耗时，不承担完整日志职责。

| 事件 | 颜色 | 说明 |
|---|---|---|
| `reply` / 最终回复 | 蓝色 | 只用于 assistant 最终回复 |
| `sleep` | 黄色 | 只用于进入或完成 sleep |
| `error` / `failed` / 异常 | 红色 | 只用于失败、异常、熔断相关事件 |
| `tick` / `tool` / `interrupt` / 其他 | 中性灰 | 工具调用、巡检、tick 等默认不抢色 |

轨迹高度应比早期宽表版本更低，目标是一个紧凑 band：标题 + 小 legend + 低矮块状 timeline。每个轨迹块的宽度由执行时长决定：耗时越长占比越大，但不是按真实秒数直接映射像素。当前尺度为 `20px + seconds * 5px`，并封顶 `100px`：无耗时/0 秒事件为 20px，2-3 秒工具调用会略宽，长 sleep 不会无限撑开。事件多到放不下时使用水平滚动条保留完整历史，不从头部丢弃事件。hover 可显示时间、类型、摘要；点击轨迹块时可以同步选中左侧对应执行列表行。

## 执行列表

执行列表是主导航，而不是原始 JSON 表。

- 列：`时间`、`类型`、`状态`、`摘要`、`耗时`。
- 类型图标使用无色线性图标，图标本身不带语义色。可用字符、lucide 图标或现有 icon wrapper，但颜色保持 `currentColor` 的灰黑系。
- 状态 badge 可以使用颜色：`success` 绿色、`failed` 红色、`warning` 黄色、`running` 蓝色或灰色。
- `最终回复` 和 `工具执行` 行必须可点击，因为右侧详情区会展示对应内容。
- 选中行使用浅蓝背景或蓝色描边，避免用大面积强色。
- 摘要只做单行截断；完整内容交给右侧详情区。

类型文案建议：

| `KairosRowKind` | 展示文案 |
|---|---|
| `reply` | 最终回复 |
| `tool` | 工具执行 |
| `tick` | 巡检 |
| `sleep` | 睡眠 |
| `interrupt` | 中断 |
| `error` | 异常 |

## 右侧统计区

统计区只保留名称和值，不放 logo、图标或装饰卡片。

默认指标：

- `工具调用`：今日或当前窗口内工具执行次数。
- `巡检`：今日 tick / 巡检次数。
- `异常`：今日 failed / error 次数。
- `睡眠剩余`：当前 sleep 倒计时；非 sleeping 时显示 `--` 或最近一次 sleep 时长。

统计区应该是紧凑横排或 2x2 网格，视觉上弱于最终回复详情。

## 右侧详情区

详情区同一时间只展示一种内容，不再把最终回复和工具输出拆成上下两个子卡片。

- 顶部使用胶囊 segmented tabs：`最终回复` / `工具结果`。
- 默认选中 `最终回复`。
- `最终回复` tab 必须完整显示最近或选中的最终回复正文，例如：`环境无变化，仍无配置路径、无会话、无 briefs。继续休眠。`
- 选中执行列表里的 `reply` 行时，详情区仍停留在 `最终回复` tab 并显示该回复。
- 选中执行列表里的 `tool` 行时，可以自动切到 `工具结果` tab，展示 tool name、输入摘要、输出摘要和错误信息。长工具结果允许折叠或截断。
- 当没有选中工具行且用户点 `工具结果` tab 时，展示轻量空状态：`选择工具执行后查看结果`。
- 不展示上下文摘要、额外按钮、原始事件 JSON 或工具结果预览混排。原始 JSON 只作为 debug 能力保留在测试或后续开发模式中，不进入默认产品 UI。

## 数据映射

- 数据源仍是 `SessionEvent[]`，由 `aggregateKairosEvents(events)` 产出 `KairosEventRow[]`。
- 执行列表渲染 `KairosEventRow`，详情区通过 `row.relatedEventIds` 反查原始 `SessionEvent`。
- `assistant_message` / `assistant_reply` 的正文优先作为最终回复内容。
- `tool_call` + `tool_result` 配对后作为工具结果内容；找不到配对时显示 running 或 missing 状态。
- `error` 事件和 failed 工具结果共同参与异常计数和红色轨迹块。

## 上下文 Sheet

`上下文` 按钮打开右侧滑入 Sheet，展示 Kairos 当前 tick 会看到的系统提示词、短期记忆和工具列表。Kairos 自治模型、prompt 组装和短期记忆长期事实仍见 `agent-kairos-autonomous-mode.md`；本节只约束 renderer 入口、Sheet 行为、Snapshot 契约和验收点。

### 入口与行为

- 按钮位于 Header 右侧按钮组，顺序固定为 `开启 / 暂停`、`唤醒`、`上下文`、`重置`。
- `上下文` 是只读查看，放在 `重置` 前，符合先查看、后破坏的心智。
- icon 使用 `FileText`，样式复用监控页次级按钮。
- 即使 Kairos stopped 也可查看；只有 `bridgeAvailable === false` 时禁用。
- 按钮设置 `aria-haspopup="dialog"`、`aria-expanded` 和 `aria-controls`；Sheet 关闭后焦点回到此按钮。

### Sheet 组件

自研轻量 Sheet，不引入 Radix / shadcn runtime 依赖。

- DOM：Overlay + Panel，Panel 使用 `role="dialog"` 和 `aria-modal="true"`。
- 位置：屏幕右侧滑入，`w-[min(520px,92vw)]`，高度 `100vh`。
- 关闭：`Esc`、点击 overlay、右上 `X`、程序化 `onOpenChange(false)`。
- 焦点：打开时 focus 到第一个可聚焦元素；Tab / Shift+Tab 在 Panel 内循环；关闭后归还焦点。
- 滚动：打开时锁定 body scroll，关闭后恢复。
- 动效：右滑入 / 右滑出，遵守 `prefers-reduced-motion`。

### 信息架构

Sheet body 是单一纵向滚动容器，分三段：

1. **系统提示词**：首屏主角，按 prompt 段落渲染为一篇连贯文档，而不是多张卡片。章节标题旁显示源文件徽章；纯运行时段显示「运行时生成」。
2. **会话历史**：展示 `KairosShortTermMemoryContext.load()` 真正会回放给 LLM 的摘要和 messages。历史摘要用折叠段；最近 messages 默认每条显示 3 行，可展开本条。
3. **工具列表**：chip 密排，只展示工具名。`KairosContextTool.description` 和 `parametersSchema` 保留在契约中，但 Sheet V1 不渲染，避免把能力清单变成 API 文档。

系统提示词段固定对齐 prompt assembler 的 6 段：

- Kairos 角色与节奏。
- 运行上下文。
- 配置提示。
- 用户规则。
- 观测摘要。
- 历史摘要。

顶部标题旁显示生成时间 `HH:mm:ss`。模型、阶段和 token 估算字段可以保留在 snapshot 里，但 V1 UI 不展示。

### Snapshot 契约

```ts
type KairosContextPhase = "work" | "quiet" | "weekend" | "off";
type KairosContextMessageRole = "user" | "assistant" | "tool" | "system";

type KairosContextHistorySegment = {
  label: string;
  text: string;
};

type KairosContextMessage = {
  role: KairosContextMessageRole;
  source?: string;
  content: string;
  timestamp?: string;
};

type KairosContextTool = {
  name: string;
  description: string;
  source: "kairos" | "shared";
  parametersSchema: unknown;
};

type KairosContextPromptSegment = {
  label: string;
  text: string;
  sourceFiles?: string[];
};

type KairosContextSnapshot = {
  generatedAt: string;
  modelId: string | null;
  phase: KairosContextPhase;
  systemPrompt: string;
  systemPromptTokens: number;
  systemPromptSegments: KairosContextPromptSegment[];
  historySummary: KairosContextHistorySegment[];
  historyMessages: KairosContextMessage[];
  tools: KairosContextTool[];
};
```

IPC：

| Channel | 方向 | Payload |
|---|---|---|
| `kairos:get-context-snapshot` | renderer <-> main | `void` -> `KairosContextSnapshot` |

调用是按需拉取，不新增 state / event 推送通道。Sheet 关闭后不保留 snapshot 到全局 hook state。

Controller 暴露 `getContextSnapshot()`：复用 observe refresh、short-term memory、active briefs、`assembleSystemPrompt(...)` 和工具注册表。该调用纯 IO + 文本拼接，不真正调用 LLM。错误透传给 renderer，Sheet 顶部显示可重试错误。

### Sheet 验收

- Sheet 打开时能看到系统提示词、历史摘要 / messages 和工具 chip。
- 系统提示词是一篇连续可滚动文档；源文件徽章可复制完整路径。
- 「复制全文」复制 `snapshot.systemPrompt`。
- 工具列表只展示 name，不展示 description、schema 或来源角标。
- 拉取失败显示错误 banner + 重试。
- `kairos:get-context-snapshot` handler 调 controller 一次并返回；controller throw 时透传错误。

## 聊天态 Kairos 右侧紧凑视图

聊天态右侧面板可以打开 `Kairos` Tab，展示 Kairos 当前状态。它是伴随式状态卡，不是完整监控台。

### 定位与数据原则

- 完整 Kairos 页面适合专门观察自治运行，包含运行轨迹、执行列表、统计、最终回复和工具结果详情。
- 右侧紧凑视图适合聊天时常驻，只回答 Kairos 是否运行、最近最终回复是什么、最近轨迹如何。
- 紧凑视图不做工具调试，不展示原始 JSON，不提供执行列表点击详情。
- 完整页和紧凑视图都消费同一 `useKairos()` 与同一 `aggregateKairosEvents()` 结果。
- 不新增 Kairos compact 专属 IPC，不让右侧面板自行解析 short-term jsonl。

组件边界：

```txt
packages/desktop/src/renderer/state/useKairos.ts
packages/desktop/src/renderer/state/kairosSelectors.ts

packages/desktop/src/renderer/pages/KairosPage.tsx
packages/desktop/src/renderer/components/right-panel/KairosRightPanelView.tsx
```

`kairosSelectors.ts` 放共享纯函数，如最新最终回复、展示 rows、状态文案、紧凑指标和时间格式化。不要共享完整页面布局。

### 右侧面板接入

右侧面板 Tab 与文件、Session diff 同级：

```txt
[ README.md ] [ Session diff ] [ Kairos ]
```

触发行为是打开右侧面板并设置 `kairos` tab，不切换主工作区到 `view === "kairos"`。

### 紧凑布局

宽度目标 320-640px，默认约 390px，纵向三段：

1. 顶部状态区：`Kairos` + 状态胶囊（`Sleeping · 4m36s`、`Ticking`、`Stopped`、`Cooldown`）+ `暂停/开启`、`立即唤醒`、`重置今日`。
2. 最终回复区：只展示最近最终回复，空态为 `暂无最终回复`。
3. 轨迹列表区：展示最近 12-20 条 compact row，不分页、不可点击、不打开详情。

紧凑视图不展示 workspace、session、统计卡片、运行轨迹 legend、工具结果详情或配置 / briefs / notes。

状态边界：

- 未暴露 `window.kairos`：显示 `Kairos 桥未就绪`。
- 未启用 Kairos：显示 `Stopped`，主按钮为 `开启`。
- sleeping：倒计时由 renderer 本地 interval 刷新。
- ticking：`立即唤醒` 禁用。
- 操作失败：按钮附近显示 `useKairos().error`。

### 完整页与紧凑视图差异

| 能力 | 完整 Kairos 页 | 右侧紧凑视图 |
|---|---|---|
| 数据源 | `useKairos()` | `useKairos()` |
| 派生 rows | `aggregateKairosEvents()` | `aggregateKairosEvents()` |
| Header 控制 | 有 | 有，紧凑化 |
| 运行轨迹 timeline | 有 | 无；改为轨迹列表 |
| 执行列表 | 有，宽表，可点击 | 有，compact row，不可点击 |
| 最终回复 | 有 | 有，核心区域 |
| 工具结果详情 | 有 | 无 |
| 统计区 | 有 | 第一版不做 |
| 配置 / Briefs / Notes | 不恢复 | 不做 |

### 紧凑视图验收

- 打开聊天右侧面板并切到 Kairos tab，不会切走主聊天区。
- 代码中没有新增 compact 专属 IPC。
- 右侧只展示 Header、最终回复、轨迹列表三段。
- 轨迹列表不可点击，不维护 selected row，不展示工具结果详情。
- 320px 宽度下文本和按钮不重叠。
- 完整 Kairos 页仍保留工具结果详情和宽表。

## 验收要点

- header 中不出现 `Workspace`、`Session`、`Last wake`、`Sleep today`。
- header 第一行除标题、状态胶囊、用量胶囊外，不允许再加其它数据胶囊；用量胶囊在 0 调用状态下显示 `0 tok`，有数据时显示 `<token> · <cost>`，货币符号随 `cost.currency` 切换。
- 运行轨迹颜色只有蓝、黄、红、灰四类语义色。
- 运行轨迹宽度由 `KairosEventRow.durationMs` 决定，使用 `20px + seconds * 5px` 且最大 100px；事件过多时出现水平滚动且不丢弃历史。
- 主体不是三栏；页面为“左执行列表 + 右侧统计/详情”的两列结构。
- 最终回复和工具结果不同时展示；通过同一个详情容器里的胶囊 tab 切换。
- 最终回复在默认状态完整可见。
- 执行列表图标无色，状态 badge 有色，`reply` / `tool` 行可点击。
- 执行列表不新增 token/成本列——单条 LLM 调用的 token 对用户无判断价值，汇总走 header 用量胶囊。
- Kairos 主页面不显示窗口 chrome 右上角的右侧面板折叠按钮，避免把全局对象预览面板交互带入 Kairos 监控页。
- `暂停` 后如果后端已进入 `enabled=false, state="stopped"`，主按钮必须显示 `开启`，不能停留在“暂停”文案。
