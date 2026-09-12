# ActSpace v2 Session 与 Context 目标设计

> 状态：逻辑事实模型、raw JSONL 物理格式、Event Codec、恢复和 Context Assembly 已确认。
>
> 本文定义 ActSpace Session Format v1 的目标边界；规范 schema 与 golden acceptance cases 见 [Session Format v1 规范](./agent-spec-session-format-v1.md)。
>
> 2026-08-29 起，事件词汇和 Agent Loop 顺序以 [DSH 风格 Session 事件模型](./agent-spec-dsh-event-model.md) 为准；本文保留为 Session/Context 分层背景。

## 1. 决策

ActSpace v2 完全替换当前 Session 日志、持久化和可变 Conversation 模型：

- Session Journal 是运行事实的唯一来源；
- 模型历史由 Journal 的 Surface projection 派生；
- Context assembly 不再维护第二份可变 conversation；
- v2 格式、事件注册、升级和降级语义由 ActSpace 控制；
- 不直接依赖 DSH Session / Persistence 包；
- 不读取、不迁移、也不继续写入 v1 Session 数据。
- v2 Session 只使用 UTF-8 raw JSONL 文件，不实现 zstd、SQLite 或 packed event row。

DSH Session 的语义和测试作为 golden reference，但 DSH 当前 format version `0`、RC 包和仓外插件事件限制不能成为 ActSpace 的长期兼容性边界。

## 2. 四层模型

Session 设计必须把四层分开：

| 层 | 职责 | 版本所有权 |
|---|---|---|
| Domain Journal | append-only facts、关系、不变量 | Session format + event schema |
| Surface | 模型可见 user/assistant/tool 内容与 replacement | Session format |
| Persistence coordinator | prepare/load/inspect、write-behind、flush、lease、repair | Runtime contract |
| Physical backend | UTF-8 raw JSONL：Header 首行、每个 event 一行 | backend schema |

逻辑事件与 JSONL 行仍是两个层次：前者定义领域语义，后者定义 v2 唯一物理编码。未来若引入新 backend，必须另立架构决策，不能在 v2 实现中留下隐式多 backend。

## 3. Session Header

Header 位于 Domain Journal 的 event sequence 之外，是创建后不可变的 Session 身份与恢复契约；在 JSONL 物理编码中，它作为文件首个记录。ActSpace Session Format v1 header 至少包含：

| 字段组 | 内容 |
|---|---|
| Format | format id、format version、backend schema version |
| Identity | session id、createdAt、可选 cwd |
| Lineage | parent session、seed boundary、origin、delegation depth |
| Runtime provenance | 创建时的 preset identity（若使用）、profile id、resolved manifest digest、selected plugin versions、runtime contract version |
| Event codecs | codec manifest digest 或可定位的 codec set identity |

Header 不保存 API key、Authorization header、proxy credential、完整环境变量或其他 secret。插件配置只能保存非敏感快照或 `credentialRef`。

Runtime provenance 用于回答“创建这份日志时解析了哪些能力”，不定义全局 Composition Generation，也不要求恢复时重新安装任意来源的旧代码。Header 创建后不可覆写；后续能力变化若影响 durable 语义，必须追加 selection / request snapshot 等事实。精确 manifest digest 不相等本身不是 resume 拒绝条件；缺少 required codec、所需 Preset 或行为 Provider 时，Session 可以浏览和导出，但不得错误地继续执行。

## 4. Event Envelope

每个事件具有以下稳定语义：

| 字段 | 约束 |
|---|---|
| type | 核心事件使用稳定名称；插件事件使用 `plugin/<plugin-id>/<event>` 命名空间 |
| eventVersion | 该事件 payload 的 schema version |
| seq | 从 0 开始、严格连续的 Session 内序号 |
| time | 接纳事件时冻结的时间戳 |
| data | lossless JSON snapshot，接纳后不可变 |
| criticality | 只能是 `required` 或 `ignorable`，由已注册 codec 固定，调用者不能临时自报 |
| surfaceOp | 对模型 Surface 的 append 或 replace 操作 |
| sourceEventSeqs | 当前 Surface 节点或结果依赖的原始事件 provenance |

写入边界必须先验证事件 schema、关系和 Surface 变化，再一次性加入 Journal；验证失败不能留下半条逻辑事实。

## 5. 核心事件族

精确事件族和 envelope 由 Session Format v1 规范固定；v1 必须表达这些领域事实：

- Session 创建、恢复、fork lineage 和 runtime provenance / preset selection；
- Turn start/end；
- Step start/end；
- user message；
- logical request header/context snapshot；
- assistant stream chunks 和 assembled message；
- tool call、tool result 和保守恢复结果；
- compaction transaction；
- approval request/decision；
- main Agent Inbox 的 enqueue / claim / discard；
- abort、interrupted 和 terminal failure；
- 插件拥有的 durable state event。

事件的作用是恢复正确语义，不是把每一条 debug log 都塞进 Session。纯诊断、性能样本和可丢失 telemetry 默认进入 projection 或 observability sink。

## 6. Surface

Surface 只承载模型历史需要的三类逻辑节点：

- user message；
- assistant message；
- tool result。

原始 assistant chunks、policy、approval、tool call 和 compaction control facts 保留在 Journal 中，但不必成为独立模型消息。

Surface 支持：

- append：增加一个新模型可见节点；
- positional replace：用一个新节点 shadow 一段既有 Surface，同时引用所有被替换来源。

replace 不删除原始事件。任何压缩、裁剪或摘要都只能通过追加 replacement 事实改变未来请求视图。UI、导出和审计仍可查看未被破坏的原始历史。

若实现暴露 `replaceGeneration`，它只表示成功提交 positional replacement 的单调计数，用于 Surface 派生缓存失效；普通 append 不增加该计数，Journal 的总体前进仍以连续 `seq` 表达。

插件不能直接扩展 Surface node union。插件若要影响模型上下文，应追加一个经过核心 schema 验证的 user message，或通过 Prompt / Context contributor 在 request snapshot 中形成可重建贡献。

## 7. Request Reconstruction

每次 LLM dispatch 前必须记录完整逻辑 request snapshot：

- provider / route / model；
- reasoning、max tokens 和相关 call config；
- assembled system prompt；
- tool schemas；
- Adapter defaults 和必要的 replay metadata；
- 从当前 Surface 派生的 boundary messages。

快照使用完整值而不是依赖进程内可变配置的 delta。相同快照可复用；发生变化时追加新 header/context 事实。

顺序固定为：先组装 logical request candidate，再由 LLM Service 创建 one-shot PreparedCall 并解析 exact registration / defaults / retry policy，随后用这些实际解析结果形成并 append snapshot，执行 durability checkpoint，最后 dispatch 同一个 PreparedCall。不能在 prepare 之前持久化猜测的 defaults，也不能在 checkpoint 之后重新解析 route。

可重建目标是 Agent-facing logical request。Provider wire payload、动态 credential、HTTP transport 和取消信号由 Adapter 负责，不持久化到 Session。

## 8. EventCodecRegistry

DSH 当前 persistence 使用构建时 known-event catalog，仓外插件无法注册 required durable event。ActSpace v2 从第一版提供运行时 Event Codec registry。

一个 codec 至少声明：

| 属性 | 作用 |
|---|---|
| type / ownerPluginId | 唯一事件身份和 provenance |
| currentVersion | 当前可写 schema |
| criticality | `required` 或 `ignorable` |
| validate | payload 和 envelope 校验 |
| upgrades | 从旧 eventVersion 到当前内存视图的纯升级链 |
| invariants | 与 Turn/Step、call/result、Surface 的关系约束 |
| projection hooks | 只读 projection 所需的纯函数 |

Codec manifest 必须在 Session decode 前可用，不依赖先激活可能需要读取 Session 的行为插件。插件安装信息和 codec 定义因此要与行为 activation 解耦。

读取策略：

| 状态 | 行为 |
|---|---|
| unknown required event | 保留 raw log；允许 browse/export；阻止 resume、compact、execution fork 和新写入 |
| unknown ignorable event | 保留 raw event；跳过其 projection；标记 degraded；允许不依赖它的继续操作 |
| known codec，行为插件缺失 | 可读；若继续执行需要该行为则阻止 resume |
| known codec，payload 非法 | 标记 corruption；不按 unknown event 降级 |
| eventVersion 高于 reader | 按 required/ignorable 规则处理，不静默按旧 schema 解释 |

插件事件默认 required。只有 codec 作者能把纯信息事件声明为 ignorable，写事件的调用者不能通过一个布尔值绕过恢复正确性。

## 9. Persistence 与 Durability

Session append 在内存中同步接纳并冻结事件；物理写入可以通过短窗口 write-behind 批处理，但必须满足：

- 同一 Session 的写入严格串行；
- flush 是明确的 durability barrier；
- 写失败保留未提交 batch，并让后续副作用 fail-closed；
- dispose 取消窗口、drain 队列并等待静止；
- Desktop、CLI 和其他 Host 共享存储时使用跨进程 writer lease；
- browse/inspect 不隐式修改物理文件；
- continue/load 可以在明确事务中提交 repair 或同一 ActSpace v2 格式族内的 schema upgrade；这不包括 v1 Session importer 或数据迁移。

持久化 Profile 必须在 LLM dispatch、顶层工具副作用和下一 Step 前执行 checkpoint。ephemeral Profile 必须显式标识，不创建伪持久 Session。

## 10. 崩溃恢复

恢复保留已经 durable 的 open tail，不通过删除尾部让日志看起来完整。系统根据已有事实追加保守 closers：

- 已记录 call、未确认 dispatch：`not-started`；
- 已越过副作用边界但没有 result：`outcome-unknown`；
- open Step：追加 interrupted step end；
- open Turn：追加 interrupted turn end。

`outcome-unknown` 不能自动重试具有副作用的工具。是否允许用户确认后重试由 Tool policy 决定，并产生新的 call identity。

Repair 必须幂等。raw JSONL 若无法原子表达多行 repair，必须有 repair marker 或可重放事务边界，避免 truncate + append 中间态成为新损坏。

## 11. Fork 与运行能力

Fork 只接受平衡、完整且无 dangling tool call 的边界。v2 目标支持从 cold persisted Session fork，不要求源 Session 当前 live。

Fork 复制逻辑 prefix 和 lineage，不复制进程内 Registry、credential 或活跃 Fiber。新 Session 按当前 Host 和 Profile 解析目标 Preset / runtime capabilities，不选择全局 Composition generation；若所需 codec、Preset 或行为能力不兼容，fork 在写入前失败。

## 12. Context Assembly

Context 不再是持有 conversation 的可变容器。每个 Step 的 Request Assembly 从以下来源生成一个不可变请求：

1. Session Surface；
2. 当前 Agent scope 的 system prompt sections；
3. 当前 Agent scope 的 tool definitions；
4. 通过稳定 contributor seam 注册的动态 context；
5. 当前 LLM route 和 one-shot PreparedCall defaults。

所有模型可见贡献必须满足二者之一：已经存在于 Session Surface，或被记录进本次 logical request snapshot。无法重建的隐式进程状态不能影响模型输入。

## 13. 物理格式

v2 唯一规范物理格式为：

```text
<session-root>/<session-id>/journal.jsonl
```

- UTF-8、无 BOM、LF 结尾；
- 第一行是不可变 Header；
- 后续每行恰好一个完整 Event Envelope；
- 一个逻辑事件对应一行，不使用 packed chunk row；
- 不使用压缩 frame、二进制 block 或 SQLite page；
- attachment / artifact 只保存 durable reference，不把大型二进制嵌入 Journal。

普通文件引用在请求组装时解析成可读路径与回读提示；图片引用保留 image 类型与 artifact ID，仅在 wire adapter 读取字节。`request/context` 保存归一化后的逻辑消息（含本次解析路径），不存 wire Base64。详见[工具输出与引用](../tool-system/agent-tool-output-references.md)。

formatVersion、eventVersion、backendSchemaVersion 和 runtimeContractVersion 分别演进。checksum、`fsync`、writer lock、publish 和 torn-tail 保留证据的具体平台算法留给 execution plan，但必须满足 [Session Format v1 规范](./agent-spec-session-format-v1.md) 的可观察 durability 与 repair 语义。

## 14. v1 数据策略

ActSpace 当前处于开发阶段，没有需要迁移的生产 Session 数据。v2 因此：

- 不实现 v1 importer；
- 不兼容旧 `SessionEvent` union；
- 不保留 `context-state.json` 作为恢复事实；
- 不为旧 Kairos、fs-watch 或 Tool preview 事件注册兼容 codec；
- 切流时由单独 execution plan 明确可删除的数据目录，并在执行前重新确认精确路径。

“不迁移”不授权现在删除任何用户数据；实际删除仍是独立、可审查的实施动作。

## 15. 已固定契约与实施细节

已固定：

- Header、Event Envelope、核心事件族和 raw JSONL 文件布局；
- codec 在 behavior activation 和 Session decode 前发现；
- event criticality 只有 `required` / `ignorable`，`browse-only` 是 Session access state；
- cross-process exclusive writer lease、fail-closed checkpoint、幂等 repair、cold fork 与 append-only Compaction；
- Prompt / Context 的确定性排序与 request snapshot provenance。

实施时只需细化平台锁与 stale 判断、`fsync` / atomic publish 序列、write-behind 参数、torn-tail 文件操作、schema 文件布局、cache、compaction 阈值和 attachment API。这些选择不得增加第二种物理 backend，也不得削弱 golden contract。
