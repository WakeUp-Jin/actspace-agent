# Context 完整视图规范

## 定位

这份文档定义聊天态右侧面板里的 **Context 完整视图**：把当前会话喂给模型的完整上下文，按分组、按顺序、只读地铺开，让用户一边聊天一边看清"这一轮模型到底带了哪些上下文、各占多少"。

它服务**主聊天 agent**，与 Kairos 自治模式的上下文 Sheet（`Kairos上下文Sheet规范.md`、`Kairos右侧紧凑视图规范.md`）是**两个不同组件**：数据源不同、入口不同，但视觉语言（竖色条段头、可折叠分区、源文件 chip）刻意保持同源以便复用。

面板外壳 / Tab / 宽度见 `右侧面板与文件渲染规范.md`；颜色随主题翻转的硬约束见 `主题与配色规范.md`。

## 入口

- 在 Composer 的 Context 弹窗（`ContextPopup`）右上角 ✕ 旁，新增一个**展开/详情图标按钮**（`PanelRight` 或 `Maximize2`）。
- 点击后在右侧面板打开 Context Tab。
- **图标语义用"展开/详情"，不用铅笔/Edit**：V1 是只读视图，铅笔会误导用户以为能编辑。等 V2 支持增删改时再换铅笔。

## 数据来源与契约

- 数据结构已存在：`@actspace/shared` 的 `ContextState`，其 `entries: ContextStateEntry[]` 正是完整视图所需：
  - `kind`：`systemPrompt | toolDefinitions | rules | skills | summarizedConversation | conversation`
  - `title`、`estimatedTokens`、`included`、`pinned?`、`removable?`、`sourceEventIds?`、`contentHash?`、`preview?`
- 分区配色取 `@actspace/shared` 的 `CONTEXT_BUCKET_REGISTRY`（单一来源），与 Context 弹窗用同一组 `--act-context-*` token。
- **逐条明细（2026-05-30 重构）**：`entries` 不再是「每桶一条汇总」，而是**逐条**——每条消息一条、每个工具一条、systemPrompt 一条、每条历史摘要一条。
  - `conversation`：每条普通消息一条，**`title` 编码 role**（`User` / `Assistant` / `Assistant · 工具调用` / `Tool · {工具名}`），不新增字段（沿用既有 `ContextStateEntry`）。
  - `toolDefinitions`：每个工具一条，`title` = 工具名，`preview` = 该工具完整描述。
  - `systemPrompt`：整段系统提示词一条（含 rules/skills 的 XML 子段）。
  - `summarizedConversation`：每条 `source:"compaction"` 摘要一条。
  - 生成函数：`agent-core` 的 `buildContextEntries(ctx)`。
- **持久化策略 = 方案 B（2026-05-30 定）**：每轮 turn 的 `context-state.json` **只存 token 统计**（`buckets` / 总量），`entries` 持久化为 **空数组**——不和 `session.jsonl` 重复存正文、文件大小恒定有界。`createContextState(..., entries = [])` 缺省即空。
- **逐条全文一律由 `context:describe` 现场重算**：打开 Context 视图时前端调 `window.actspace.describeContext({ sessionId })`，main 侧 `describeSessionContext` 复用 `buildAgentConfig + createAgentForSession`（一次性吃完 `session.jsonl`）+ `setTools(getToolDefinitions())` + `buildContextEntries`，**不调用 LLM**，对任意会话现场产出逐条全文。打开频率低、现算才体现实时性，故不再持久化明细。
  - `ContextRenderView`：**describe 结果（含逐条全文）优先**；describe 未回来时退回持久化快照（仅 token 统计、内容为空，分区显示 token 但正文区给「正在重建…」）；两者皆无才空态。
- **空 bucket 是设计而非 bug**：本模板 `MAIN_AGENT_SYSTEM_PROMPT = ""`（空串），故 **System prompt / Rules / Skills bucket 合法地 0 token、无 entry**；真正有内容的是 **Tools 与 Conversation**。空桶**折叠但保留**（按注册表始终列出分区），展开后正文区按状态给文案：加载中→「正在重建上下文明细…」；`tokens>0` 仍无内容→「暂无法生成…」；`tokens===0`→「本会话暂未使用该类上下文」。
- **全文 vs 预览**：describe 路径的 `entries[].preview` 即**全文**（不截断），前端用 4-B「夹 3 行 + 展开全文」呈现（见下）。「导出 .md/.json」仍作完整离线副本兜底。

## 信息架构

- 按 `kind` 顺序自上而下分区，顺序对齐 `CONTEXT_BUCKET_REGISTRY.order`：
  1. System prompt
  2. Tools（工具定义）
  3. Rules
  4. Skills
  5. Summarized conversation（历史摘要）
  6. Conversation（会话历史）
  7. （未来）MCP / Subagents / Recent files —— 无对应 bucket 的走 fallback 色
- 每个分区头：**左侧竖色条**（颜色 = 该 kind 的 `--act-context-*`）+ 分区名 + 右侧元信息（条目数 / 估算 token）。竖色条样式复用 Kairos sheet 段头条思路。
- 分区内每个 entry：标题 + 估算 token + `preview` 片段；有 `sourceFiles` 的带源文件 chip（复用 Kairos sheet 的 source-file badge）。

## 配色与行视觉（2026-05-30 修订，已和用户对齐）

- **配色联动**：分区色严格等于 Context 弹窗里该 bucket 的色（同一 `--act-context-*`）。用户不看名字、只看颜色也能对应到弹窗里的那一块。
- **行视觉 = 分区头一条同色竖线 + 展开内容白底卡片**（用户反馈整行染色不够简约，已弃用 `color-mix` 整行浅底）：
  - 分区头：左侧一条 `--act-context-*` 同色竖线 + 分区名 + 右侧元信息（条目数 / 估算 token）+ 折叠箭头。分区 token 取 `snapshot.buckets`（与弹窗权威一致），缺省退回逐条求和。
  - 展开内容：每条一张 `bg-surface` 白底卡片（主题感知，浅色=白、深色=深）+ `border-line` 细边，承载该条的标题与正文。
  - 单条汇总型条目（title 与分区名相同，如空桶兜底）不重复标题；逐条列表（Conversation / Tools）显示各自 `title`。
- **4-B 内容展示（全文 + 前端展开，2026-05-30 定）**：每条正文默认 `line-clamp-3` 夹 3 行；当内容超过阈值（>160 字符或 >3 行）给「展开全文 / 收起」切换，展开后 `whitespace-pre-wrap` 显示 describe 返回的全文。不再后端截断，也不需要二次读取 IPC。

## 折叠与会话历史

- **Conversation 默认折叠**：会话量大，默认收起，展开后也**最多显示 N 条**（V1：N = 20，按时间序取前 20），其余靠导出查看。
- **空桶折叠保留**：无 entry / 0 token 的分区仍按注册表渲染分区头（默认折叠），不隐藏，让用户对「有哪些上下文类型」有完整心智。
- 折叠分区头样式对齐 Kairos sheet 的「会话历史」，但**下拉箭头放到文字右侧**（Kairos sheet 现在箭头在左，右侧面板版本要右对齐）。
- 有内容的非会话分区默认展开；长内容逐条 4-B 展开 + 整体可滚动。
- **导出按钮**：在 Conversation 分区（或视图顶部）提供导出，让用户拿走完整内容自行分析。
  - V1 用 renderer **Blob 下载**（`a[download]` 存 `.md` / `.json`），不引 IPC。

## 只读边界

- V1 **只读**：不提供删除、增加、编辑、pin/unpin。
- 展示 `included` / `pinned` 状态用只读标记，不给可操作控件。

## V1：简单 + 安全（本轮范围）

- 把 `contextState` 接到右侧面板（接线任务）。
- 打开视图时调 `context:describe` 现场重算逐条全文 entries（不调 LLM）；持久化只存 token 统计（方案 B）。
- 按 kind 分区渲染：分区头一条同色竖线（配色联动）；展开内容用 `bg-surface` 白底卡片 + 细边，无整行染色、无分割线。
- 逐条 entry：每条消息 / 每个工具一条，`title` 编码 role；正文 4-B（夹 3 行 + 展开全文）。
- Conversation 默认折叠、最多 20 条、箭头右置、导出 Blob（.md/.json）；空桶折叠保留。
- 只读。
- describe 未回来时退回快照（仅 token 统计、正文给加载态）；两者皆无展示空态。
- 浅/深双主题验过。

### V1 明确边界（不做）

- 不做增删改、pin、按 source 跳转、搜索/过滤。
- describe 现场全文仅在内存/IPC 传输，不持久化逐条明细。

## V2：完整版（计划先写，**等用户指令再实现**）

> V2 不在当前实现轮次，需用户显式指令后再动工。

- 增删改上下文条目（对应原始计划"后续再支持删除和增加"）。
- pin / unpin、include 切换。
- 按 `sourceEventIds` / `sourceFiles` 跳转回消息流或打开对应文件预览。
- 上下文搜索 / 过滤、token 占比可视化（与弹窗 meter 联动高亮）。
- MCP / Subagents / Recent files 分区接入。

## 验收

- 从 Context 弹窗的展开按钮可打开右侧 Context Tab。
- 有 `contextState` 时展示真实分组与 preview；没有时空态/兜底。
- 分区色与 Context 弹窗 bucket 色一致；分区头一条同色竖线，展开内容白底卡片、无整行染色、无分割线。
- Conversation 默认折叠、最多 20 条、箭头在文字右侧、导出可下载。
- 浅色 / 深色两套主题下配色都正确。

## 关联

- `右侧面板与文件渲染规范.md`：右侧面板外壳与 Tab。
- `Kairos上下文Sheet规范.md` / `Kairos右侧紧凑视图规范.md`：视觉语言同源、数据源不同的对照。
- `主题与配色规范.md`：`--act-context-*` 数据可视化色与 `bg-surface` 内容卡片必须随主题翻转。
- `docs/design-docs/agent-token-usage-and-context-state.md`：`ContextState` / `contextSnapshot` 的数据分层。
- 执行计划：`docs/exec-plans/active/20260527-right-panel-views.md`。
