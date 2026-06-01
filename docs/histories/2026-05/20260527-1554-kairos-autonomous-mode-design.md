## [2026-05-27 15:54] | Task: Kairos 自治模式 v1 设计文档

### 🤖 Execution Context

- **Agent ID**: Cursor agent
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE Desktop

### 📥 User Query

> 设计 actspace 桌面端的 Kairos 自治模式功能。先评估 `llm-agent-dev` skill 是否已覆盖该主题，没覆盖则准备 `llm-agent-fix-plan`；前端可参考 heartclaw apps/web 的 KairosPage、后端可参考 heartclaw apps/ruyi-api 的 `kairos_agent.py`。这一轮只做设计、不实现。

### 🛠 Changes Overview

**Scope:** docs（无代码改动）

**Key Actions:**

- **Skill 评估**：核对 `.agents/skills/llm-agent-dev/references/agent-runtime/cron-job-kaiors.md` 和 `examples/kairos-runner.ts`，确认 KAIROS 模式核心思想、tick 调度、可中断 sleep、独立 Runner、SleepTool 等概念已覆盖，不需要写 `llm-agent-fix-plan`。
- **现状盘点**：通读 heartclaw 的 `KairosRunner` 后端与 `KairosPage` 前端（含 store、event、status panel、reply preview、modal），识别可保留的"事件流 + 状态卡"模式，并列出本仓库要修正的点（语义耦合、缺少启停 toggle、缺少自治边界等）。
- **决策对齐**：通过 5 个问题项让用户拍板布局、默认启停、v1 范围、事件存储、文档落位。
- **新增设计文档**：`docs/design-docs/agent-kairos-autonomous-mode.md`，覆盖动机、目标、非目标、模块分层、shared 契约、tick 调度、上下文构成、prompt 边界、存储布局、与主 Agent 的交互边界、页面规范、错误处理、安全策略、验证策略和推进顺序。
- **导航同步**：把新文档收录进 `docs/design-docs/index.md` 与 `docs/ARCHITECTURE.md` 的架构阅读路线。

### 🧠 Design Intent (Why)

actspace 主链路是单向被动 turn，Kairos 想给 Agent 一个"用户没说话也能做事"的入口。这一版的关键在于把通用 KAIROS 原理（skill 已经覆盖）映射到 actspace 自身的约束：Electron IPC 而非 HTTP/WS、复用 agent-core 既有 LLMService/ToolManager、事件流独立落到 userData、默认关闭以避免无声扣 token、删除 heartclaw 的"天工巡检"业务线。设计文档先写"事实"，让后续 execution plan 可以并行拆分而不会各自发明契约。

### 📁 Files Modified

- `docs/design-docs/agent-kairos-autonomous-mode.md`
- `docs/design-docs/index.md`
- `docs/ARCHITECTURE.md`

---

## [2026-05-27 16:25] | Task: Kairos 上下文输入与存储分层扩展

### 📥 User Query

> Kairos 最重要之一是能注入哪些上下文。希望在 `<userData>/kairos/` 里增加配置和文档：持续短期记忆（参考 heartclaw 短期记忆设计）、用户 workspaces/sessions 索引、用户主动写入的任务（cron-like）、巡检文件夹、外部数据配置。让我帮想得更全一些。

### 🛠 Changes Overview

**Scope:** docs（无代码改动）

**Key Actions:**

- **盘点 heartclaw 短期记忆实现**：通读 `apps/ruyi-api/src/core/context/modules/short_term_memory.py` 和 `storage/short_memory_store.py`，确认"按日 jsonl + 月文件夹 + week/month/year 三层摘要 + 当天 segment + token 预算加载"这一套机制完全适用于 Kairos。
- **上下文输入分类**：把用户提到的 5 项 + 我补的 5 项归纳为 4 大类（长期偏好 / 主动任务 / 自身记忆 / 外部观测），并定义不同的加载机制和注入路径，强调"第 4 类绝对不能进上下文原文"。
- **决策对齐**：7 个问题项让用户拍板（短期记忆分段粒度按日；session 默认逐 workspace 授权；briefs 用 frontmatter markdown；watch 走 poll-on-tick；pinned notes 接受 ≤ 1500 token；blocklist 调度层硬限制；briefs 页面表单和直接编辑等价）。
- **新增/重写章节**（在 `docs/design-docs/agent-kairos-autonomous-mode.md`）：
  - 新增"上下文输入分类"章节，4 大类对比表 + 关键不变量。
  - 重写"上下文构成"为 8 段 system prompt + 4 段 messages + 7 个 Kairos 专属工具。
  - 重写"存储布局"为完整 5 子目录树（config / briefs / memory / observe / events）。
  - 新增"Config 详设"：settings / rhythm / workspaces / watch / blocklist 五份 JSON 的字段、默认值、行为。
  - 新增"Briefs"：frontmatter markdown 格式、index.json 状态机、cron/event/manual 三种触发方式、两种创建方式。
  - 新增"Pinned Notes 机制"：Kairos 写 → 用户钉 → 始终注入 system [5] 段，并与未来主 Agent Memory 做语义切割。
  - 新增"Working Memory 加载与压缩"：完全沿用 heartclaw 算法，月度/年度归档作为 Kairos 内部 brief 自维护。
  - 新增"主 Agent Sessions 的访问"：`kairos_list_sessions` / `kairos_read_session` + `workspaces.json` 三态权限 + `observe/sessions-digest.json` 摘要。
  - 新增"配置变更响应"：fs.watch 监听 config/ 与 briefs/tasks/ 的 mtime，立即重载规则表。
  - 扩展"模块分层"：`packages/agent-core/src/kairos/` 拆出 context / config / briefs / storage / tools / compression 子目录。
  - 扩展"渲染规范"：Kairos 页右侧加 4-tab（详情 / Briefs / 配置 / 笔记）。
  - 扩展"验证策略"：补 briefs / context / config 三组单测。
  - 扩展"推进顺序"为 8 步实现路线。

### 🧠 Design Intent (Why)

Kairos 是主动 Agent，没有上下文等于盲眼运行。这一轮在上一轮"调度骨架"之上补齐"它能看见什么"的完整设计。核心思路：

- **不同信号性质走不同管道**：长期偏好进 system 固定段；用户任务被触发时才注入；自身记忆走压缩；外部观测只放索引、原文走工具按需 fetch。
- **复用而不重做**：heartclaw 短期记忆的"按日 jsonl + 多层摘要"机制成熟可用，actspace 端只调一个加载预算比例和 12h vs daily 分段（最终选了 daily 以保持算法一致性）。
- **硬限制不靠 LLM 自觉**：rhythm 的 sleepBias、blocklist 的 timeWindows / toolsDenied / paths、tickBudget 都在调度层和工具层强制；prompt 只是软提醒。
- **Pinned notes 与主 Agent Memory 显式切割**：避免 Kairos 的"自治学习"污染主 Agent 长期记忆，未来如需合并必须用户显式确认。

### 📁 Files Modified

- `docs/design-docs/agent-kairos-autonomous-mode.md`（大幅扩展）

---

## [2026-05-27 17:50] | Task: Kairos 上下文与配置二次精简（消除冗余）

### 📥 User Query

> 1) events / journal / short-term 三套存储为啥要分？前端不能直接从 short-term 读吗？heartclaw 怎么处理的？2) Kairos 本身就是 Agent，工具应该复用主 Agent，不要造 `kairos_*` 工具集。3) 长期偏好里的 JSON 不该进系统提示词——应该是代码硬判断的输入；只有 `rule.md` 这种用户写的纯文本规则才进 prompt。4) 每个 JSON 文件根对象加一个 `tip` 字段，loader 拼成人话注入 prompt。5) config 文件太多，合并几个。6) `watch.json` 简化为只告诉 Kairos "留意哪些文件夹"，不要 include/exclude/maxDiff 这种细枝末节。7) `pin_note` 工具 v1 不需要；用户钉走 IPC。

### 🛠 Changes Overview

**Scope:** docs（无代码改动）

**Key Actions:**

- **去重事件存储**：删除 `events/` 和 `journal/` 目录，**唯一持久化层是 `memory/short-term/<YYYY-MM>/<YYYY-MM-DD>.jsonl`**，每行复用 `SessionEvent` 格式。
  - 在 `packages/shared/src/session.ts` 中扩展 `SessionEventType`：新增 `kairos_tick_injected` / `kairos_sleep_start` / `kairos_sleep_end` / `kairos_sleep_interrupted` 4 个类型 + 对应 payload。
  - 前端不直接渲染 SessionEvent，而是通过 `aggregateKairosEvents(events): KairosEventRow[]` 聚合（tick / tool / reply / sleep / interrupt / error）。
  - controller 维护一个 200 条 SessionEvent 的内存 ring buffer，给前端首屏拉取用。

- **运行时数据流约束**：先写盘 short-term jsonl 成功，再 push ring buffer，再 IPC 推送给前端——避免页面看到没有落盘的事件。刷新页面通过 `kairos:get-events-recent({ limit: 200 })` 从 ring buffer 拉取，不够则倒读 jsonl 补足。

- **Config 简化为 3 JSON + 1 MD**：
  - `preferences.json`（合并原 settings + rhythm）
  - `paths.json`（合并原 workspaces + watch；**每条只有 `path` / `watch` / `tip` 三个字段**，include/exclude/maxDiff 写死在代码里）
  - `blocklist.json`（不变）
  - `rule.md`（用户给 Kairos 的纯文本规则，取代原 `briefs/interests.md` + `briefs/do-not.md`）
  - 删除 `config/integrations.json`（v1 不预留 schema）。

- **`tip` 字段约定**：所有 JSON 文件根对象有一个 `tip: string` 字段；`paths.json` 的每条 path 也有 `tip`。loader 抽取后由 `prompt-assembler.ts` 手动拼成 system [3] 段，**JSON 结构本身不进 prompt**。LLM 看到的只有人话。

- **工具集精简到 Sleep + 主 Agent 共享**：
  - 删除 `kairos_list_sessions` / `kairos_read_session` / `kairos_write_note` / `kairos_pin_note` / `kairos_brief_update` / `kairos_scan_watch` 6 个工具。
  - 读 session 走 `read_file` / `list_directory`；写笔记走 `write_file`；钉笔记由用户在前端点 ⭐ 走 IPC `kairos:pin-note`；brief 状态推进由 controller 在 tick turn 闭合时自动更新（不需要工具）。

- **新增"工具系统扩展"章节**：定义 `ToolScheduler.execute` 新增 `callerAgent: "main" | "kairos"` 参数；`ToolDefinitionSpec` 新增 `extractPaths(args) => string[]` hook。
  - `callerAgent === "kairos"` 时，ToolScheduler 自动调 `extractPaths` 取路径，校验是否在 `paths.json.allowedRoots` 内、是否命中 `blocklist.paths`，命中即拒绝。
  - 主 Agent 行为完全不变（callerAgent 默认 `"main"`，hook 不调用）。

- **System Prompt 重分段**：由原来的 8 段简化为 7 段，其中 [3] 段是"配置提示段"（preferences.tip + paths 列表 + blocklist.tip 手动拼接），[4] 段是 rule.md 全文。LLM 永远看不到 JSON 原文。

- **同步更新章节**：
  - 模块分层（删 6 个工具，加 `prompt-assembler.ts` / `aggregator.ts` / `guard/`）。
  - 契约定义（KairosEvent 改为复用 SessionEvent + KairosEventRow 聚合视图）。
  - 存储布局（删 events/journal/integrations.json/interests.md/do-not.md）。
  - Pinned Notes 机制（v1 用户钉，Kairos 不自钉；保留为 v2 评估）。
  - 主 Agent Sessions 的访问（改为通用 read_file / list_directory + paths.json 控制）。
  - 配置变更响应表（3 JSON + rule.md）。
  - 验证策略（新增工具访问控制 + 事件聚合两组单测）。
  - 推进顺序（10 步：含 SessionEvent 扩展、callerAgent 改造、aggregator 实现）。

### 🧠 Design Intent (Why)

这一轮的核心是 "去掉所有可疑的过度设计"：

- **存储只留 short-term**：events / journal / short-term 三套存储语义重叠严重——`SessionEvent` 已经包含 role / payload / turnId / timestamp 全部前后端需要的字段，多套存储反而带来同步问题。前端用聚合器就行。
- **工具集尽量薄**：每多一个 Kairos 专属工具就多一份维护成本和 LLM 学习负担。Kairos 是 Agent，主 Agent 已经造好的轮子直接用——访问控制走 `callerAgent` hook 比给每个工具都套一层 Kairos 包装健康得多。
- **JSON 原文不进 Prompt**：LLM 看 `{ "sleepRangeSeconds": { "min": 30 } }` 这种结构毫无意义且耗 token。代码读 JSON 做硬判断，给 LLM 看 `tip` 这种人话；规则用户想写则写到 `rule.md`，纯文本无歧义。
- **watch 砍到极简**：用户的真实需求是"留意这个文件夹"，include/exclude 这种细节用户既不想配也配不准——写死在代码里，未来需要扩展也是代码层级的迭代，不会污染配置。
- **pin_note 由人闸门**：v1 让 Kairos 写 notes，用户筛选钉住——这是建立用户信任 Kairos 长期记忆的关键路径。让 Kairos 自钉留待用户反馈验证后再加。

### 📁 Files Modified

- `docs/design-docs/agent-kairos-autonomous-mode.md`（大幅重写：契约 / 存储 / Config / 工具 / 安全 / 验证多个章节）

---

## [2026-05-27 19:10] | Task: Kairos v1 范围再次收敛（pinned 全砍 + watch 改用 Node fs.readdir）

### 📥 User Query

> 1) edit_file 不要加 append 字段，append 本质就是替换最后一段——LLM 先 read_file 再 edit_file 即可。2) watch 用 Node `fs.readdir`，不用 ripgrep；要递归（不递归没意义）。3) notes 当前实现：用户钉住先不做，前端只读浏览即可，Kairos 用 write_file/edit_file 自己写。

### 🛠 Changes Overview

**Scope:** docs（无代码改动）

**Key Actions:**

- **删除 pinned.md 整套（v1 不做）**：
  - 删除 `Pinned Notes 机制` 整章，替换为更短的 `Notes 说明` 章节。
  - System Prompt 从 7 段简化为 6 段：删除原 `[5] 常驻笔记段`，后续编号 [6]/[7] → [5]/[6]。
  - 删除 `kairos:pin-note` IPC channel。
  - 删除 `note-store.ts` 模块（不再需要 1500 token 限额 + pinned-archive 归档）。
  - 删除 `<userData>/kairos/memory/notes/pinned.md` 和 `pinned-archive/` 目录。
  - 笔记 Tab 改为只读浏览（无 ⭐、无编辑、无删除）。
  - 在`非目标`段新增显式条目，记录 v1 不做 pinned 机制的边界。

- **watch 实现重写为 Node 原生递归**：
  - 不用 ripgrep；改为 Node `fs.readdir({ withFileTypes: true })` 手写递归，遇 exclude 目录不进去（关键性能优化，避免扫到 `node_modules` 爆掉）。
  - manifest 格式从 `{ path, mtime, size }` 列表简化为相对路径字符串列表 `entries: string[]`。
  - 只看 `added` / `removed`，不看 `modified`（同名文件内容改了对 Kairos 不可见；重命名表现为 removed+added 两项）。
  - 默认 exclude 写死：`.git` / `node_modules` / `.DS_Store` / `dist` / `build` / `.cache` / `__pycache__` / `.venv` / `venv` / `target` / `.next` / 所有 `.` 开头的隐藏文件。
  - 单 watch 路径扫描文件上限 5000，超限 emit warning event。
  - manifest 不存在时视为 `oldEntries=[]`，首次扫描全部 entry 进 `added`（按 50 截断 + "另有 N 条"）。
  - 模块拆分：`watch-scanner.ts`（扫描） + `watch-diff.ts`（diff 算法 + manifest 持久化）。

- **notes 简化为零专属 API**：
  - Kairos 写笔记走主 Agent `write_file`（新建）+ `edit_file`（修改/追加，"追加"做法 = read_file 看末尾 → edit_file 替换"末尾段")。
  - `edit_file` 不加 `append` / `operation` 字段；`write_file` 不加 `mode` 字段；工具描述完全不动。
  - 文件命名约定（`<YYYY-MM>/<slug>.md`）只在 system prompt 中以建议形式告知，违反不阻断。

- **同步更新章节**：
  - 上下文构成（[3] 段说"3 份 config 的 tip"而非"4 份"；prompt-assembler 占位符删 `{pinned_notes}`）。
  - 存储布局（删 pinned 相关文件，更新 watch-manifest 注释）。
  - 模块分层（删 `note-store.ts`，加 `watch-scanner.ts`）。
  - 配置变更响应（无变化）。
  - 验证策略（删 pinned 测试；watch 测试改为 fs.readdir 递归 + exclude + 5000 上限 + 首次扫描行为）。
  - 推进顺序（第 3 步明示不需要 note-store；第 7 步明示 watch 用 Node 手写递归）。

### 🧠 Design Intent (Why)

这一轮继续"砍到不能再砍"的思路：

- **Pinned 是高估的需求**：v0 设想"Kairos 写笔记 + 用户钉 + 永久注入 prompt"是 heartclaw 那边的产物，actspace v1 还没用户反馈支撑。先把"Kairos 写、用户看"链路跑通——这一步就能验证大量假设。等用户真的说"我希望让 Kairos 长期记住 X"再加 ⭐ + pinned，数据结构兼容、不需要迁移。
- **edit + write 现有协作已经足够**：edit_file 文件不存在会报错引导去 write_file，write_file 覆盖前要先读——这个分工本身就把 LLM 引导到正确路径。"追加"作为"替换最后一段"是 LLM 写笔记前反正要 read 一次的自然流程，加 append 字段反而模糊了"edit 是修改、write 是新建"的边界。
- **Node fs.readdir 优于 ripgrep**：跨平台稳定（不依赖外部二进制）、不 spawn 子进程、手写递归能在"遇 exclude 目录不进去"层面跳过大坑（recursive:true 会先扫完再过滤）。
- **递归 watch 才有意义**：用户说"留意 docs 目录"语义上一定包括子目录，不递归等于失效。手写递归 + exclude 黑名单已经能稳定支撑日常用法；性能保护靠 5000 文件上限兜底。

### 📁 Files Modified

- `docs/design-docs/agent-kairos-autonomous-mode.md`（pinned 整章删除 + watch 重写 + notes 章节重写 + 多处段编号 / 模块 / 验证 / 推进顺序同步）
