# Context 面板规范

右侧面板的 Context Tab：回答「现在占了多少、由哪些条目组成、是怎么变成这样的」，只读、只看占用，不读原文；会话原文在轨迹视图里读，面板只给跳转。面板外壳、Tab 与对象启动页见[右侧面板与文件渲染规范](front-右侧面板与文件渲染规范.md)。全局的文案、状态表达、token 与组件规则见前端必读规范，这里只写 Context 面板自己的规则。

代码：`apps/desktop/src/renderer/components/right-panel/context/`；类型真源 `packages/util/shared/src/context-panel.ts`；Main 门面 `apps/desktop/src/main/runtime-v2/context-panel-service.ts`。

## 1. 入口

Composer 上下文弹层的「查看完整上下文」、对象启动页的「上下文」、右侧「+」菜单的「上下文」，三者打开或聚焦同一个 id 为 `context`、标题为「上下文」的 Tab。

弹层与面板共用 `renderer/context-format.ts`：token 统一用「≈」加 K / M，不足 1% 写「<1%」；弹层的分类行也带占已用百分比；压缩次数取自 projection 的 `activity.compactionCount`。

## 2. 区块与顺序

自上而下七块，宽度跟随右侧面板，360px 时仍可读。区块不画卡片边框：面板本身已有左边线，区块之间只用一条横线分隔（`ContextPanelParts` 的 `CARD_CLASS` = `border-t border-line`，第一块不画），区块内容左右留 12px。区块内部不再套带边框的格子（统计格、Bash 三格都不画格线）。Context 卡片里没有 ⓘ / `?` 口径提示，口径只写在本文。视觉参考 [context-panel-polish-demo.html](context-panel-polish-demo.html)（B 栏）。

1. **当前上下文**（`ContextOverview`）
   - 标题行右侧是模型名；主数字「≈ 已用 / 上限 tokens」加已用百分比。
   - 分段条按上限缩放，每段一个分类，未用部分是灰色轨道。有自动压缩阈值时在阈值位置画刻度并标「自动压缩 ≈N」。
   - 下方双列图例：色块、分类名、≈token、占已用百分比。点图例聚焦该分类，分段条和明细里其他分类变淡，再点取消。
   - 上限未知时不显示百分比和压缩刻度，分段条按已用总量缩放。
2. **会话统计**（`ContextStats`）
   - 三列网格、不画格线，格子依次是：轮次、步数、压缩（次）、缓存命中、累计 Token、费用。
   - 缓存命中 = 缓存读 ÷（缓存读 + 未命中输入），一位小数；累计 Token = 全部请求的输入 + 输出 + 缓存读写。
   - `costUsd` 为 null 时不出现费用格，不自行估算；没有用量数据时缓存和累计两格显示「—」。`stats` 为 null（历史索引未追平）时五格都显示「—」。
3. **路径**（`ContextPaths`）：见 §4。
4. **上下文明细**（`ContextBrowser`）：见 §3。
5. **上下文趋势**（`ContextTrend`）
   - 每次请求一根柱：柱高是估算总量，柱内按分类分段；卡片头右侧写「每根柱 = 一次请求」。
   - 压缩发生的那次请求之前画虚线分隔，轴上写「✂ 压缩 −N」（回收量未知时只写「✂ 压缩」）。
   - 悬停柱子时，图表上方一行写「第 N 轮 · 步 M · ≈估算 · 实际输入」；不为每根柱子挂 Tooltip。没有悬停时那一行说明最新一次请求。
   - 柱子放不下时横向滚动，打开时滚到最右（最新）。
6. **上下文事件**（`ContextEvents`）：按时间倒序，回答「什么变了、在哪一步、多了少了多少」。每行左边类型标签，中间两行（标题、说明），右边两行（token 增减、「第 N 轮 · 步 M」）。增减增绿减红，0 写「±0」用弱色，未知（如切换模型）留空。由相邻请求推导的事件只在悬停说明里写「根据请求推导」。

   | 标签 | 来源 | 标题 | 说明 |
   |---|---|---|---|
   | 文件 | 补充 `actspace.context-disclosure/navigation` | 活跃文件清单更新 | 「新增 a.ts 等 N 个，移除 M 个，共 K 个」 |
   | 运行 | 补充 `actspace.context-runtime/runtime-state` | 运行状态更新 | 「模式 agent → plan」或「模式 agent · 日期 2026-11-08」 |
   | 后台 | 补充 `actspace.context-background-tasks/background-tasks`（后台 Bash 与后台子智能体） | 后台任务清单更新 | 「N 个运行中：描述」或「全部结束」 |
   | 子 Agent | 老会话的补充 `actspace.context-subagents/subagents`（已并进后台任务清单，只读） | 子 Agent 清单更新 | 「N 个运行中：描述、描述」 |
   | 补充 | 其他补充 | 上下文补充 · id | 来源 owner |
   | 压缩 | `compaction/end` | 上下文已压缩 | 「旧对话换成摘要」 |
   | 工具 | 第二条起的 `request/tools` | 工具清单变化 | 「新增 N 个：a、b；移除 M 个：c」 |
   | 模型 | 相邻请求模型不同 | 模型切换 | 「旧 → 新」 |
   | 模式 | `agent/mode-set` | 模式切换 | 「旧 → 新」 |

   - 补充的增减 = 这条补充新估算 − 同一 owner/id 上一条估算（第一次出现就是全部）；压缩 = 压缩结束时的估算总量 − 压缩开始时；工具 = 工具分类前后之差。
   - 同一轮里同一个来源连续更新（中间没有别的事件）合成一行：标题加「×N」，增减相加，位置只写「第 N 轮」，说明写「本轮连续 N 次，合并显示」加最新一次的总数。
7. **Bash 命令**（`ContextBash`）：见 §5。

面板底部固定一行「≈ 为本地估算」。趋势或事件被截断时再加一行「展示最近 N 次请求、M 个事件；会话统计包含全部历史」。

状态条：`current.status` 为 stale / recovering 时顶部一行警告（`basis === "last-request"` 写「当前 Context 尚未加载，以下显示最近请求输入。」，否则「上下文正在重建，数字可能滞后。」）；`unavailable` 时概览区写「当前没有可展示的上下文。」；历史索引 syncing / rebuilding 时写「历史索引同步中（已处理 X / Y 条记录），完整统计稍后显示。」。

## 3. 上下文明细

- **头部**：一个对比 `ui/Select`，两项「对比上次请求（第 N 轮 · 步 M）」「不对比」；还没发过请求时禁用。头部下面一行写「≈N 估算」、「最近请求实际 N（服务商返回）」（有才显示）、「N 项」，再下面一条迷你色条。`previous.comparable === false` 时写「这次请求没有可比较的来源清单，已停用逐项对比。」，不伪造逐项变化。
- **分类行**：按 `CONTEXT_BUCKET_REGISTRY` 顺序；显示色块、名称、N 项、项数增减、token 增减、≈token、占比。打开面板时默认展开「工具」和「会话内容」；每类先显示 12 项，底部「再显示 20 项（共 N）」。
- **非会话分类**（系统提示词、工具、规则、Skills、会话摘要）：
  - 超过 3 项出现搜索框和排序（按大小 / 按名称）；「工具」另有来源 chip（内置、MCP 服务名等）。
  - 条目行：标题、来源、新增 / 已移除标记、单条 token 增减、占本类的小进度条、≈token。
  - 点条目行展开预览：顶部一行写占本类和占全部的比例，下面是预览原文加「复制」。展开的内容就是 `preview`；全文读取走 `sessions.readContextEntry`，只开放系统、工具、规则、Skills，会话摘要只有短预览。
  - 对比模式下，上次请求有、本次没有的条目以删除线列在本类末尾。
- **会话内容**：只列清单，不展开原文。
  - 每行：类型标签（用户 / 助手 / 工具调用 / 工具结果，思考段标「助手 · 思考」）、标题、新增标记、占比条、≈token。
  - 没有搜索框和排序，固定最新在前；有类型 chip（可多选）。
  - 整行点击跳到轨迹里对应记录，悬停时行尾出现 ↗；chip 行右侧「在轨迹中打开」，只选一个类型时写「在轨迹中打开最新<类型>」。
  - 条目没有子类型（过渡数据源）时不显示 chip；没有轨迹身份的行不可点。
- 明细分页：没有单独的「加载更多」按钮。分类行的「N 项」用后端给的每类总数（`entriesPage.bucketCounts`），「再显示 20 项（共 N）」点到本地已读完时顺带向后端要下一页（revision 必须一致），读取中按钮显示「正在读取…」。后端分页把非会话条目放在首页，会话条目按新到旧往后翻。

## 4. 路径卡片

回答「模型现在知道哪些文件」。活跃路径以一行「路径 — 说明」进入模型上下文（不含文件全文）；睡眠路径只在索引里，模型仍可按需读取。路径列表是管理信息，不计入 Token 占用。

- 始终显示：标题、「第 N 压缩周期」、两格统计。活跃格写「n / 100」并带容量条，满额时容量条变警示色，卡片内再加一行「活跃路径已满 100 条，之后新出现的路径会先进入睡眠。」；睡眠格写数量。两格兼当列表切换。
- 两格是浅底色块，不画格线；选中的一格换成面板底色加一圈深色细线。
- 列表默认收起：两格下一行小开关「› 显示活跃路径 · N 条」，展开后变「⌄ 活跃 · 已显示 12 / N」。列表只平铺，不按目录分组。收起时不请求路径。
- 行内容：文件图标、文件名、目录（等宽弱色）、标签、「读 N」（本周期读取次数，0 次显示「—」）、最近读取的相对时间（未读过「未读过」）。路径在工作区内时显示相对路径；悬停出现复制按钮。
- 标签：「新」（本周期加入）、「待唤醒」「将睡眠」（下次压缩的预判）。预判由后端 `ContextPathEntry.nextCompaction` 给出，前端不复刻排序规则；规则在 `@actspace/shared` 的 `selectNextActivePathIds`，引擎压缩与面板预判共用。
- 点行展开：完整路径（可选中、可复制）、说明、状态、本周期读取、最近读取、加入周期、来源。查看和复制都不读文件、不激活路径、不触发压缩。
- 分页：每类先显示 12 项，「再显示 20 项（共 N）」；本地不够时按游标向后端要下一页（每页 50，上限 100，整页不超过 192 KiB）。
- 空态与不可用：`disclosure` 为 `unavailable` 或缺失时卡片只写「当前会话没有路径记录。」，不当成 0；`ready` 且两类都是 0 写「还没有记录到文件路径。」；列表读取失败写「活跃路径读取失败。」加「重试」，不清空其他区块。后端缺失（过渡视图）时不显示这张卡。

分页状态规则：

1. 以 `(sessionId, disclosure.revision, visibility)` 管理分页；第一次展开才读首屏。
2. 会话或 revision 变化时清空旧游标和分页，只接受仍匹配当前请求身份的响应，不把旧页拼进新版本；游标是 opaque，不解码、不拼接、不跨筛选复用。
3. 追加页时核对 revision、visibility，按 `id` 去重。
4. 历史索引变化但 `disclosure.revision` 未变时保留已有路径页。
5. 版本过期或游标失效（IPC 拒绝）时重新获取面板再从首屏读；其他错误在卡片内显示重试，不无界自动重试。
6. 组件卸载或隐藏后停止请求并丢弃迟到结果；不用错误消息当路径内容渲染。

## 5. Bash 命令卡片

看模型用 Bash 干了什么：哪个程序调了几次、哪些老失败。只统计当前会话，不做逐条命令列表；具体命令去轨迹看。

### 5.1 布局

- **位置**：事件卡片之后。只在后端数据源且 `view.bash` 不为 null 时显示。
- **标题行**：「Bash 命令」，右侧「N 个程序」（不含「其他」）。
- **一行总览**：「**N** 次调用 **N** 次失败 **耗时** 合计」，数字加粗；失败大于 0 时数字用 `text-danger`，不写占比。耗时格式 `106ms` / `4.2s` / `1m52s` / `1h05m`。
- **值得注意**：总览与程序分布之间。小标题「值得注意」，下面最多四行，不加底色和圆点：左侧标签（弱色）、中间命令 / 程序原文（等宽、单行截断、`title` 给全文）、右侧数值（`tabular-nums`）。

  | 行 | 数值色 | 中间 | 数值 |
  |---|---|---|---|
  | 最慢 | `warning` | 耗时最长的单条命令 | 耗时 |
  | 失败最多 | `danger` | 失败调用次数最多的程序（不含「其他」） | `×N` |
  | 重复最多 | `chart-series-3` | 完全相同的命令中出现次数最多的一条（只出现 1 次时不给） | `×N` |
  | 后台任务 | `success` | 空 | `×N`（结果带 `background-task` 明细的 Bash 调用数） |

  没有数据的行不显示；四行都没有时整块不显示；`calls === 0` 时也不显示。同数时：最慢保留先出现的，失败最多 / 重复最多按名字排序取前。
- **按程序**：小标题「按程序」，右侧「只看失败」胶囊（有失败时才出现）。每行：展开箭头（可展开的程序才有）、程序名（等宽）、收起时弱色列出子命令摘要「status 9 · diff 7」、失败次数（大于 0 才显示「N 失败」，`text-danger`）、次数。
  - `git` `pnpm` `npm` `yarn` `cargo` `go` `gh` `docker` 可展开看子命令：展开后下面一块浅底，每个子命令一行：名字、细条形（占该程序的比例，颜色 `--act-context-tools`）、失败、次数。只展开到子命令，不列命令原文。
  - 默认显示前 8 个程序，其余用「再显示 N 项」每次展开 20 行。程序名过长时截断，`title` 给全名。
- **空状态**：`calls === 0` 时只显示标题和「本会话还没有调用过 Bash。」。

### 5.2 计数口径

- **调用**：`tool/result.status` 不是 `denied` 的 Bash 调用数（`completed`、`failed`、`aborted`、`cancelled` 都算）；被拒绝的调用不计，还在跑的不计，结束后自动计入；同一 `callId` 只计一次。
- **失败**：`status === "failed"`（非零退出码、超时、被沙箱拦下）；用户中途停止不算失败。一次失败调用里出现过的每个程序各记 1 次失败。
- **合计耗时**：每次调用从开始执行到 `tool/result` 的时间差之和，不含等待审批；转后台的命令只算到转入后台为止。
- **程序**：命令里出现一次记一次（`cat a && cat b` 记 `cat` ×2）；`cd` `export` 等导航 / 声明、`$(...)` 内部、重定向、环境变量赋值、`sudo` `env` `timeout` 等包装命令不计为程序；程序名取路径最后一段，不合法的归入「其他」。
- **命令原文**：只为「最慢」「重复最多」两行保存，每条最多 1000 个字符；程序统计只存程序名和子命令名。
- 不做：逐条命令列表、执行输出、退出码明细、失败占比、按程序拆耗时、「可用专用工具替代」之类的提示、跨会话汇总、PowerShell 解析。

解析细则以 `apps/desktop/src/main/runtime-v2/bash-programs.ts` 及其单测为准；存储表定义在 `apps/desktop/src/main/runtime-v2/context-history-projection.ts`：每个会话最多记 500 个「程序 + 子命令」组合，超出的归入「其他」；「重复最多」最多跟踪 500 条不同的命令。

## 6. 数据来源与刷新

### 6.1 读取契约

| 接口 | 输入要点 | 返回与边界 |
| --- | --- | --- |
| `sessions.describeContextPanel` | sessionId、可选 versionToken / consumerId / retry / release | `schemaVersion: 2` 视图，或 `notModified` + history；`release` 释放需求 |
| `sessions.listContextEntries` | sessionId、revision、可选 cursor / bucket / limit | 当前与比较清单共用分页；默认 200、最多 500 条身份 |
| `sessions.readContextEntry` | sessionId、revision、key、可选 offset | 非会话原文按 UTF-8 字节分段，最多 64 KiB，返回 `nextOffset` |
| `sessions.listContextPaths` | sessionId、revision（取 `disclosure.revision`）、visibility、limit、cursor | 路径分页，见 §4 |

`sessions.describeContext` 只服务 Composer 弹层（当前已物化的分类 / 总量 / 容量）。

`ContextPanelView` 的字段：

| 字段 | 含义与前端规则 |
| --- | --- |
| `currentVersion` / `history.indexGeneration` / `indexedThroughSeq` / `targetThroughSeq` | 当前 Context 与历史索引的版本；`throughJournalSeq` 不能单独决定新旧，重建后代际变化允许水位变小 |
| `current.basis`、`current.status` | basis 为 `current-context` / `last-request` / `unavailable`；status 为 ready / stale / recovering / unavailable |
| `history.status`、`history.error` | ready / syncing / rebuilding / fallback / unavailable；错误可重试；当前 Context 不等待全局 Usage 重建 |
| `model` | 模型名、`contextWindow`、`autoCompactAtTokens`；未知保留 null，不猜默认值；无固定阈值时不画压缩刻度 |
| `previous` | 最近持久化的请求输入摘要；`comparable`、`comparisonUnavailableReason`、`estimatorVersion` 决定能否比较 |
| `stats` | 轮次、步数、压缩次数、累计用量、`costUsd`；未追平时为 null，界面写「—」，费用缺失保留 null 不当零 |
| `bash` | 与 `stats` 同一出现条件；含程序分布与值得注意字段（缺省表示旧后端） |
| `disclosure` | 路径概要：`unavailable` 或 `ready { revision, cycle, activeLimit, activeCount, sleepingCount }`；字段缺失按不可用处理 |
| `trend` / `events` / `limits` | 最近 500 次请求、最近 200 条事件；被截断时 `limits` 明确给出；事件 `inferred` 表示由相邻请求推导，未知回收量为 null |
| `entriesPage` | `revision`、`total`、`bucketCounts`（每类条目总数）、`nextCursor`、`truncated`；所有分类和总量在分页前计算；条目含稳定 `key` / `bucket` / `title` / `estimatedTokens`，可选 `kind` / `source` / `preview` / `fullTextAvailable` / `trajectoryRef` |

约定：

- **`entry.key` 只由来源决定**，不含数组下标、request seq、contextRevision；内容变了仍是同一条目，对比显示为 token 增减而不是新增 / 移除。工具 key 带 plugin / owner 命名空间。
- **两边同一个估算器**（全项目只有一套，版本号是 `packages/util/shared/src/token-estimate.ts` 的 `ESTIMATOR_VERSION`）；adapter 改写输入或旧请求缺来源映射时标不可比较。
- 主面板预览最多 600 字符、标题最多 80 字符；会话条目不返回预览或全文。
- 比较文案统一叫「最近请求输入」，不声称供应商已收到。
- 当前只展示主 Agent scope，不做子 Agent 的 Context。

### 6.2 刷新

- 面板可见才请求：同步中 1 秒、就绪后 5 秒、错误按 2 / 4 / 8 / 10 秒退避；每个面板最多一个在途请求；隐藏时释放消费者；切会话丢弃迟到响应。
- 订阅 live `run-state` 的 `context-updated` 消息只刷新匹配会话；该事件只表示「请重新读取」，版本以响应的 `currentVersion` 为准，不拿事件里的 `throughJournalSeq` 当新版本。紧邻的多次更新会合并。
- 条件响应（`notModified`）不带完整清单；版本失效的分页 / 全文明确提示刷新。
- 拉取失败时面板顶部写「上下文读取失败，请重试。」加「重试」，已显示的数据保留；原始技术错误放进可展开的「错误详情」并允许换行。
- 后端返回非 `ContextPanelView`（`null`）时用现有数据拼过渡视图：`describeContext` 的 `ContextState`、projection 的 `activity` 与 `usage`、只有当前条目（没有对比，会话内容没有子类型和轨迹身份）。过渡视图不显示路径、趋势、事件、Bash，底部写「趋势、事件、路径和 Bash 命令需要后端数据，暂未提供」。

### 6.3 Main 侧的边界

实现在 `apps/desktop/src/main/runtime-v2/context-panel-service.ts`。

- **只读。** 面板的所有接口都不写 Journal、不组装上下文、不触发压缩、不启动 Run；打开面板不产生模型请求。
- **「当前」不等历史。** 「当前」的总数、分类和非对话明细读会话投影 `contextEstimate`；预览、全文、路径和对话明细读引擎的只读投影（见[上下文引擎规范](../上下文管理引擎设计/agent-context-engine.md)「给界面的投影」），引擎里没有实例时对话明细用日志折叠出的当前对话现算。两者都没有才退到最近一次请求。趋势和事件来自 SQLite 里的上下文历史，统计和 Bash 要等历史追平日志才给；历史没好不影响「当前」。
- **响应体积。** `describeContextPanel` 以 200 KiB 为目标：超了先去掉预览，再把清单页减半，再把趋势、事件减半并在 `limits` 里标截断；仍超过 1 MiB 就报错。分页接口同样以 200 KiB 为目标、1 MiB 为上限。总量和分类在分页之前算好，截断不影响合计。
- **历史索引按需建。** 只为打开了面板的会话建，不枚举其他会话。每次读取给消费者续 20 秒租约，没有消费者时暂停；同时最多 16 个会话。失败状态保留到用户点重试，不靠轮询反复重建。
- **回退有限。** 索引失败时只回读当前会话的日志，最多 5,000 条事件、8 MiB；超出或查询超时就显示错误，不扩大扫描。
- **历史表不存正文。** `context_*` 表只存每次请求的模型与分类合计、最近两次请求的非对话明细、事件、会话统计和 Bash 统计，不存对话、工具结果和请求体；唯一的原文是 §5.2 说的那两类 Bash 命令。表定义在 `apps/desktop/src/main/runtime-v2/context-history-projection.ts`；查询 Worker 与调度见[数据存储结构与职责](../core-data-storage-design.md)第 15–16 节。

## 7. 跳到轨迹

会话行、「在轨迹中打开」和对话里压缩分隔线的「在轨迹中查看」调用 `revealInTrajectory(target)`（`WorkbenchLayout` 通过 Context 提供）：把中间区域切到轨迹视图（与标题栏「查看执行轨迹」同一份按会话记忆的状态），右侧面板保持打开。

| 面板目标 | 轨迹记录 |
| --- | --- |
| `{ callId }`（工具调用 / 结果） | `kind === "tool"` 且 `callId` 相同 |
| `{ messageId }`（用户 / 助手 / 思考） | `messageId` 相同 |
| `{ compactionId }` | `kind === "compaction"` 且 `compaction.compactionId` 相同 |
| `{ latest: "user" \| "assistant" }` | 最后一条该 kind 的记录 |
| `{ latest: "tool-call" \| "tool-result" }` | 最后一条 `kind === "tool"` 的记录 |
| `{ latest: null }` | 最后一条可见记录 |

- 轨迹视图复用现有选中逻辑：展开所在 Turn 和 Call、滚动到该记录并选中、右侧详情打开。
- 找不到目标时轨迹顶部显示一行可关闭的说明「没有在已加载的轨迹里找到这条记录」；还有更早历史没加载时补一句可点「Load earlier history」。
- 助手消息里的思考段单独成条时，`trajectoryRef` 指向它所属的助手消息；已被压缩进摘要的消息不在会话内容里，没有 `trajectoryRef`。

## 8. 不做

- 编辑上下文（pin、移除、包含 / 排除）；历史请求原文浏览与切换；文件活动、耗时统计；子 Agent 的 Context；导出；跨会话的 Context 洞察页。

## 9. 验收

- 浏览器 mock：`?mock=long-session` 展示完整区块（含路径 87 活跃 / 342 睡眠和 Bash 12 个程序）；`?mock=context-pagination` 覆盖历史失败 / 重试、670 条清单与原文分段、路径活跃满 100、睡眠 1284 条多页、每页 400ms 延迟、首次读睡眠失败一次。
- mock 成功不证明真实 IPC / Loop；真实模型切换、压缩、历史重建与大规模交互只能在 Electron 下验收。
- 浅色、深色、360px 宽、键盘焦点和滚动都要验；路径验收点：数量 / 周期 / 上限与后端一致，长路径与缺失字段可读，Step 完成或压缩后随新版本更新且不重置未变化的分页，快速切会话与翻页期间的乱序响应不混入旧页，仅查看 / 复制不触发文件读取。
- 视觉参考 [context-panel-polish-demo.html](context-panel-polish-demo.html)（边框 B、路径、Bash、事件，待 Electron 复验后删除）。
