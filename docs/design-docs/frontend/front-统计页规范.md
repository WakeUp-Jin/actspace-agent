# 统计页规范（使用统计 + Harness 统计）

设置「活动」分组下的两页：「使用统计」回答**用了多少**（Token、费用、耗时，模型 / 工具 / 命令 / Skills / 子 Agent 各用了多少）；「Harness 统计」回答**Harness 好不好**（固定开销、缓存被打断、工具失败与白费、压缩与披露、改版前后对比）。视觉定稿见 demo `stats-redesign-demo.html`（第 4 版，2026-11-07 确认）。

本文写页面结构、每个数的口径与来源、存储改动。Harness 统计的采集机制（会话日志投影、运行时统计文件、归档）沿用 [Harness 统计设计](../自进化的方案设计/11-Harness统计设计.md)，本文只写变化。

原则：**只算页面上显示的数**。不显示的数据停止采集并删表；统计库 Schema 升到 v18，整库重建一次。

## 1. 共同骨架

- `PageShell width="wide"`，外层 `main` 自己滚动（与现状相同）。
- 顶部一行工具条：时间范围分段（24 小时 / 7 天 / 30 天 / 全部）+ 筛选下拉 + 右侧刷新 `IconButton`。
- 5 张指标卡一排（窄屏 2 列 / 1 列）。指标卡：标签、大数、副行；可点击的指标卡跳到对应卡片或底部明细并排好序（`scrollIntoView` + 短暂高亮）。
- 卡片网格 12 列：`c12 / c8 / c6 / c4 / c3`；`<= 820px` 全部单列。卡片头：图标 + 标题 + 右侧控件（下划线小 tab 或短计数），不换行。
- 底部明细区：下划线 tab（tab 文字后带灰色计数）+ 可排序表格 + 分页。
- 环形图（donut）：中心大数 + 小字说明，右侧图例（色块、名称、数值、占比）；悬停扇区或图例行互相高亮并出提示。
- 排行列表：每行名称、右侧次数、下方灰色副行、底部细进度条；**全部列出**，卡片内固定高度 336px 滚动，滚动条细、只在鼠标在卡片上时出现，底部渐隐遮罩；悬停（或键盘聚焦）一行 250ms 后出详情小卡，离开 150ms 关闭，滚动时关闭，Esc 关闭。
- 详情小卡（hover card）：宽 216px，标题 + `dl` 两列行 + 可选合计行 + 可选灰色注释；与现有 `UsageHoverCard` 同一套外观。
- 颜色只用主题 token；数据系列色用 `--act-context-*`（6 类上下文色）与 `info / warning / danger`，不新增色值。浅色、深色都要验。
- 数字：Token 用 `1.2M / 34.5k`；费用 USD 两位小数（单次请求三位）；耗时 `ms / s / 分 / 时`；比例一位小数。未知写「—」，不写 0。

## 2. 使用统计

### 2.1 工具条

时间范围 + 「模型」「提供商」「工作区」三个下拉（默认「全部」）+ 刷新。

筛选作用范围：

| 筛选 | 作用于 |
|---|---|
| 时间 | 全部（活跃度热力图除外，固定看最近 14 周） |
| 模型、提供商 | 来自模型请求的数：指标卡 Token / 费用 / 缓存命中 / 模型请求，Token 环形图，耗时环形图的模型两段，用量趋势，请求明细、模型、提供商 tab |
| 工作区 | 全部（热力图除外） |

工具、命令、Skills、子 Agent 与辅助模型这几块不按模型 / 提供商拆（一次工具调用不属于某个提供商）。选了模型或提供商时，这几张卡片头下方显示一行灰字「不受模型、提供商筛选影响」。热力图卡片在有任何筛选时显示「不受筛选影响」。

### 2.2 指标卡（5 张）

| 卡 | 大数 | 副行 | 点击 |
|---|---|---|---|
| Token 用量 | 总 Token | `输入 x · 输出 y` | Token 卡 |
| 费用 | 已知费用合计 | 24 小时：`每次请求 $x`；其他：`日均 $x · 每次请求 $y` | 用量趋势（切到费用） |
| 缓存命中率 | 缓存读 ÷（未缓存输入 + 缓存读 + 缓存写） | `缓存读取 x` | Token 卡 |
| 模型请求 | 请求数（含辅助模型请求） | `失败 x · 重试 y` | 底部「模型」tab |
| 工具调用 | 工具调用次数 | `Bash 命令 x 次` | 工具调用卡 |

- 「失败」= 状态为失败的请求；「重试」= 作为前一次失败请求的重试而发出的请求（`retry_of_request_id` 非空）。
- 日均：范围天数（7 / 30；「全部」按第一条记录到现在的天数）。
- 缺口规则沿用现状：缺用量 / 缺价格的请求不计入对应数值，指标卡区下方一行小字「有 N 次请求缺少用量或定价，数值为已知部分的合计」，悬停给原因拆分。费用一个都不知道时写「费用未知」。

### 2.3 卡片

1. **Token 统计**（c6）：环形图，tab「按类型 / 按模型」。
   - 按类型：缓存读取、缓存写入、未缓存输入、模型思考（reasoning）、模型回复（output − reasoning）。中心「总用量」。
   - 按模型：每个模型的总 Token。
2. **耗时统计**（c6）：环形图，tab「按阶段 / 按工具」。每段数值 = 耗时合计 · 次数。
   - 按阶段：模型首字等待（Σ TTFT）、模型输出（Σ 首字到结束）、工具执行（Σ 纯执行时间，不含审批）、等待审批（Σ 审批等待）、辅助模型（Σ 辅助请求耗时）。卡片底部注释「首字等待 = 发出请求到第一个 token；模型输出 = 第一个 token 到结束（思考与回复合在一起）。」
   - 只统计有首字时间的请求进前两段；老会话没有首字时间，这部分请求不进前两段，底部注释后加「N 次请求没有首字记录，未计入」。
   - 按工具：前 7 个工具的执行耗时合计，注释「各工具从开始执行到出结果的时间，不含等待审批。」
3. **用量趋势**（c8）：柱状图，tab「Token / 费用 / 请求」。24 小时按小时 24 柱；7 天、30 天按天；全部按周。柱上方两行灰字「每天最高 x」「每天平均 y」（单位随粒度改「每小时 / 每周」）。柱悬停给日期与数值。日期按**本机时区**分桶。
4. **活跃度**（c4）：14 周 × 7 天热力图，tab「会话 / Token」。5 档颜色（`surface-subtle` 到 `--heat` 的混色），底部月份标签和「少 … 多」图例，格子悬停给日期与数值。会话 = 当天有模型请求的会话数（含子 Agent 会话）。本机时区。
5. **技能加载**（c3）：每个 Skill 一行，次数 = 读 SKILL.md 次数；副行「读 SKILL.md x · 附属文件 y」；详情卡：最近一次、读过的文件（最多 6 个相对路径）。卡片头计数「x 次」。
6. **工具调用**（c3）：每个工具一行，次数；副行「平均 x · 失败 y」；失败率 > 5% 时行尾红色胶囊显示失败率。详情卡：平均 / P95 耗时、平均输出 token、各失败原因次数。
7. **命令执行**（c3）：Bash 命令按程序名一行（`git`、`pnpm`、`grep`…），次数；有子命令统计的程序（git / pnpm / npm / yarn / cargo / go / gh / docker）副行列前 4 个子命令及次数，其他程序副行「平均 x · 失败 y」；失败率 > 10% 显示红色胶囊。详情卡：失败次数与比例、平均耗时、全部子命令次数。
8. **子 Agent 与辅助模型**（c3）：两段，小标题行右侧是该段费用合计。
   - 子 Agent：每个类型（preset）一行，次数 = 被调用次数；副行「平均 x · Token · 费用」；详情卡：失败、平均耗时、Token / 费用。
   - 辅助模型：每个用途一行（会话标题、自动审批、压缩摘要、图片识别、评估），次数；副行费用；详情卡：调用、费用、平均每次。

### 2.4 底部明细 tab

| tab | 列 | 默认排序 |
|---|---|---|
| 请求明细 | 时间、会话、模型、首字、耗时、Token、费用、状态 | 时间倒序，服务端分页（每页 20） |
| 模型 | 模型、提供商、请求、Token、缓存命中、首字（平均）、速度（tok/s）、费用 | Token |
| 提供商 | 提供商、模型数、请求、失败、Token、费用 | 费用 |
| 工具 | 工具、调用、失败、失败率、平均耗时、P95、平均输出 | 调用 |
| 命令 | 程序、次数、失败、失败率、平均耗时、子命令 | 次数 |
| Skills | Skill、读 SKILL.md、读附属文件、最近一次 | 读 SKILL.md |

- 悬停卡（虚线下划线提示可悬停）：请求明细的 模型（单价）/ 耗时（首字等待、模型输出、输出速度、合计）/ Token（缓存读、缓存写、输入、输出、其中思考、合计）/ 费用（按 Token 类型拆、合计）；模型 tab 的 Token、费用也可悬停。复用并扩展 `UsageHoverCard`。
- 除请求明细外的表格都在前端排序，点表头切换升降序。
- 请求明细只列模型请求（含辅助），不再列工具行。
- 去掉：搜索框、状态筛选、「显示明细」开关、「清除筛选」。

### 2.5 偏好

`activity.usage` 存：`range`、`activeTab`（`requests / models / providers / tools / commands / skills`）、`tokenView`、`timeView`、`trendMetric`、`heatMetric`。旧字段 `status / modelFilter / showDetails` 读取时丢弃；旧 `activeTab` 值 `pricing` 回落 `requests`。模型 / 提供商 / 工作区筛选不持久化。

## 3. Harness 统计

### 3.1 工具条

时间范围 + 「模式」「模型」「会话类型」（主会话 / 子 Agent / 侧边对话 / 全部会话，默认主会话）「版本」+ 刷新。去掉工作区筛选。

### 3.2 值得关注

保留现有规则（`HARNESS_FLAG_RULES`），删掉依赖已删数据的两条：「后台任务输出没人读」「碰到步数上限」。每条点击跳到对应卡片或明细 tab（工具失败率 → 工具 tab 按失败率倒序；占用少用 → 占用 vs 使用；插件加载失败 / 监听报错 / 服务从未被调用 → 插件运行时对应 tab；Skill 从未被读取 → 占用 vs 使用的 Skills；压缩后重读率 → 压缩；误睡率 → 渐进式披露；上下文来源变化频繁 → 来源卡并选中该类别）。没有任何一条时整块不显示。

### 3.3 指标卡（5 张，每张带「比上一版本」）

| 卡 | 大数 | 副行 | ⓘ 口径 | 点击 |
|---|---|---|---|---|
| Harness 固定开销 | 每次请求平均（系统提示词 + 工具定义 + 规则 + Skills 目录） | `每次请求 · 占窗口 x%` | 不含对话；每次请求都要先付这一笔 | 上下文卡 |
| 缓存被打断 | 被打断的请求占比 | `的请求 · 这些请求缓存命中 a%，其他 b%` | Harness 自己的内容和同一会话上一次请求不一样的请求占比；后面对比两组请求的实际命中率 | 来源卡 |
| 工具失败率 | 失败调用 ÷ 调用 | `最多：工具名 x 次` | 工具调用里返回失败的比例 | 工具 tab 按失败率 |
| 白费的工具调用 | （同参数重复 + 输出截断）÷ 调用 | `重复 x% · 截断 y%` | 同一轮同参数又调一次；结果太长被截掉 | 工具 tab 按重复 |
| 压缩后重读率 | 压缩后 5 步内重读压缩前读过的文件的压缩占比 | `压缩 x 次 · 拿掉 y` | 越高说明摘要丢了模型还需要的东西 | 压缩卡 |

- 版本变化行：`比 @11 −1.7k`（绿 = 变好，红 = 变坏，灰 = 持平或没有上一版本）。当前版本 = 版本筛选选中的版本，未选时取有数据的最新版本；上一版本 = 版本列表里排在它前面、且在当前时间范围内有数据的版本。没有时写「没有上一个版本可比」。
- 两个版本都在同一时间范围内统计（范围筛选同时作用于两者）。
- 占窗口 = 固定开销 ÷ 这些请求的平均上下文窗口。

### 3.4 卡片

1. **占用 vs 使用**（c12）：tab「工具 / 插件 / Skills」。采用 demo 的 A 画法「每用一次花多少」：每行序号、名称 + 来源胶囊 + 判断胶囊（从未调用 / 占用高 · 少用），右侧大数「≈x token / 每调用一次」，下方一行算式「每次请求带着 a token × b 次请求 = c，调用了 d 次」；按每次成本倒序，默认显示前 7 行，底部「显示全部 N 个」。点一行展开详情（所属插件、失败率、调用率、建议）。顶部一行灰字解释算法。Skills 的「调用」改为「读取」。
2. **每次请求里放了什么**（c6）：6 类上下文环形图（系统提示词、工具定义、规则与注入、Skills 目录、压缩摘要、对话），中心「平均每次请求」。点一个类别，右边来源卡只看这一类。
3. **最大的上下文来源 / 来源 · 某类**（c6）：每行来源 key、平均大小、变化率；变化率 ≥ 20% 的非对话来源标「常变 · 打断缓存」并用 warning 色条。选中类别时卡头有「看全部 ×」。
4. **压缩**（c6）：tab「概览 / 最近」。概览：三格（压缩次数、平均前→后、压缩后又重读）+ 列表（自动 / 手动 / 失败、触发时窗口占用中位数、平均耗时、压缩拿掉的工具输出 条数 · token、两次压缩间隔平均步数）。最近：最近 5 次（时间 · 触发、前 → 后、有重读时标注）。
5. **渐进式披露**（c6）：三格（读取命中活跃、误睡率、查索引后读到）+ tab「活跃 / 睡眠 / 常读」：每个周期活跃路径数直方图（标「上限 100 · 触顶 n 次」）、睡了几个周期后被叫醒直方图（第一档 warning 色 = 误睡）、最常被读的路径前 10。
6. **插件运行时**（c6）：顶部灰字「只按时间和版本统计，不受模式、模型、会话类型筛选影响。」+ tab「服务 / 监听 / 加载」：调用最多的服务（次数 · P95）与「从未被调用的服务 n 个」；触发最多的监听（次数 · 报错）；加载耗时 P50、每个有失败或非内置插件的加载次数与失败、最近一次失败原因。
7. **版本对比**（c6）：卡头两个版本下拉 `A → B`。行：每次请求的上下文、Harness 固定开销、缓存被打断、工具失败率、重复调用、压缩后重读率、读取命中活跃、插件数；变化列着色同指标卡。卡底「A：n 次请求 · B：m 次请求」，任一 < 200 加「· 样本偏少」。

### 3.5 底部明细 tab

| tab | 列 | 默认排序 |
|---|---|---|
| 工具 | 工具、插件、调用、调用率、定义（token）、失败率、输出截断、同参数重复 | 调用 |
| 插件 | 插件、来源、工具数、工具调用、占上下文、加载、加载失败 | 占上下文 |
| 上下文来源 | 来源、类别、平均大小、变化率 | 平均大小 |
| Skills | Skill、目录里占用、出现在请求里、读 SKILL.md、读附属文件 | 读 SKILL.md |
| 压缩记录 | 时间、触发、压缩前、压缩后、耗时、之后重读 | 时间倒序 |

### 3.6 去掉的

7 个 tab 结构、「Agent 循环」「子 Agent 与后台」「运行」整块、成本 vs 使用散点图、每天工具调用趋势、估算准确度、窗口占用分布、审批卡、Bash 沙盒卡、自进化操作卡、自进化插件卡、「写入事件」列、统计自身健康。

## 4. 数据口径与来源

### 4.1 使用统计

全部由使用统计 Worker 的一次 `usage.getActivity` 返回（新字段见 §5.3），SQL 在 Worker 里执行。

| 数 | 来源 |
|---|---|
| Token 拆分、费用、命中率、请求数、失败数 | 小时 rollup（`usage_rollups` 等），按模型 / 提供商维度筛选 |
| 重试数 | rollup 新度量 `retries`（`usage_activity.is_retry` 生成列） |
| TTFT、模型输出时间、输出速度 | `usage_activity` 新列 `ttft_ms`、`decode_ms`，生成列 `ttft_samples`、`decode_tokens`，进 rollup 度量 |
| 辅助模型各用途 | `usage_activity` 新列 `purpose`，进 rollup 维度；`purpose IS NULL` 是主请求 |
| 用量趋势、热力图 | 小时 rollup / `usage_run_counts` 按本机时区偏移分组（`datetime(started_at, '+N minutes')`）；热力图固定最近 98 天 |
| 工作区筛选 | 不进 rollup。选了工作区时走明细路径：先从 `session_catalog` 取该工作区的会话（`COALESCE(worktree.sourceWorkspaceRoot, workspace_root)`），再按 `usage_activity_session_idx` 汇总成临时表（与现有标题搜索同一机制），Harness 表通过 `harness_session_meta.workspace_root` 筛选 |
| 工具调用、工具耗时与失败、平均输出、P95 | `harness_tool_rollup`（会话类型 = 全部） |
| 命令执行 | 新表 `harness_bash_rollup` |
| 技能加载 | `harness_skill_rollup` + 新表 `harness_skill_file` |
| 子 Agent | `harness_delegation`（瘦身后）按 preset 统计次数、失败、耗时；Token / 费用 = 该 preset 的子会话（去重）在范围内的 `usage_activity` 合计 |
| 等待审批 | `harness_tool_rollup.approval_wait_ms / approval_wait_samples` |
| 工具执行耗时合计 | `harness_tool_rollup` 新列 `duration_ms / duration_samples`（`tool-workflow/run-start` 到 `tool/result`） |

- 范围「30 天」两页统一为 30 × 24 小时（使用统计原来是 31 天）。
- 统计索引不可用而回退到会话记录时，只有来自 `usage_activity` 的数可用；工具、命令、Skills、子 Agent、等待审批与工具执行两段显示「统计索引暂不可用」。
- `usage_activity` **不再写工具行**（`kind='tool_invocation'`）：工具相关的数全部来自 Harness 表，工具行只是重复数据。

### 4.2 Harness 统计

| 数 | 来源 |
|---|---|
| 固定开销 | `harness_request` 的 `b_system + b_tools + b_rules + b_skills`，`has_manifest=1` 的请求平均；窗口占比用同批请求的 `context_window` 平均 |
| 缓存被打断 | `harness_request` 新列 `harness_changed`（0 / 1 / NULL）；命中率对比按 `harness_changed` 分组算 `cache_read / (input + cache_read + cache_write)`，只取 `cache_read` 非空的请求 |
| 工具失败率、最多失败的工具 | `harness_tool_rollup.calls / failed / failure_codes` |
| 白费的工具调用 | `harness_tool_rollup.repeated / truncated`；分子封顶为调用数 |
| 压缩后重读率、压缩卡 | `harness_compaction` |
| 渐进式披露 | `harness_disclosure_cycle`、`harness_disclosure_rollup`、`harness_path_reads` |
| 占用 vs 使用 | 工具：`harness_tool_rollup` exposures / schema_tokens / calls；插件：按工具归属汇总；Skills：`harness_entry_rollup`（kind = skills）的平均 token + `harness_skill_rollup` |
| 上下文与来源 | `harness_request` 6 类、`harness_entry_rollup` |
| 插件运行时、插件 tab | `harness_runtime_hourly`（service / listener）、`harness_plugin_inventory`、`harness_tool_owner` |
| 版本 | `harness_revision_info` + 数据中出现的版本；子 Agent 会话版本仍取父会话（`harness_delegation`） |
| 比上一版本 | 每张表一次 `GROUP BY 版本` 查询，一次拿到所有版本的 5 个指标 |

**「缓存被打断」的判定**：每次 `request/context` 时，把非对话条目（kind 不是 message / tool-call / tool-result / thinking）按 key 排序，拼 `key:tokens` 取 sha1，存进会话重放状态；与同一会话上一次请求的摘要不同记 1，相同记 0，会话第一次请求记 NULL（不参与）。条目新增、消失、token 数变化都算。只比 token 估算数，内容变了但估算数相同的情况抓不到，ⓘ 不另作说明。

## 5. 存储改动（Schema v18，整库重建）

### 5.1 使用统计表

- `usage_activity` 加列：`purpose TEXT`、`ttft_ms REAL`、`decode_ms REAL`；生成列 `is_retry`（`retry_of_request_id IS NOT NULL`）、`ttft_samples`（`ttft_ms IS NOT NULL`）、`decode_tokens`（`decode_ms IS NOT NULL` 时取 `output_tokens`）。
- rollup：维度加 `purpose`；度量加 `ttft_ms, ttft_samples, decode_ms, decode_tokens, retries`（`usage-rollups.ts` 与 `usage-batch-write.ts` 两处同改）。
- 使用统计投影：`compactUsageEvent` 的 `assistant/message` 白名单加 `firstTokenAt`；`activityRowForRequest` 算 `ttftMs = firstTokenAt − header.time`、`decodeMs = 结束 − firstTokenAt`（都要求非负）；`activityRowForAuxiliary` 已带 `purpose`；不再生成工具行。
- `UsageActivityRow` 加 `ttftMs?`、`decodeMs?`；`UsageActivityKind` 只剩 `llm_request`。

### 5.2 Harness 表

保留并瘦身：

| 表 | 保留列 | 删除列 |
|---|---|---|
| `harness_tool_rollup` | plugin_id, exposures, calls, failed, failure_codes, schema_tokens, schema_samples, approval_wait_ms, approval_wait_samples, duration_ms（新）, duration_samples（新）, duration_hist, output_tokens, output_samples, output_hist, truncated, repeated | completed, denied, aborted, unknown_outcome, approval_asked / user_approved / user_denied / timed_out / auto_approved / auto_declined / session_grant / scope_denied, retried, sandboxed, unsandboxed, unknown_env, escalations, background, folded, folded_tokens, last_used_at |
| `harness_entry_rollup` | 全部 | — |
| `harness_request` | 现有列 + `harness_changed`（新） | — |
| `harness_skill_rollup` | source, listed, skill_reads, asset_reads, last_read_at | selected |
| `harness_compaction` | 除右列外全部 | turns_since, read_before |
| `harness_disclosure_cycle` | hour…model, active, cap_hit, active_read | time, sleeping, index_tokens |
| `harness_disclosure_rollup` | mis_sleeps, slept_paths, index_reads, index_conversions, sleep_hist | reads, sleeping_reads, wakes, wake_cycles |
| `harness_path_reads` | 全部 | — |
| `harness_delegation` | hour…model, time, preset_id, status, child_session_id, duration_ms | tool_uses, return_tokens |
| `harness_tool_output` | seq, tokens | hour, revision, mode, model, tool, compaction_id |

新表：

| 表 | 主键 | 列 |
|---|---|---|
| `harness_bash_rollup` | session × 维度 × program × subcommand | calls, failed, duration_ms, duration_samples |
| `harness_skill_file` | session × 维度 × skill_id × file | reads, last_read_at |

- Bash：`tool/call` 的 `bash` 调用用 `parseBashPrograms(args.command)` 解析，存进待结束调用；`tool/result`（`denied` 不计）时每个程序记 1 次调用，失败的调用每个程序记 1 次失败，耗时用同一个执行耗时（管道命令的每个程序都记整条命令的耗时，详情卡平均耗时按此口径）。`subcommand` 只对 `BASH_SUBCOMMAND_PROGRAMS` 记，其他为空串。
- Skill 文件：`file` = 相对 Skill 目录的路径（SKILL.md 本身记 `SKILL.md`）。

整表删除：`harness_turn`、`harness_session_rollup`、`harness_aux_rollup`、`harness_owner_rollup`、`harness_background_task`、`harness_evolution_op`、`harness_stats_health`。

投影随之删除的处理：事件来源计数（每个事件一次）、`task` / `queue-return` / `agent/inbox/spliced` / `llm/retry` / `background/task` 处理、模式切换计数、turn 行、辅助调用计数（保留「压缩失败」分支）、审批除等待时长外的计数、沙盒与出沙箱、自进化操作、失败后重试；重放状态去掉 `turns / turns_ / turnOfRun / activeRuns / turnFailed / recentCalls / recentOrder / tasks` 中不再使用的字段（子 Agent 激活仍需 `subagents / tasks`）。`turn/end` 仍清理 `turnDigests`。

### 5.3 运行时统计

- 停止记录 `dependency`（`instrument.ts`），查询与 Worker 忽略旧文件里的 `dependency` 行。
- 停止写 `health` 行（`sink.ts`），读取时忽略旧文件里的 `health` 行；写失败仍把数据留在内存下次再写。

### 5.4 接口

- `UsageStatisticsGetInput` 加：`workspaceRoot?`、`utcOffsetMinutes?`（本机时区偏移，用于趋势与热力图分桶）；去掉页面不再用的 `search / status / kind` 的界面入口（字段保留给守卫兼容，Worker 仍支持）。
- `UsageActivitySnapshot` 加：
  - `summary` 增 `failedRequestCount`、`retryCount`；
  - `timing`：`ttftMs, ttftSamples, decodeMs, decodeTokens, untimedRequests, toolMs, toolSamples, approvalWaitMs, approvalSamples, auxiliaryMs, auxiliaryCount`；
  - `series`：`{ unit: "hour" | "day" | "week", buckets: { start, tokens, costUsd, requests }[] }`；
  - `heatmap`：`{ days: { date, sessions, tokens }[] }`（98 天）；
  - `aggregates.models` 增 token 拆分、`ttftMs/ttftSamples/decodeMs/decodeTokens`；
  - `tools / commands / skills / subagents / auxiliary` 行；
  - `filterOptions`：`models, providers, workspaces`；
  - `harnessUnavailable?: true`（回退时）。
- Harness 查询 kind 改为：`options`、`overview`（flags、5 个指标与上一版本对比）、`usage-vs`（工具 / 插件 / Skills 行）、`context`、`disclosure`（含压缩与最近记录）、`plugins`（运行时 + 插件行）、`versions`（版本列表与对比）。页面打开时按卡片需要并行请求，结果按「kind + 筛选 + 数据版本」缓存（沿用现有 hook 的缓存与同步轮询）。

## 6. 不做

- 不做统计的导出、分享、自定义时间段。
- 不把运行时统计归属到会话、模式、模型。
- 不为 Harness 数据做从会话日志直接读的回退。
- 不保留旧 tab 结构的兼容入口。

## 7. 验收

- 两页浅色 / 深色、928px / `<= 820px` / `<= 600px` 截图；长模型名、长路径截断且悬停可见。
- 使用统计：四档范围切换；模型 / 提供商 / 工作区筛选后数值变化、受影响范围提示出现；请求明细翻页；所有悬停卡（列表行、表格四列、模型 tab 两列）出现与关闭（离开、滚动、Esc）；回退时 Harness 段显示不可用。
- Harness 统计：值得关注跳转与高亮；5 个指标的上一版本变化颜色正确；占用 vs 使用三个 tab 与展开；上下文类别联动来源卡；压缩 / 披露 / 运行时 tab；版本对比下拉；明细 5 个 tab 排序。
- 数据：Schema 17 的库打开后自动重建为 18；重建后旧会话 TTFT 为空且计入「没有首字记录」；归档会话读回时被删的表 / 列被忽略；新增 Bash、Skill 文件、缓存被打断、工具耗时合计都有单测。
