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
- **现状缺口**：`contextState` 目前**还没有透传到 renderer UI**（App.tsx 只取了 `contextSnapshot`，即 token 占比，不含 `entries` 内容）。要展示真实内容，需先把 `contextState` 接到右侧面板（属 V1 接线任务）。
- **全文 vs 预览**：`entries[].preview` 是内容摘要片段，不是全文。展示全文需要新增 renderer 读取真实内容的 IPC——属 V2。

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

## 配色与行视觉（已和用户对齐）

- **配色联动**：分区色严格等于 Context 弹窗里该 bucket 的色（同一 `--act-context-*`）。用户不看名字、只看颜色也能对应到弹窗里的那一块。
- **行视觉 = 整行浅色底 + 左侧 2px 同色竖条，不用分割线**：
  - 浅色底由既有 token 派生：`background: color-mix(in srgb, var(--act-context-tools) 10%, transparent)`（百分比可微调），**浅/深主题自动翻转**，不新增 token，满足主题与配色硬约束。
  - 左侧 2px 竖条用同色实心，增强可扫读性。
  - 既然有色块区隔，**不再画分割线**。

## 折叠与会话历史

- **Conversation 默认折叠**：会话量大，默认收起，展开后也**最多显示 N 条**（V1：N = 20），其余靠导出查看。
- 折叠分区头样式对齐 Kairos sheet 的「会话历史」，但**下拉箭头放到文字右侧**（Kairos sheet 现在箭头在左，右侧面板版本要右对齐）。
- 其他分区（system/tools/rules/skills/summarized）按内容量决定默认展开或折叠；长内容可滚动。
- **导出按钮**：在 Conversation 分区（或视图顶部）提供导出，让用户拿走完整内容自行分析。
  - V1 用 renderer **Blob 下载**（`a[download]` 存 `.md` / `.json`），不引 IPC。

## 只读边界

- V1 **只读**：不提供删除、增加、编辑、pin/unpin。
- 展示 `included` / `pinned` 状态用只读标记，不给可操作控件。

## V1：简单 + 安全（本轮范围）

- 把 `contextState` 接到右侧面板（接线任务）。
- 按 kind 分区渲染：分区头竖色条（配色联动）+ 整行浅底 + 左 2px 同色条，无分割线。
- 各 entry 展示 `title / estimatedTokens / preview` + 源文件 chip。
- Conversation 默认折叠、最多 20 条、箭头右置、导出 Blob（.md/.json）。
- 只读。
- 没有 `contextState` 时展示空态或 snapshot 兜底。
- 浅/深双主题验过。

### V1 明确边界（不做）

- 不展示全文（只有 `preview`），全文需 IPC。
- 不做增删改、pin、按 source 跳转、搜索/过滤。

## V2：完整版（计划先写，**等用户指令再实现**）

> V2 不在当前实现轮次，需用户显式指令后再动工。

- 新增 renderer IPC 读取 entry 全文（system prompt 正文、完整工具定义、完整 rules 等）。
- 增删改上下文条目（对应原始计划"后续再支持删除和增加"）。
- pin / unpin、include 切换。
- 按 `sourceEventIds` / `sourceFiles` 跳转回消息流或打开对应文件预览。
- 上下文搜索 / 过滤、token 占比可视化（与弹窗 meter 联动高亮）。
- MCP / Subagents / Recent files 分区接入。

## 验收

- 从 Context 弹窗的展开按钮可打开右侧 Context Tab。
- 有 `contextState` 时展示真实分组与 preview；没有时空态/兜底。
- 分区色与 Context 弹窗 bucket 色一致；行用浅底 + 左色条、无分割线。
- Conversation 默认折叠、最多 20 条、箭头在文字右侧、导出可下载。
- 浅色 / 深色两套主题下配色都正确。

## 关联

- `右侧面板与文件渲染规范.md`：右侧面板外壳与 Tab。
- `Kairos上下文Sheet规范.md` / `Kairos右侧紧凑视图规范.md`：视觉语言同源、数据源不同的对照。
- `主题与配色规范.md`：`--act-context-*` 数据可视化色与 `color-mix` 浅底必须随主题翻转。
- `docs/design-docs/agent-core/token-usage-and-context-state.md`：`ContextState` / `contextSnapshot` 的数据分层。
- 执行计划：`docs/exec-plans/active/20260527-right-panel-views.md`。
