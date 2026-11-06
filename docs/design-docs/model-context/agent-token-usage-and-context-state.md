# Token Usage 与 Context Projection

> 当前 v2 设计与实现事实。v1 的 `context_snapshot`、独立 Context state 文件和可变 conversation 持久化不再使用。

Session、Surface 和 request snapshot 的规范分别见：

- [`agent-spec-request-record.md`](../agent-plugin-runtime/agent-spec-request-record.md)（请求记录与上下文估算，以它为准）
- [`agent-spec-session-core-persistence-separation.md`](../agent-plugin-runtime/agent-spec-session-core-persistence-separation.md)
- [`agent-spec-session-format-v1.md`](../agent-plugin-runtime/agent-spec-session-format-v1.md)
- [`agent-spec-prompt-context-contributors.md`](../agent-plugin-runtime/agent-spec-prompt-context-contributors.md)

## 目标

Actspace 需要分别回答三类问题：

1. **模型实际消耗了多少**：来自 provider / adapter 返回的 usage；
2. **某次模型请求实际组装了什么**：对话来自 Journal 的对话事件，系统提示词与工具来自当时生效的 `request/system-prompt` / `request/tools`，其余配置来自 `request/context`；
3. **用户当前在 UI 中看到什么**：来自 Journal 折叠出的 Runtime Projection（上下文估算是 `contextEstimate`）。

这三类数据有关联，但不能合并为一个可覆盖文件。

## 唯一持久事实

持久 Session 只写：

```text
sessions-v2/<sessionId>/journal.jsonl
```

当前 Agent Loop 产生的关键事件包括：

- `request/header`：requestId、turnId、stepId、routeId、model、attempt 和 contextWindow；
- `request/system-prompt`：系统提示词各段、模型事实和提供方来源；内容 digest 与日志里最近一条不同时才写；
- `request/tools`：工具定义；内容 digest 与日志里最近一条不同时才写；
- `request/context`：与同一 requestId 关联、dispatch 前冻结的小快照（schemaVersion 3），不含对话、提示词、工具和估算；
- `assistant/message`：请求终态与 provider usage；`step/end` 提供步骤终态及工具步骤的 usage 回退；
- `llm/retry` / `llm/retry-started`：失败尝试与下一次重试；
- `llm/auxiliary-start` / `llm/auxiliary-end`：工具内部真实辅助模型尝试及其父工具、实际模型、终态与 nullable usage；不创建助手消息；
- `compaction/start` / `compaction/summary` / `surface/replaced` / `compaction/end`：压缩过程与 Surface 替换。

旧 v2 草案中的 `request/snapshot`、`llm/usage`、`llm/ended` 不是当前默认 Loop 的事件词汇；不能据此新增 producer 或解释当前 Journal。事件目录见 [DSH 事件模型](../agent-plugin-runtime/agent-spec-dsh-event-model.md)。

不存在独立 `context-state` 文件。UI 的 Context 状态可以随当前 Projection 算法升级而变化，但 Journal 事实保持不变。

## Request Snapshot

每次真实模型 dispatch 前，`context-engine/src/request-snapshot.ts` 的 `requestRecords` 从实际 `LlmInput` 与 LLM PreparedCall 元数据产出三样东西：提示词记录、工具记录和 `request/context` 快照。一次请求的事件顺序固定：

```text
request/header          每次写
request/system-prompt   与日志里最近一条 digest 不同时才写
request/tools           与日志里最近一条 digest 不同时才写
request/context         每次写
```

`request/context.snapshot`（schemaVersion 3）只留小字段，每条约 1–2 KB：

```text
schemaVersion: 3
sessionId / logicalAgentScopeId
contextRevision / throughJournalSeq / surfaceGeneration
turnId / stepId
systemPromptDigest / toolsDigest
prepared.route / model / registrationId / adapterVersion
prepared.defaults / retryPolicy / contextWindow
requestOptions
contextModel
compositionDigest / hostCapabilityDigest
```

快照不再存 `messages`、`tools`、`renderedSystemPrompt`、`systemSections`、`contextSections`、`modelFacts`、`contextModelFacts`、`facts`、`contributorProvenance` 和 `contextManifest`。对话由上下文引擎从对话事件、补充事件重新拼出；拼好的系统提示词文本由 `@actspace/shared` 的 `renderSystemPrompt(sections, modelFacts)` 推出。

某次请求生效的提示词和工具，是 seq 不大于该请求 `request/context` 的最近一条 `request/system-prompt` / `request/tools`。所有读取方都用 `@actspace/shared` 的 `effectiveRequestRecord` / `indexRequestRecords` 取。

这组记录的作用是：

- 证明一次 request 使用了哪份 Session Surface（`throughJournalSeq`、`surfaceGeneration`）；
- 证明哪些 Prompt / Context contributor 参与组装（提示词记录的 `contributorProvenance`）；
- 关联 route、model、adapter 和 retry policy；
- 为 Context、Trajectory 和故障恢复提供确定输入；
- 在恢复时结合 request/terminal 关系识别未结束请求；dispatch 的外部效果边界仍由对应恢复契约解释，snapshot 自身不证明请求已发送。

Snapshot 不得包含 API Key、Authorization、Cookie、proxy credential 或其他 secret-like 字段。`request-snapshot.ts` 会拒绝非 JSON 值、非有限数字、过深对象和敏感字段名。

新请求的 Agent mode、日期与时区由 Context runtime 来源保存为 surface:null 的补充事件，转换时插入完整工具批次后的模型消息；Context 估算计入最终消息，UI 不伪造用户气泡，Compaction 不把这类导航/运行补充当作用户要求。旧消息中已有的 runtime-context 仍兼容转换。

## Request Model Facts

每次真实模型请求越过 dispatch 前，Runtime 必须把以下事实写入 durable request 记录：

```text
request/header
  requestId
  turnId
  stepId
  routeId
  model
  attempt
  contextWindow: positive integer | null

request/context.snapshot.prepared
  route
  model
  contextWindow: positive integer | null
  registrationId
  adapterVersion
  defaults
  retryPolicy
```

`contextWindow` 是当次请求解析到的模型能力快照，不是当前设置文件的实时查询结果。这样模型目录刷新、设置修改或模型删除都不会改变历史 Session 的解释。

旧 Session 若没有该字段：Projection 与 UI 按容量 `0` 处理，并保留 token 统计；禁止回退到伪造的 `200_000`。

## Usage 与成本

usage 以一次 provider request 为粒度，而不是一次 Agent Run 或 Session 的粗粒度计数。默认 Loop 将 usage 写在 `assistant/message`、`step/end` 和失败尝试的 `llm/retry` 中，聚合器按请求身份去重。当前字段包括：

```text
inputTokens
outputTokens
cacheReadTokens
cacheWriteTokens
reasoningTokens
cost
costCurrency
source
costProvenance?
```

规则：

- provider 有精确值时保存精确值；
- `source` 表示 Token 来源，`costProvenance.basis` 独立表示费用来源，不把 SDK 估算误标成真实扣款；
- provider 未返回某字段时允许为 unknown / null，Projection 不应凭空补出精确数字；
- 新请求的 cost 连同 `costProvenance.pricingSnapshot` 保存当时所用模型的价格、币种、倍率及目录来源，不保存完整目录；历史没有依据的零值按未知展示，更新价目不重算历史，详见[目录与费用设计](agent-model-catalog-and-usage-cost.md)；
- 自定义模型手动价格使用 `source: configured`，并把缓存读取和缓存写入作为独立计费桶；关闭手动价格后，新请求的费用为未知，但 Token 统计仍保留；
- retry 的每次真实 request 都有独立 request ID、snapshot 和 usage，不能把多次尝试覆盖为一条。

辅助请求按 `attemptId` 独立计量，归属真实发生的工作：图像识别和自动审核保留 Session、Run、Turn、Step 与父工具身份；标题仅归属 Session，压缩归属 Session 并可关联实际 Turn。后台请求计入会话及全局请求数、Token 和费用，但不生成或增加 Run。回复轮尾仅累加所属真实 Run 中已终结辅助尝试的已知 Token，包括失败或取消前已报告的消耗。显式零值保留，全未知或尚未终结的辅助尝试不伪造零值，Activity 与轨迹仍保留其未知状态。辅助用量不得重复加入主请求的 `step/end`，也不得生成额外助手气泡或 Context 内容。费用是否已知由独立的成本来源决定，业务解析失败不能抹去已经发生的模型用量。

Durable Session projection 聚合：

- input；
- output；
- cache read；
- cache write；
- total；
- 可确认的 USD cost。

Desktop 使用统计页面统一消费 Journal request/tool activity 的摘要、分类聚合与明细；旧统计 IPC 仅为其他兼容消费者保留，两者都不能修改 Journal usage。

事件级 Usage projection 以 `${sessionId}:request:${requestId}` 和 `${sessionId}:tool:${callId}` 作为稳定 activity ID。每个 retry request 保持独立行；`assistant/message` 优先提供终态和 usage，只有缺少 assistant terminal 时才使用对应 `step/end` 的 usage 作为回退。投影同时记录 `throughJournalSeq` 水位，允许冷启动重建并验证重启前后结果一致。

### Usage 页面偏好的持久化边界

设置中心重构后，Usage 页面可以持久化查看偏好，但这些偏好不是 Usage 事实：

```text
settings.json → activity.usage
  range / status / modelFilter / showDetails / activeTab

sessions-v2/<sessionId>/journal.jsonl
  request、model、tool、token、cost、status 等运行事实
```

- `activity.usage` 由 Main Settings Authority 通过 typed IPC 读写，跨窗口和重启恢复；它不能被解释为计费数据，也不能改变历史聚合结果。
- Usage 明细继续由 Journal Projection 提供，当前通过 typed `usage-activity:get` IPC 返回事件级快照。`runtime-v2/usage-read-model.sqlite` 是可删除、可重建的查询读模型。Main 通过 Provider 有界读取，SQLite Worker 按需同步并查询；Agent Loop 和轨迹详情仍读取 Session，设计见[数据存储结构与职责](../core-data-storage-design.md)第 15–16 节。
- 清理或重建 Usage 派生数据不得删除 Session Journal、会话历史、设置或凭据。
- 页面筛选状态可以改变查询参数，但不能回写 Journal 中的 usage，也不能用 Context estimate 修正 provider usage。

## Context Projection

上下文估算只从 Journal 推算，日志里不存估算明细。会话投影 `contextEstimate` 用 `@actspace/shared` 的 `applyContextEstimate` 逐条折叠：

| 事件 | 处理 |
| --- | --- |
| `request/system-prompt` | 系统提示词、规则、技能、模型事实各项整体换新 |
| `request/tools` | 工具各项整体换新 |
| `request/header` / `request/context` | 更新最近请求、上下文窗口和 `contextModel` |
| 补充上下文增删、`step/end`、`turn/end` | 按补充的生命周期增删对应项 |
| 对话节点 surface `append` | 节点估算加进 `conversation` |
| 压缩替换 `surface/replaced`（`kind: "replace"`） | 减去事件里记的 `replacedTokens`，再把摘要节点估算加进 `summarizedConversation` |

状态大小只取决于系统提示词、工具和补充项的项数，不随消息数增长；对话只存两个合计。对外的 view 是总数、六个分类（System Prompt、Rules、Skills、Tool Definitions、Conversation、Summarized Conversation）、上下文窗口、`percentUsed` 和非对话明细。

估算算法全项目只有一套（`@actspace/shared` 的 `token-estimate.ts`，照 DSH `dsh-token-meter`）：文本一律 `Math.ceil(length / 4)`，非字符串先 `JSON.stringify`；每块内容加 4，每条消息再加 4，系统提示词整体、工具定义整体各加 4。面板、Composer 圆环、Web 百分比、Harness 统计、自动压缩触发和请求前容量检查都用它。纯中文文本会少算，这一点接受，自动压缩另有保险。

Context Projection 的 token 数是 UI 估算，不是 provider usage。展示项：

- `totalEstimatedTokens`；
- 容量：优先取 `request/context.snapshot.contextModel.contextWindow`，再取 `request/header.contextWindow`；只接受正安全整数，缺失或非法时 `percentUsed` 为 `0`；
- `percentUsed`；
- bucket tokens；
- entry preview、included、pinned、removable。

Composer 圆环、ContextPopup 与 Context 面板「当前」的总数和分类都只读 `contextEstimate` 这一个来源，面板标题保持「上下文」。面板的对话逐条明细不进投影，打开面板或翻页时用 `describeConversationEntries` 对当前对话现算：引擎在线用引擎实例的内容，不在线用日志折叠出的当前 Surface。预览和全文仍按 key 向引擎实时实例读取。顶部会话详情每次打开刷新累计 provider usage，仅显示一行「累计 Token：xxx」，不显示上下文占用、进度条、下拉明细或说明文字。

因此必须在 UI 和文档中区分：

```text
Provider usage = 已完成请求的真实或 adapter 标注值
Context estimate = 由 Journal 折叠出的可解释估算
```

Context estimate 只表示当前、最近一次或下次请求预计会携带的有效上下文；压缩后有效 Surface 变小，后续请求的 estimate 也应变小。压缩替换事件上记录的被替换估算是写入时算法的结果，以后换算法时压缩之后的合计会有偏差，用 `estimatorVersion` 识别。`Provider usage` 另行作为会话累计用量展示，它聚合每次真实 provider request 的输入、输出及缓存 Token，压缩不会清零，也不参与 Context 的容量百分比。

主进程 SQLite 上下文历史（`context-history-projection.ts`）和 Harness 统计（`harness-stats-projection.ts`）调用同一个折叠函数，在每个 `request/context` 时取当时的状态记趋势与明细，不读日志里的估算数。

不能用 Context estimate 回写或修正历史 provider usage。UI 消费完整 bucket，不再压缩成 provider usage 的两桶适配；未知 bucket 必须有稳定兜底。若新增 MCP/Subagent 专用类别，先扩展 `@actspace/shared` 的估算明细定义，再接 renderer。弹窗尺寸、数字格式与临时模型选择见 [Context 面板与 Composer](agent-context-model-facts-and-composer.md)。

## Context assembly 所有权

`packages/context` 只编排 contributor，不拥有 Session conversation。输入包括：

- 当前 Session Surface；
- Host facts；
- Prompt / Skill / Rule contributor；
- Tool definition；
- request-scoped options。

Contributor 必须有稳定 ID、owner plugin、order 和 criticality：

- required contributor 失败时 request 失败；
- optional contributor 失败时记录 skipped provenance；
- 排序由 `order + id` 决定，不能依赖注册时机；
- 结果进入 request snapshot 后冻结，本次 dispatch 期间不再热变更。

## Compaction

Compaction 不删除 Journal 历史，而是为有效 Session Surface 追加 replace transaction：

1. 选择可压缩的连续 Surface 区域；
2. flush 当前 Journal；
3. 生成 summary；
4. 写入 compaction transaction；替换事件 `surface/replaced` 带被替换范围的估算 `replacedTokens: { conversation, summarizedConversation }` 与 `estimatorVersion`，codec 强制要求；
5. flush 后让新 Surface 对后续请求生效。

当前默认 policy 使用 context limit、reserve token、trigger ratio 和最小区域长度决定是否压缩。自动触发和手动触发都必须拒绝在 active turn 中直接改写 Surface。

## 当前不提供的能力

以下仍是未来产品方向，不得写成当前事实：

- 用户直接增删改某个 Context entry；
- 把 entry 编辑结果保存到独立可覆盖文件；
- 跨 Session 的长期记忆自动注入；
- 可持久化的 Context pin / exclude 控制面；
- 独立于 Journal 的 Cache Audit sidecar。

如果未来实现这些能力，必须先定义新的 Journal event 或明确的派生存储失效规则，不能恢复 v1 的“双真相”结构。

## 代码事实入口

- `packages/context/prompt/src/assembler.ts`：contributor 排序、required / optional 语义；
- `packages/context/context-engine/src/request-snapshot.ts`：提示词记录、工具记录、`request/context` 快照的产出与 secret-like 字段拒绝；
- `packages/util/shared/src/request-record.ts`：生效提示词与工具的读取规则；
- `packages/util/shared/src/token-estimate.ts`、`context-entries.ts`、`context-estimate.ts`：唯一估算算法、估算明细定义与 `contextEstimate` 折叠；
- `packages/core/runtime/src/projection/durable-session.ts`：durable usage 聚合；
- `packages/core/runtime/src/projection/durable-session.ts`：`contextEstimate` 投影与 Usage facts；`packages/client/client/src/sessions/selectors.ts`：Client Context 与 Usage projection；
- `packages/context/context-compaction/src/plugin.ts`：Surface compaction transaction；
- `packages/context/context-compaction/src/policy.ts`：默认 compaction policy。

## 验收

- 持久 Session 只写 `sessions-v2/<id>/journal.jsonl`；
- 每次 dispatch 前存在关联同一 requestId 的 `request/header` 与 `request/context`；提示词或工具变化时，两者之间有同一 requestId 的 `request/system-prompt` / `request/tools`；
- 每次真实 provider request 的 usage 不被其他 request 覆盖；
- Context 面板可以仅凭 Journal 重建；
- 删除派生 UI 状态不会影响 Session 恢复；
- secret-like 字段无法进入 request snapshot；
- Compaction 后旧 Journal 行仍保留，后续请求只消费新的有效 Surface。


### 小于 1% 的显示边界

Context 的 `percentUsed` 保留浮点占用率。已知容量且有内容时，`percentUsed < 1` 显示 `<1%`；不能只判断 `<= 0` 再向下取整，否则 0.42% 会错误显示为 0%。Composer 与 ContextPopup 使用相同条件。空上下文或未知容量仍显示 0%，不猜测模型容量。此百分比不是缓存命中率。
