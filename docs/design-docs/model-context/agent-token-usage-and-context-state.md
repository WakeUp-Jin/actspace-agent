# Token Usage 与 Context Projection

> 状态：当前 v2 设计与实现事实。v1 的 `context_snapshot`、独立 Context state 文件和可变 conversation 持久化不再使用。

Session、Surface 和 request snapshot 的规范分别见：

- [`agent-target-session-and-context.md`](../agent-plugin-runtime/agent-target-session-and-context.md)
- [`agent-spec-session-format-v1.md`](../agent-plugin-runtime/agent-spec-session-format-v1.md)
- [`agent-spec-prompt-context-contributors.md`](../agent-plugin-runtime/agent-spec-prompt-context-contributors.md)

## 目标

Actspace 需要分别回答三类问题：

1. **模型实际消耗了多少**：来自 provider / adapter 返回的 usage；
2. **某次模型请求实际组装了什么**：来自 dispatch 前冻结的 request snapshot；
3. **用户当前在 UI 中看到什么**：来自 Journal 与 request snapshot 的 Runtime Projection。

这三类数据有关联，但不能合并为一个可覆盖文件。

## 唯一持久事实

持久 Session 只写：

```text
sessions-v2/<sessionId>/journal.jsonl
```

当前 Agent Loop 产生的关键事件包括：

- `request/header`：requestId、turnId、stepId、routeId、model、attempt 和 contextWindow；
- `request/context`：与同一 requestId 关联、dispatch 前冻结的逻辑 request snapshot；
- `assistant/message`：请求终态与 provider usage；`step/end` 提供步骤终态及工具步骤的 usage 回退；
- `llm/retry` / `llm/retry-started`：失败尝试与下一次重试；
- `compaction/start` / `compaction/summary` / `surface/replaced` / `compaction/end`：压缩过程与 Surface 替换。

旧 v2 草案中的 `request/snapshot`、`llm/usage`、`llm/ended` 不是当前默认 Loop 的事件词汇；不能据此新增 producer 或解释当前 Journal。事件目录见 [DSH 事件模型](../agent-plugin-runtime/agent-spec-dsh-event-model.md)。

不存在独立 `context-state` 文件。UI 的 Context 状态可以随当前 Projection 算法升级而变化，但 Journal 事实保持不变。

## Request Snapshot

每次真实模型 dispatch 前，Prompt / Context 与 LLM service 共同形成 JSON-safe、deep-frozen snapshot：

```text
sessionId
turnId
stepId
messages
systemSections
facts
renderedSystemPrompt
tools
contributorProvenance
requestOptions
compositionDigest
hostCapabilityDigest
prepared.route / model / registrationId / adapterVersion
prepared.defaults / retryPolicy / contextWindow
```

Snapshot 的作用是：

- 证明一次 request 使用了哪份 Session Surface；
- 证明哪些 Prompt / Context contributor 参与组装；
- 关联 route、model、adapter 和 retry policy；
- 为 Context、Trajectory 和故障恢复提供确定输入；
- 在恢复时结合 request/terminal 关系识别未结束请求；dispatch 的外部效果边界仍由对应恢复契约解释，snapshot 自身不证明请求已发送。

Snapshot 不得包含 API Key、Authorization、Cookie、proxy credential 或其他 secret-like 字段。`packages/prompt/src/request-snapshot.ts` 会拒绝非 JSON 值、非有限数字、过深对象和敏感字段名。

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
- Usage 明细继续由 Journal Projection 提供，当前通过 typed `usage-activity:get` IPC 返回事件级快照。当前不引入独立 SQLite 事实库；如果未来增加 `runtime-v2/usage-read-model.sqlite`，它只能是可删除、可重建的查询缓存。
- 清理或重建 Usage 派生数据不得删除 Session Journal、会话历史、设置或凭据。
- 页面筛选状态可以改变查询参数，但不能回写 Journal 中的 usage，也不能用 Context estimate 修正 provider usage。

## Context Projection

当前 Desktop Context 面板从最近一次 `request/context.snapshot` 派生只读 entries，并从该 snapshot 的 prepared metadata 或关联 `request/header` 读取容量：

| Snapshot 来源 | UI bucket |
| --- | --- |
| `systemSections` 的核心段 | System Prompt |
| rules contributor | Rules |
| skills contributor | Skills |
| `tools` | Tool Definitions |
| `facts` | System Prompt 中的 Runtime facts entry |
| `messages` | Conversation |
| 最近 Compaction summary | Summarized Conversation |

Context Projection 的 token 数是 UI 估算，不是 provider usage。当前估算器会根据文本字符做近似计算，并展示：

- `totalEstimatedTokens`；
- `maxTokens`：优先取 `snapshot.prepared.contextWindow`，再取关联 `request/header.contextWindow`；只接受正安全整数，缺失或非法时为 `0`；
- `percentUsed`；
- bucket tokens；
- entry preview、included、pinned、removable。

Composer 百分比与 ContextPopup 优先消费同一份完整请求分项估算，面板标题保持「上下文」。`projectContextSnapshot` 从 `projectContextState` 派生总量、容量和 buckets；工作台不能用整体序列化估算覆盖完整分项投影，也不能用 provider usage 代替上下文占用。顶部会话详情每次打开刷新累计 provider usage，仅显示一行「累计 Token：xxx」，不显示上下文占用、进度条、下拉明细或说明文字。

因此必须在 UI 和文档中区分：

```text
Provider usage = 已完成请求的真实或 adapter 标注值
Context estimate = 当前 snapshot 的前端可解释估算
```

Context estimate 只表示当前、最近一次或下次请求预计会携带的有效上下文；压缩后有效 Surface 变小，后续请求的 estimate 也应变小。分页浏览缓存只能截短 entry preview，必须保留完整的 bucket 与 total 计数。`Provider usage` 另行作为会话累计用量展示，它聚合每次真实 provider request 的输入、输出及缓存 Token，压缩不会清零，也不参与 Context 的容量百分比。

不能用 Context estimate 回写或修正历史 provider usage。UI 消费完整 bucket，不再压缩成 provider usage 的两桶适配；未知 bucket 必须有稳定兜底。若新增 MCP/Subagent 专用类别，先扩展 snapshot 分类契约，再接 renderer。弹窗尺寸、数字格式与临时模型选择见 [Context 面板与 Composer](agent-context-model-facts-and-composer.md)。

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
4. 写入 compaction transaction；
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

- `packages/context/src/assembly.ts`：contributor 排序、required / optional 语义；
- `packages/prompt/src/request-snapshot.ts`：snapshot 冻结与 secret-like 字段拒绝；
- `packages/runtime/src/projection/durable-session.ts`：durable usage 聚合；
- `packages/runtime/src/projection/durable-session.ts`：Host Context 与 Usage facts；`packages/client/src/sessions/selectors.ts`：Client Context 与 Usage projection；
- `packages/compaction/src/plugin.ts`：Surface compaction transaction；
- `packages/compaction/src/policy.ts`：默认 compaction policy。

## 验收

- 持久 Session 只写 `sessions-v2/<id>/journal.jsonl`；
- 每次 dispatch 前存在关联同一 requestId 的 `request/header` 与 `request/context`；
- 每次真实 provider request 的 usage 不被其他 request 覆盖；
- Context 面板可以仅凭 Journal 重建；
- 删除派生 UI 状态不会影响 Session 恢复；
- secret-like 字段无法进入 request snapshot；
- Compaction 后旧 Journal 行仍保留，后续请求只消费新的有效 Surface。
