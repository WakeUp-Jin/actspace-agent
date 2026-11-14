# Harness 统计设计

本文定义 Harness 统计的方向与决策（D1–D15）；执行计划见 [20261101-harness-stats](../../exec-plans/completed/20261101-harness-stats.md)。

## 1. 为什么做

自进化要修改 Harness，修改要有依据。比如要删掉 todo 工具，依据应该是“它的定义每次请求都占 770 token，30 天只被调用 30 次”，而不是感觉。人优化 Harness 也一样。

现有「使用统计」只管 Token、费用和工具调用次数。Harness 统计关心的是 Harness 本身：每个插件、工具、上下文来源、Skill、渐进式披露、压缩、Agent 循环、子 Agent、后台任务和 Harness 版本的使用情况。

使用者分两类，共用同一层数据：

- **人**：设置 →「Harness 统计」面板（本期）。
- **Agent**：自进化时用工具查询同一份统计（第二期；本期把查询接口按“Agent 也能调用”设计好，不做工具）。

## 2. 已确认的决策

| # | 决策 | 原因 |
|---|---|---|
| D1 | 面板和 Agent 查询共用一层数据 | 人和 Agent 看到同一个事实 |
| D2 | 会话日志 `journal.jsonl` 是唯一事实源，SQLite 只是可重建的汇总 | 历史会话立即有数据；汇总逻辑出错可以重建 |
| D3 | 核心视角是“成本 vs 使用”：可用次数、调用次数、占用 token 一起看 | 只看调用次数不足以判断删不删 |
| D4 | 全部指标一期实现；只有 Agent 查询工具放第二期 | 第二期依赖第一期的数据打磨好 |
| D5 | 筛选：时间、模式、模型、工作区、会话类型、Harness 版本；子 Agent 会话默认分开 | 用户要求按模式判断“哪些工具在哪种模式下没用” |
| D6 | 所有数据带 Harness 版本，支持两个版本对比 | 自进化改完要能验证效果 |
| D7 | 设置「活动」分组新增「Harness 统计」页，视觉方向 A（与「使用统计」同构） | 已选定 |
| D8 | 会话日志里没有的运行时数据，另存到 `<dataRoot>/harness-stats/YYYY-MM.jsonl`（方案 C），不写进会话日志，也不直接写 SQLite | 会话日志只放会话事实；原始文件保证新指标能补算历史 |
| D9 | 会话删除后统计数据保留 | 统计只存名字、次数和耗时，不存参数和对话内容 |
| D10 | 服务调用记“插件 × 服务 × 方法”的次数、耗时、报错，加“调用方 → 被调用方”次数汇总；不逐次记录 | 一切以不消耗资源为前提 |
| D11 | 增量读取 + 只读一遍（并入使用统计的 Worker）+ 按小时预汇总 + 按 tab 按需查询 + 缓存 | 打开页面的开销只和新增数据量有关 |
| D12 | 首次补历史时先显示已算好的部分并显示进度；页面打开时会话日志有新内容，2 秒后只刷新当前 tab | 已确认 |
| D13 | 运行时统计做成独立的 Host 插件包 `@actspace/harness-stats`，不做成 Harness 插件；挂载层只加通用观察口 | Harness 插件无法包装兄弟插件、没有数据目录，且会被自进化删改（见 3.2） |
| D14 | 「压缩拿掉的工具输出」与「查睡眠索引 / 索引转化」从现有日志算出 | 保留这两项 |
| D15 | 会话删除时把该会话的汇总追加到归档文件，统计永久保留 | 统计库重建后已删除会话的日志不在了，只能靠归档 |

## 3. 数据从哪来

### 3.1 会话日志里已经有的（不新增日志事件）

调研结论：面板需要的会话级事实**全部能从现有日志算出来**，本期不新增任何会话日志事件。

| 指标 | 来源事件与字段 |
|---|---|
| 工具可用次数 | 每次请求时最近一条 `request/tools` 的 `tools[].name` |
| 工具定义 token | `contextEstimate` 折叠出的工具项 `estimatedTokens`（key `["tool", pluginId, name]`） |
| 调用、结果、失败原因 | `tool/call`（`callId, pluginId, name, args`）、`tool/result`（`status, failure.code, failure.phase`） |
| 纯执行耗时 | `tool-workflow/run-start` 到 `tool/result` 的信封时间差（run-start 在审批之后、执行体之前写入） |
| 输出 token | `tool/result.modelOutput` 按统一估算（`ceil(字数/4)`，与上下文估算同一口径） |
| 输出被截断 | `modelOutput` 文本中的截断标记：Bash `[Output truncated;`、read_file `[Showing lines`（单行被截短是 `[line truncated`）、list_directory `[Showing first`、write_file / edit_file 的 diff 和 tool-runtime 兜底 `[Output truncated`、grep/glob 方括号后缀、web_fetch `[Content truncated]`。调用参数里带 `offset` / `limit` 的读取是主动分段，不算截断 |
| 审批 | `tool/result.approvalMode`（`auto / manual / session`）与 `approvalReason`；`permission/asked`（`requestedAt`）、`permission/decided`（`kind, decidedAt, code`）、`permission/grant-used`、`permission/scope-denied` |
| bash 沙盒 | `tool/result.detail[label="environment"].value.sandboxed`；出沙箱申请 = `tool/call.args.sandbox_permissions === "require_escalated"` |
| 同参数重复 / 失败后重试 | 同一 turn 内 `tool/call` 的 `name + args` 摘要相同；失败结果之后下一次调用同名工具 |
| 模式、模型 | `request/header.agentMode`、`request/header.model`（每一步） |
| 上下文 6 类、来源、条目 | 每个 `request/context` 时 `applyContextEstimate` 折叠状态的分类与非对话明细（2026-11-06 起日志里不再存估算明细） |
| 窗口占用、估算准确度、缓存命中 | `request/header.contextWindow`、折叠状态的 `totalEstimatedTokens`、`assistant/message.usage`（`inputTokens, cacheReadTokens, cacheWriteTokens`） |
| Skills | 列表：`request/system-prompt.modelFacts` 里 `core/skills-catalog` 的 `{id, location, source}`；选中：明细 key 的 section 为 `core/selected-skills`；读取：`read_file` 结果 `detail[label="actspace.context.file"].value.path` 等于某个 skill 的 `location`，或位于其目录下（附属文件） |
| 活跃 / 睡眠路径 | `plugin/actspace.context/state`（`fact / candidate / applied / index / fork`）。按 `applyStateEvent` 重放，读取发生时路径是活跃还是睡眠由重放状态判断（按 `fact.sourceSeq` 排序） |
| 压缩 | `compaction/start / summary / end`（`trigger, durationMs, beforeTokens, afterTokens`）；失败 = `llm/auxiliary-end` 中 `purpose="compaction"` 且 `status` 为 `failed / aborted` |
| 压缩拿掉的工具输出 | 同一压缩事务里的 `surface/replaced.data.sourceEventSeqs` 列出被摘要替换的原始事件编号；其中是 `tool/result` 的，按工具名累计条数和输出 token |
| 查睡眠索引 | 睡眠索引是一个文件，路径记在 `plugin/actspace.context/state` 的 `index / applied` 事件 `indexPaths` 里；`read_file` 结果的 `actspace.context.file.path` 属于当时的 `indexPaths` 即算查了一次。查完后 5 步内读了索引里列出的睡眠路径，算一次“索引转化”。用 bash `cat` 看索引不计入 |
| Agent 循环 | `turn/start`、`turn/end.reason`（`completed / step-limit / aborted / failed`）、`step/start`、`llm/retry.failure` |
| 用户介入 | 中止：`turn/end.reason="aborted"`；排队：`plugin/actspace.agent-service/task` 的 `accept` 发生在有运行中的 run 时；插入引导：`plugin/actspace.agent-service/queue-return` 的 `return-steering` 与旧日志 `agent/inbox/spliced.source="steer"` |
| 模式切换 | `agent/mode-set` |
| 辅助模型调用 | `llm/auxiliary-start / end`（`purpose, status`，时间差为耗时） |
| 子 Agent | `delegation/requested / completed`（父会话）、`delegation/child-terminal`（子会话：`durationMs, toolUseCount, usage, text, status`） |
| 后台任务 | `background/task`（`start` / `settle`），没人读输出 = 没有任何 `task_output` 调用（老日志还有 `task_wait`）的 `args.taskId` 指向它，且 `settle.delivery` 不是 `wait`（老日志） |
| 侧边对话 | 会话头 `lineage.origin="side-chat"`（目录已有 `side_chat_parent_id`） |
| Harness 版本 | `plugin/actspace.agent-service/run` 的 `start.harness.revision`，按 `runId`（= `agentRunId`）关联到 turn；没有 run 事件的会话（子 Agent、侧边对话）取父会话发起调用时的版本，仍取不到记为“未知版本” |
| 自进化操作 | `tool/call.name="plugin_manager"` 的 `args.action` 与对应 `tool/result.status` |

`compaction/prune` 事件只注册、没有生产者，不使用；“压缩拿掉的工具输出”以 `surface/replaced` 为准。

### 3.2 运行时才有的（新增统计文件）

| 指标 | 采集点 |
|---|---|
| 服务调用：插件 × 服务 × 方法的次数、耗时、报错 | 插件挂载层包装每个插件拿到的服务对象 |
| 依赖：调用方插件 → 被调用方插件的次数 | 同上，调用方 = 拿服务的插件，被调用方 = 提供该服务的插件 |
| 监听与拦截：插件 × 事件的触发次数、耗时、报错 | 插件挂载层包装 `ctx.on / ctx.once` 注册的回调 |
| 插件生命周期：加载成功 / 失败、失败原因、加载耗时 | 插件挂载层包装 `apply` |
| 插件清单：每个版本有哪些插件、来源、提供的服务、注册的工具 | 挂载时写一条清单；工具归属由插件调用 `tools.runtime.register` 时的 `definition.pluginId / name` 得出。清单里同时记加载器的插件 ID（`plugin`，如 `filesystem-read`）和工具自报的 `toolPluginId`（如 `actspace.filesystem-read`），两者可以不同；查询时工具一律归到加载器 ID（先按工具名查归属表，再按 `toolPluginId` 反查），插件行、插件规则和工具 tab 的插件列用同一个 ID |
| 统计自身健康：写文件失败次数 | 写文件的地方自己计数；健康行记录的是“上次成功写入以来新增的失败次数”（增量），读取时相加，不会重复累计 |

**统计是一个独立的 Host 插件包 `@actspace/harness-stats`**，和沙箱、后台任务一样挂在 Host 层、位于 Harness 之外。采集、内存计数、写统计文件全部在这个包里；拿掉这个包就没有运行时统计，其他功能不受影响。

不做成 Harness 插件，原因：

1. Harness 插件彼此隔离，只能拿到清单声明的服务，无法包装兄弟插件（`cordis-tree.ts` 的注入校验）。
2. Harness 插件没有数据目录服务，无处写文件。
3. 自进化修改的正是 Harness；统计放在 Harness 里，会被被统计的对象删改，版本对比也会被它自身的变化干扰。
4. 每次切换 Harness 版本都会重新挂载，内存计数会被打断。

**插件挂载层**（`packages/composition/cordis-adapter/src/cordis-tree.ts` 给每个插件包一层 `ctx.extend` 的位置，现有代码已经在这里限制 `provide`）只加一个通用的观察口：挂载选项里有观察者就把插件的 ctx 交给它包装，没有就原样挂载。Host 启动时把 `@actspace/harness-stats` 的观察者传进去（CLI 不持久化的临时运行不开统计，启动选项 `harnessStats: false`），**所有插件（包括用户安装的和自进化生成的）不用改一行代码就会被统计**。

包装规则：

- 只在开启统计时包装；关闭时（`ACTSPACE_HARNESS_STATS=0`）完全不包，零开销。
- 服务对象用 Proxy 包装，**只包函数属性**，调用时用 `Reflect.apply(fn, 原对象, args)`，保证使用 JS 私有字段 `#x` 的服务不报错；同一个插件对同一个服务对象拿到的是同一个 Proxy（WeakMap 缓存），避免同一插件内 `===` 比较失效。
- 返回 Promise 的方法在 Promise 结束时记耗时和是否报错。
- 计数只在内存里累加（Map 键：小时 + 版本 + 插件 + 类型 + 名称 + 方法），耗时记成固定 16 档对数直方图，不存每一次调用。

**写文件**：每 60 秒（有新数据时）以及 Host 退出时，把内存累加值追加成若干行写进 `<dataRoot>/harness-stats/YYYY-MM.jsonl`，然后清零。每行一个“小时 × 版本 × 插件 × 类型 × 名称 × 方法”的累计值。内存键数量上限 20,000，超过时立即写一次文件。写失败时把失败次数计入健康指标，数据留在内存等下次再写。

**归属的取舍**（D10“以不消耗资源为前提”）：服务、监听、生命周期这类运行时数据**只按时间和 Harness 版本归属**，不归属到会话、模式、模型、工作区。面板上选了这些筛选时，插件 tab 里的服务、监听、加载三块显示一行提示“只支持按时间和版本筛选”。要精确归属到会话需要在每一步建立异步上下文，开销和改动面都不划算。

### 3.3 版本列表

来自 `<dataRoot>/harness-state/selections.jsonl`（Harness 选择记录：`harnessId, revision, description, 时间`），加上数据里出现过的版本号。

## 4. 汇总与存储

所有表都在现有使用统计的 SQLite（`<dataRoot>/runtime-v2/usage-read-model.sqlite`）里，由同一个 Worker 维护。Schema 版本从 14 升到 15，升级时按现有机制整库重建；16 改为不再统计分叉 / 侧边对话复制来的父会话前缀（见下文“继承的历史”），同样整库重建以去掉旧库里的重复计数。

**v18 瘦身（2026-11-07）**：页面不显示的数据停采并删表删列，新增 Bash 程序与 Skill 文件两张表；逐列清单见 [统计页规范](../frontend/front-统计页规范.md) §5.2–§5.3。下表已按 v18 更新。

### 4.1 会话级表（从会话日志汇总，随会话增量同步）

会话级表都以 `session_id` 为首列，加入 `read-model-sync.ts` 的同步表清单，重建时走现有的 `building_*` 暂存再整体发布。汇总在使用统计的同一个日志事务里完成，跨批次的重放状态存在 `harness_session_state`（`last_seq` + 状态 JSON），同一批事件重放不会重复计数。

维度：汇总表的主键是 `session_id × hour × revision × mode × model × 对象`（`hour` 为 UTC 整点），任意时间段、版本、模式、模型的筛选都由小时行相加得出。按编号存的明细表（turn、请求、压缩、披露周期、子 Agent、后台任务、自进化操作）把这四个维度存成普通列。工作区和会话类型存在 `harness_session_meta`（每次查询前从 `session_catalog` 刷新，会话删除后标记 `deleted` 保留），不在每行重复存。

**会话删除后保留（D9）**：会话从目录移除时，Worker 先把这个会话在各会话级表里的行（连同工作区、会话类型等目录字段）打包成一行，追加到 `<dataRoot>/harness-stats/archived-sessions.jsonl`，再按现有逻辑清理。查询时归档会话与现存会话一起参与汇总；统计库重建时把归档文件重新读回来。归档行带 Schema 版本，版本不一致的归档行在读回时按字段名迁移，缺的列记为空。

“维度”= 小时 × 版本 × 模式 × 模型。

| 表 | 粒度 | 主要列 |
|---|---|---|
| `harness_tool_rollup` | 会话 × 维度 × 工具 | 所属插件、可用次数、调用、失败、失败码分布（JSON）、定义 token、等待审批毫秒和与次数、执行耗时和与次数、执行耗时直方图、输出 token 和与直方图、截断、同参数重复 |
| `harness_bash_rollup` | 会话 × 维度 × 程序 × 子命令 | 调用、失败、耗时和与次数；子命令只对 git / pnpm / npm / yarn / cargo / go / gh / docker 记，其他为空串 |
| `harness_tool_output` | 每条工具结果（会话 × 事件编号） | 输出 token；只供压缩事务按编号找回被拿掉的工具输出，不归档 |
| `harness_entry_rollup` | 会话 × 维度 × manifest 条目 | 条目 key、类别（tool / skill / section / supplement / model-facts）、6 类中的哪一类、owner、出现次数、token 和、token 最大值、变化次数（与同一会话上一次请求的同一条目 token 数不同即算一次）、可比次数 |
| `harness_request` | 每次模型请求 | 维度、时间、估算 token、6 类 token、窗口大小、实际输入 / 缓存读 / 缓存写、manifest 是否可比、Harness 内容是否和上一次请求不同（`harness_changed`，缓存被打断） |
| `harness_skill_rollup` | 会话 × 维度 × Skill | 来源、列出次数、读 SKILL.md 次数、读附属文件次数、最后读取时间 |
| `harness_skill_file` | 会话 × 维度 × Skill × 文件 | 读取次数、最后读取时间（文件为相对 Skill 目录的路径） |
| `harness_compaction` | 每次压缩 | 维度、时间、触发方式、成功与否、失败码、耗时、前后 token、距上次压缩的步数、触发时窗口占用、拿掉的工具输出条数与 token、压缩后 5 步内重读的文件数 |
| `harness_disclosure_cycle` | 每个披露周期 | 维度、周期号、活跃数、是否碰到 100 上限、活跃路径中下个周期被读的数量 |
| `harness_disclosure_rollup` | 会话 × 维度 | 误睡次数（睡下后下一个周期就被读）、睡下的路径数、查索引次数、索引转化次数、唤醒前睡眠周期直方图 |
| `harness_path_reads` | 会话 × 维度 × 路径 | 读取次数、最后读取时间（只给“最常被读的路径”用，取前 50） |
| `harness_delegation` | 每次子 Agent 调用 | 维度、时间、类型（presetId）、状态、子会话、耗时（终止状态与耗时来自子会话侧事件，查询时按 invocation 合并） |

v18 删除的表：`harness_turn`、`harness_session_rollup`、`harness_aux_rollup`、`harness_owner_rollup`、`harness_background_task`、`harness_evolution_op`、`harness_stats_health`。辅助模型调用改由使用统计的 `usage_activity.purpose` 提供。

**继承的历史只在父会话记账**：分叉和侧边对话的日志开头是父会话 `[0..lineage.parentBoundarySeq]` 的原样副本（seq 相同，边界保证没有未结束的轮、请求和工具调用）。这些事件在父会话里已经执行并统计过，所以同步时把边界随会话一起传给投影：Harness 投影对这段事件只推进重放状态（版本、模式、模型、披露、Skills 等，让分支自己的请求拿到正确的版本），不写任何统计行，也不读写 `harness_tool_output`；跨过边界时清掉父会话里尚未结束的“压缩后重读”跟踪。使用统计的投影和回退查询直接跳过这段事件（标题仍然取）。子 Agent 会话不复制事件，不受影响。判断不能只看“Harness 与使用统计的数相等”，两边以前都重复记了，要对照分支自己真正新执行的轮、请求和工具。

辅助表：`harness_session_state`（每个会话的重放游标和状态）、`harness_session_meta`（工作区、会话类型、父会话、是否已删除）。

### 4.2 运行时表（从统计文件汇总）

| 表 | 粒度 | 列 |
|---|---|---|
| `harness_runtime_hourly` | 小时 × 版本 × 插件 × 类型（service / listener）× 名称 × 方法 | 次数、报错、耗时和、耗时直方图（v18 起不再记 dependency，旧文件里的 dependency 行读取时忽略） |
| `harness_plugin_inventory` | 版本 × 插件 | 插件 ID、来源（内置 / 用户安装 / 自进化 / 未知）、提供的服务、加载次数、失败次数、最近失败原因、加载耗时直方图、首次 / 最后出现时间 |
| `harness_tool_owner` | 版本 × 工具 | 注册该工具的插件、工具定义里的 pluginId、最后出现时间（工具 tab 用它把工具归到插件） |
| `harness_revision_info` | 版本 | Harness ID、版本号、说明、选择时间（来自 `selections.jsonl`） |

v18 起统计文件不再写 `health` 行，旧文件里的 health 行读取时忽略。统计文件按“文件名 → 已读字节偏移”的游标增量读取（存在 `index_state`，键 `harness-stats-file:<文件名>`），只处理以换行结尾的完整行；文件变小或游标失效时整表重建。

### 4.3 分位数

耗时和输出 token 用固定 16 档对数直方图（耗时：1ms 起每档 ×2；token：16 起每档 ×2），P50 / P95 取所在档的上界，面板文案写“约”。这样任意时间段的分位数都能由按小时汇总的直方图相加得出。

## 5. 增量与按需计算

1. **平时零开销**：不开统计页时不做任何汇总。唯一常驻的是运行时计数（内存累加 + 每分钟最多追加一次文件）。
2. **打开页面**：先用 SQLite 现有内容立刻出结果；同时启动一次增量同步（复用使用统计的同步任务和进度，会话日志只读一遍，同时喂给使用统计和 Harness 统计；再读统计文件的新增部分）。同步进行中页面顶部显示“正在补齐历史 · 已读 120 / 480 个会话”，同步完成后自动刷新当前 tab。
   - **数据版本**：主进程对汇总库取一个指纹（会话重放游标之和、会话目录行数与删除数、统计文件游标之和、版本记录数）。同步中每 3 秒和结束时各比一次，只有指纹变了 `dataVersion` 才加一；页面同步中每秒查一次 `getStatus`，版本变了才重查当前 tab。`dataVersion` 从 0 开始，0 是合法版本（空库首次补历史前）；页面用“还没收到版本”而不是 0 表示未知，所以首次补历史 0→1 也会自动重查。没有新数据就不重查，避免“查询触发同步、同步又触发查询”的循环。
3. **按卡片查询**：页面打开时按卡片需要的 kind 并行查询，结果按“kind + 筛选条件 + 数据版本”缓存，重复打开不重算（v18 前是按 tab 查询）。
4. **改筛选**：用新的筛选条件重查，旧缓存不再命中。
5. **页面开着时**：收到会话日志更新（流式文本增量除外），2 秒防抖后刷新当前页面的查询。
6. **查询本身**：全部是 SQL 聚合，Worker 里执行，不占主线程。

## 6. 「值得关注」规则

在 Worker 里对当前筛选范围的汇总结果逐条判断，不调用模型。每条规则有最小样本，不够样本不报。阈值集中在一个常量表里（`packages/util/shared/src/harness-stats.ts`），方便以后调整，也方便第二期 Agent 查询时引用同一套规则。v18 删掉了依赖已删数据的「后台任务输出没人读」「碰到步数上限」两条。点击后跳到哪张卡片见 [统计页规范](../frontend/front-统计页规范.md) §3.2。

| 规则 | 等级 | 条件（最小样本） |
|---|---|---|
| 工具占用高、使用少 | 关注 | 调用率 < 1%，定义 ≥ 300 token（可用次数 ≥ 200） |
| 插件占用高、使用少 | 关注 | 插件所有工具合计调用率 < 1%，合计定义 ≥ 500 token（可用次数 ≥ 200） |
| 工具失败率高 | 异常 | 失败率 > 5%（调用 ≥ 30） |
| 插件加载失败 | 异常 | 失败次数 > 0 |
| 监听器报错 | 异常 | 报错 > 0 |
| 服务从未被调用 | 提示 | 范围内 0 次调用（范围 ≥ 7 天） |
| Skill 从未被读取 | 提示 | 0 次读取（列出 ≥ 200 次）；超过 3 个时合并成一条「N 个 Skill 从未被读取」，点击跳到上下文 tab |
| 压缩后重读率高 | 关注 | > 20%（压缩 ≥ 10 次） |
| 误睡率高 | 关注 | > 10%（睡眠路径 ≥ 50 条） |
| 上下文来源变化频繁 | 提示 | 非对话来源的变化率 > 20%（出现 ≥ 200 次） |

## 7. 页面

2026-11-07 起页面按 [统计页规范](../frontend/front-统计页规范.md) §1、§3 重做（视觉见 `docs/design-docs/frontend/stats-redesign-demo.html`）：不再分 7 个 tab，改为工具条 + 值得关注 + 5 张带「比上一版本」的指标卡 + 卡片网格（占用 vs 使用、每次请求里放了什么、上下文来源、压缩、渐进式披露、插件运行时、版本对比）+ 底部明细 tab。去掉工作区筛选；Token 与费用仍只在「使用统计」。

查询 kind 对应改为 `options / overview / usage-vs / context / disclosure / plugins / versions`（`packages/util/shared/src/harness-stats.ts`），页面按卡片并行请求，结果按「kind + 筛选 + 数据版本」缓存；§5 的增量同步与数据版本机制不变。

## 8. 不做什么

- 不做 Agent 查询工具（第二期）。
- 不新增会话日志事件，不改任何工具或插件的行为。
- 不把运行时数据归属到会话、模式、模型、工作区。
- 不在统计页里提供“删除插件 / 工具”之类的操作。
- 不记录工具参数、文件内容、对话内容（唯一例外：最常被读的路径列表显示路径本身，数据只在本地）。
- 不为 Harness 统计做“从会话日志直接读”的降级查询：SQLite 不可用时显示错误和重试。

## 9. 风险

| 风险 | 缓解 |
|---|---|
| Proxy 包装让某些服务对象行为变化（`===` 比较、`#private`、Cordis 自带代理） | 只包函数、`Reflect.apply` 回原对象、同插件同对象缓存同一 Proxy；跑默认 Harness 启动、挂载和真实 Host 端到端测试；环境变量一键关闭 |
| 首次补历史耗时长 | 复用现有同步的进度、取消和失败隔离；先显示已有结果 |
| 读取成本 | 只在 Worker 里折叠；`request/context` 已是小字段，提示词与工具只在变化时出现；与使用统计共用同一次读取 |
| 旧会话缺少 `request/system-prompt` / `request/tools`，折叠不出明细 | 这类请求不计入条目级统计，在上下文 tab 显示“N 次请求缺少明细” |
| 统计文件无限增长 | 按月分文件；每行是小时级汇总，量级为每月几 MB；健康指标显示占用 |
