# Context 面板后端数据需求

> 状态：2026-10-11 联合实施已接通 schemaVersion 2 门面、当前引擎投影与 SQLite 历史索引，工程测试和 Computer Use 分项验收中，尚未整体签收。实现边界见 [Context / SQLite 联合设计](../上下文管理引擎设计/上下文管理引擎V2/05-Context面板与SQLite联合设计.md)。
> 2026-10-18：本文保留最初的需求取舍；§2 当前契约已经落地，旧缺口记录不作为现状。验收边界见联合执行摘要。
> 视觉定稿：[context-panel-demo.html（已迁出）](../retired-html-demos.md)
> 相关：[上下文管理引擎 V2 · 01 总体设计 §4 前端显示当前 Context](../上下文管理引擎设计/上下文管理引擎V2/01-总体设计与调用流程.md)、[右侧面板与文件渲染规范 · Context 面板](front-右侧面板与文件渲染规范.md#context-面板)

## 1. 要做什么

右侧栏 Context 面板从「按分类列条目」升级为五个区块。本文只写前端需要后端提供什么数据，不规定引擎内部怎么实现。

| 区块 | 回答的问题 | 数据量级 |
| --- | --- | --- |
| ① 当前上下文 | 现在占了多少、离上限和自动压缩还有多远、各分类各占多少 | 十几个数字 |
| ② 会话统计 | 跑了几轮几步、压缩过几次、缓存命中率、累计 Token 和费用 | 十个以内的数字 |
| ③ 上下文明细 | 当前 Context 由哪些条目组成，和上一次请求相比多了什么、少了什么 | 非会话条目带预览；会话内容只要清单；上一次请求只要清单 |
| ④ 上下文趋势 | 每次请求的大小和构成怎么变化，压缩发生在哪 | 每次请求一行，约 10 个数字 |
| ⑤ 上下文事件 | 什么时候、因为什么，上下文发生了变化 | 每个事件一行 |

### 已确认的取舍

- **只看当前 Context，不提供历史请求切换。** 面板只展示当前 Context，也就是 V2 文档里「当前 Context」这个阅读对象。之前 demo 里「下次请求（实时）/ 第 N 轮第 M 步」的下拉框已经去掉。原因：逐次浏览历史请求原文要给每次请求返回完整内容，数据量大，而且主要是调试用途。
- **对比上一轮只要清单，不要原文。** 「对比上一轮」把当前 Context 和**最近一次已持久化的请求输入**相比。上一次请求只需要条目清单（条目身份 + 分类 + token 数），不需要预览和原文。
- **趋势和事件只要摘要数字。** 点击趋势柱子只显示数字提示，不加载那次请求的原文。
- **会话内容只列清单，原文去轨迹看。** 会话内容是条目最多、原文最大的一类，轨迹已经能逐条查看消息和工具输入输出。所以面板里的会话条目只显示类型、短标题和 token，不展开原文，点一行跳到轨迹里对应的记录。其他分类（系统提示词、工具、规则、Skills、会话摘要）在轨迹里没有对应记录，保留预览和展开全文。

## 2. 当前读取契约

类型真源是 `packages/shared/src/context-panel.ts`。不要复制旧 schemaVersion 1 示例；三个只读入口已接入 Main/IPC：

| 接口 | 输入要点 | 返回与边界 |
| --- | --- | --- |
| `sessions.describeContextPanel` | sessionId、可选 versionToken/consumerId/retry/release | schemaVersion 2 视图，或 notModified + history；release 释放需求 |
| `sessions.listContextEntries` | sessionId、revision、可选 cursor/bucket/limit | 当前与比较清单共用分页；默认 200、最多 500 条身份 |
| `sessions.readContextEntry` | sessionId、revision、key、可选 offset | 非会话原文按 UTF-8 字节分段，最多 64 KiB；返回 nextOffset |

`sessions.describeContext` 继续服务 Composer，仅返回当前已物化的分类/总量/容量，历史回退复用门面已缓存的最近请求，不为弹层启动全库同步。

完整视图的组成：

- `currentVersion` 与 `history.indexGeneration/indexedThroughSeq/targetThroughSeq` 分别标识当前 Context 和历史。`throughJournalSeq` 不能单独决定新旧；重建后代际变化允许水位变小。
- `current.basis` 区分 `current-context`、`last-request`、`unavailable`，`status` 区分 ready/stale/recovering/unavailable。
- `history.status` 为 ready/syncing/rebuilding/fallback/unavailable，错误可重试。当前 Context 不等待全局 Usage 重建。
- `previous` 是最近持久化的请求输入摘要；`comparable`、`comparisonUnavailableReason`、`estimatorVersion` 决定能否比较。缺身份的旧请求只展示总量，不伪造逐项变化。
- `stats` 尚未追平时为 null，界面显示待同步；累计用量与费用缺失同样保留 null，不当成零。
- `trend` 最近 500 次请求，`events` 最近 200 条，`limits` 明确截断；事件 `inferred` 表示由相邻请求推导。未知回收量为 null。
- `entriesPage` 提供 revision、total、nextCursor、truncated；所有分类和总量在分页前计算。条目包含稳定 key/bucket/title/estimatedTokens，可选 kind/source/preview/fullTextAvailable/trajectoryRef。

主面板预览最多 600 字符，标题最多 80 字符；conversation 不返回预览或全文。模型、用户/助手、工具调用/结果通过 messageId/callId 定位已有轨迹。历史清单仅保留身份、短标题、类型与引用，不保存正文。摘要允许短预览，目前全文接口只开放系统、工具、规则和 Skills；旧请求原文浏览不在本期范围。

条件响应不携带完整清单。面板只在可见时请求：同步中 1 秒、就绪后 5 秒、错误 2/4/8/10 秒退避；每个面板最多一个在途请求，切会话丢弃迟到响应，隐藏释放消费者。版本失效的分页/全文明确提示刷新。

## 3. 关键约定

### 3.1 条目必须有稳定身份

「对比上一轮」靠 `entry.key` 匹配当前条目和上一次请求的条目。**key 只由内容的来源决定，不能包含数组下标、request seq 或 contextRevision。**

旧投影中带 request seq/数组位置的 id 不参与新清单比较。新 manifest 由 Context 引擎按来源身份生成。

当前 key 规则包含 owner 命名空间，防止不同插件同名来源冲突：

| 分类 | key 来源 |
| --- | --- |
| 系统提示词 | section id；运行时 facts 用固定 key |
| 工具 | plugin/owner + 工具名 |
| 规则 | 规则文件路径或规则 id |
| Skills | owner + skill id；目录中每个 Skill 和当前调用分开 |
| 会话摘要 | compaction id |
| 会话内容 | messageId；工具调用和结果用 callId 加后缀区分 |

同一个 key 内容变了（例如规则文件被修改）仍是同一个条目，对比结果显示为 token 增减，不显示新增或移除。

### 3.2 两边估算口径一致

`current` 和 `previous` 必须用同一个 estimator 计算 token，否则对比出来的增减没有意义。当前引擎与请求 manifest 共用 `context-content-1` 估算器；模型 adapter 改写输入或旧请求缺少来源映射时标不可比较，不根据旧数组下标猜身份。

### 3.3 来源标签

工具和规则需要告诉用户「是谁加进来的」，用于明细区的来源筛选。建议值：

- 工具：`builtin`、`browser`、`mcp:<server>`、`plugin:<pluginId>`
- 规则：`repo`（仓库内）、`global`（用户全局）、`reference`（被引用进来的文件）
- Skills：`catalog`、`invoke`

V2 请求快照里已有 `contributorProvenance`，可以作为来源依据。

### 3.4 会话内容的子类型

会话内容要标出 `kind`，前端按「用户 / 助手 / 工具调用 / 工具结果」筛选。新清单保留 user/assistant/thinking/tool-call/tool-result 子类型。思考内容（reasoning）如果会被送回模型，单独标为 `thinking`。

### 3.5 上限和压缩阈值

- `contextWindow` 必须和当前 Context 来自同一模型配置版本。V2 文档 §4 已有这条约束。
- managed 路径已从实际准备请求的模型 facts 读取容量与压缩策略阈值；未知容量保留 null，不猜默认值。
- `autoCompactAtTokens` 用于在条带上画压缩线。压缩策略没有固定阈值时返回 null，前端改为用斜纹表示剩余空间。

### 3.6 摘要条目

manifest 将压缩摘要独立归入 `summarizedConversation`，身份包含 compaction id，不混入普通会话。

### 3.7 会话条目与轨迹记录对齐

点击会话条目后，要在轨迹里定位到同一条记录，所以 `trajectoryRef` 必须和轨迹视图（`TrajectoryView`）使用的记录身份一致：消息用 messageId，工具调用和工具结果用 callId。最好和 §3.1 的 key 同源，避免出现两套身份。

- 已被压缩进摘要的消息不会出现在会话内容里，不需要 `trajectoryRef`。
- 助手消息里的思考段如果单独成条，`trajectoryRef` 指向它所属的助手消息。
- 找不到对应的轨迹记录时，可以不返回 `trajectoryRef`，前端对这一行不提供跳转。

请求快照在 dispatch 前落盘，因此比较文案统一为“最近请求输入”，不声称供应商已收到；具体请求、重试和旧数据口径见联合设计。

## 4. 数据来源与预算

| 数据 | 当前来源 |
| --- | --- |
| 当前条目、分类、模型 | Context 引擎缓存的 ManagedContextProjection.manifest/model |
| 最近请求清单 | request/context 的最小 manifest metadata；旧数据有限兼容 |
| 轮次、步数、压缩次数、用量、费用 | 单 Session 的 Context SQLite 投影，按 request/run 身份去重 |
| 趋势 | 请求摘要与对应实际 usage，独立于全局 Usage 清零 |
| 压缩/模式事件 | 持久化事实；模型/工具差异事件明确标 inferred |
| 条目全文 | 当前引擎按 key + generation/revision 读取；不从任意路径读文件 |

主响应目标 200 KiB、硬上限 1 MiB；超预算先裁预览，再缩小当前页或趋势/事件窗口，并显式返回截断信息。请求 metadata 清单上限 5,000 条/256 KiB，超预算保留分类总量并说明不可比较原因，避免撑破 Journal 单记录 1 MiB 预算。

当前实现只展示主 Agent scope。Context 索引只同步被查询的 Session，不枚举全库；无查询消费者后允许当前有界批次收尾，不持续后台扫描。

## 5. 实现与验证入口

Main 门面：`apps/desktop/src/main/runtime-v2/context-panel-service.ts`；历史投影：同目录 `context-history-projection.ts`、`context-history-query.ts`。前端刷新、分页、错误状态位于 `components/right-panel/context/`；Composer 和面板使用同一口径。

浏览器 `?mock=long-session` 展示完整五区块，`?mock=context-pagination` 覆盖历史失败/重试、670 条清单与原文分段。mock 成功不代表真实 IPC/Loop 成功，最终证据统一记录在[联合执行目录](../../exec-runs/20261011-context-sqlite-integration/execution-process.md)。

## 6. 验收状态

原[前端计划](../../exec-plans/completed/20261011-context-panel-frontend.md)交付五区块布局与轨迹定位。联合计划补齐真实数据、条件刷新与分页；后端回归已运行，Computer Use 由 gpt-6.1-sol 执行，仍按[联合验收矩阵](../../exec-plans/completed/20261011-context-sqlite-integration/acceptance.md)逐项签收。类型检查或 mock 通过不替代真实模型切换、压缩、历史重建与大规模交互证据。

## 7. 本期不做

- 历史请求原文浏览、请求切换。
- 编辑上下文：pin、移除条目、包含与排除切换。
- 文件活动、耗时统计（dsh-context 有，本期不跟）。
- 子 Agent 的 Context 视图。
- 跨会话的 Context 洞察页。
