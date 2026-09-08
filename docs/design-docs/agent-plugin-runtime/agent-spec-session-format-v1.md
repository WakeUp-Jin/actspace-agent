# ActSpace Session Format v1 规范

> 状态：v2 Session 逻辑契约已固定，可作为 execution plan 和 golden fixtures 的输入。
>
> 本文固定 Session 的领域语义、规范存储形态、兼容性状态和持久化保证。文件锁实现、`fsync` 调用序列、原子发布算法等平台细节留给 execution plan，但实现不得削弱本文定义的可观察语义。
>
> 规范日期：2026-08-22。
>
> 2026-08-29 起，事件词汇、Agent Loop 顺序和三平面边界由 [DSH 风格 Session 事件模型](./agent-spec-dsh-event-model.md) 取代；本文保留为 raw JSONL、Header、repair 和物理格式背景，不作为本轮事件实施真源。

## 1. 决策摘要

ActSpace v2 完全替换 v1 Session、持久化日志和可变 Conversation 双真相模型：

- Session Journal 是一次 Agent 运行的唯一持久事实来源；
- Journal 只追加，不原位修改或删除已经接纳的领域事件；
- Surface 是从 Journal 确定性派生的模型可见历史，不是第二份可写 conversation；
- 每次模型请求使用的完整逻辑输入在 dispatch 前写成不可变 request snapshot；
- ActSpace 拥有 format、核心 event、Event Codec、兼容性和升级规则；
- v1 的规范持久化形态只有 raw UTF-8 JSONL，不采用 zstd、SQLite 或 packed row；
- v2 不读取、不迁移、也不继续写入 v1 Session 数据。

Agent Loop、Tool 和 LLM 必须遵守本规范，但不能直接拥有或绕过 Session writer。与调用顺序相关的不变量见 [Agent Core 目标边界](./agent-target-agent-core.md) 和 [LLM Adapter 目标设计](./agent-target-llm-adapter.md)。

## 2. 四层模型

Session 必须明确分开四层：

| 层 | 职责 | 是否规范事实 |
|---|---|---|
| Domain Journal | append-only event、关系、调用边界和恢复事实 | 是 |
| Surface | 从 Journal 派生的 user、assistant、tool-result 模型历史 | 是，但只能由 Journal 重建 |
| Persistence Coordinator | append、flush、writer lease、load、inspect、repair、fork | 否，是领域服务 |
| Physical Format | raw UTF-8 JSONL 的文件布局和记录边界 | 是 |

投影缓存、索引和 UI DTO 不是 Session 事实。它们必须能被删除后从 Journal 重建，也不能反向修改 Journal。

## 3. 规范文件布局

一个 Session 的规范存储单元是一个 Session 目录，其中唯一规范事实文件为：

```text
<session-root>/<session-id>/journal.jsonl
```

`journal.jsonl` 必须满足：

1. 使用 UTF-8，无 BOM；
2. 每行恰好一个完整 JSON object，以 LF 结束；
3. 第一行恰好是一个 Header record；
4. 后续每行恰好是一个 Event Envelope；
5. 一个逻辑事件对应一行，不把多个 stream chunk 打包成 packed row；
6. 不在规范文件内使用压缩 frame、二进制 block 或 SQLite page；
7. JSON object 的 key 顺序不具有语义，读者不得依赖序列化 key 顺序；
8. v1 不要求逐行 checksum；完整性由 JSON 可解析性、连续 `seq`、关系不变量和 durability barrier 共同检查。

附件和大型 artifact 不内嵌到 Journal。事件只能保存由 ActSpace attachment/artifact store 管理的 durable reference、内容类型、大小和内容摘要。实际二进制不属于 Session Format。

临时锁、写入队列、索引、诊断和可重建 projection cache 不属于规范文件。它们的路径可由实现决定，但不得被 resume 当作比 `journal.jsonl` 更权威的事实。

## 4. Header record

Header 是文件第一行，创建后不可变，不占用事件 `seq`。概念 schema 为：

```json
{
  "recordKind": "header",
  "format": "actspace-session",
  "formatVersion": 1,
  "backend": "raw-jsonl",
  "backendSchemaVersion": 1,
  "sessionId": "session-id",
  "createdAt": "RFC3339 timestamp",
  "cwd": "optional normalized workspace path",
  "lineage": {
    "parentSessionId": "optional session-id",
    "parentBoundarySeq": 42,
    "origin": "new | fork | delegation",
    "delegationDepth": 0
  },
  "createdWith": {
    "profileId": "profile-id",
    "presetId": "optional preset-id",
    "runtimeContractVersion": "contract-version",
    "manifestDigest": "digest",
    "plugins": [
      { "id": "plugin-id", "version": "exact-version" }
    ],
    "codecSetDigest": "digest"
  }
}
```

`cwd` 和 `presetId` 可以省略。新建且没有父 Session 时 `lineage` 必须为 `null`；`fork` 或 `delegation` 的 `lineage` 必须同时包含 `parentSessionId`、`parentBoundarySeq`、`origin` 和 `delegationDepth`。其余字段不得省略。

Header 只记录创建时 provenance，不把整个 Session 绑定到一个全局 Composition Generation。运行中发生 Provider、Preset 或能力选择变化时追加事件和 request snapshot，不修改 Header。恢复时 manifest digest 不同本身不是拒绝条件；缺失 required codec 或继续执行所需能力才是兼容性判断依据。

Header 不得包含 API key、Authorization header、proxy credential、cookie、完整环境变量或其他 secret。配置只能记录已经脱敏的非敏感值、摘要或 `credentialRef`。

## 5. Event Envelope

Header 后的每条记录使用统一 envelope：

```json
{
  "recordKind": "event",
  "seq": 0,
  "type": "turn/started",
  "eventVersion": 1,
  "criticality": "required",
  "time": "RFC3339 timestamp",
  "source": {
    "ownerPluginId": "@actspace/core",
    "agentId": "optional agent-id",
    "turnId": "optional turn-id",
    "stepId": "optional step-id"
  },
  "data": {},
  "surface": null,
  "provenance": {
    "sourceEventSeqs": [],
    "contributorIds": [],
    "runtimeSelectionSeq": null
  }
}
```

字段语义：

| 字段 | 约束 |
|---|---|
| `seq` | 从 0 开始严格连续；是 Journal 总体前进的唯一顺序 |
| `type` | 核心事件使用稳定命名；插件事件必须使用 `plugin/<plugin-id>/<event>` |
| `eventVersion` | 只版本化该 `type` 的 `data` 和专属语义 |
| `criticality` | 只能是 `required` 或 `ignorable`，由已注册 codec 固定，调用者不能自报 |
| `time` | Session 接纳事件时冻结的 RFC3339 时间；不作为排序依据 |
| `source` | 事件所有者以及可选 Agent、Turn、Step identity |
| `data` | 通过 codec 校验后冻结的 lossless JSON value |
| `surface` | 无 Surface 变化时为 `null`，否则是核心定义的 append 或 replace operation |
| `provenance` | 形成本事实或 Surface node 的源事件、contributor 和 runtime selection 引用 |

接纳边界必须先完成 codec、关系、Surface operation、大小限制和 secret policy 校验，再把整个不可变 event 分配给下一个 `seq`。验证失败不能消耗 `seq`，也不能留下半条逻辑事实。

## 6. 核心事件族

核心 codec 随 Trusted Boot 提供，并在任何 Session decode 前可用。v1 至少需要以下事件族；最终 TypeScript 类型可以拆分，但不能删掉对应语义：

| 事件族 | 必须表达的事实 |
|---|---|
| Runtime selection | 创建后实际采用的 Profile、Preset、Provider、插件能力和变化后的 provenance |
| Turn | `turn/started`、成功/失败/中止的 `turn/ended` |
| Step | `step/started`、成功/失败/中止的 `step/ended` |
| User message | 用户输入、durable attachment refs 和 Surface append |
| Logical request | 完整 request snapshot、实际 route/model/defaults/retry policy、system、tools、messages 和 contributor provenance |
| LLM execution | dispatch boundary、stream chunk、assembled assistant message、usage、stop/error/abort |
| Tool execution | call、prepared registration identity、dispatch boundary、result、denied、aborted 和 recovery outcome |
| Approval | request、decision、Host policy 和对应 tool call |
| Agent Inbox | main Agent message enqueue、claim、discard、target 和 Surface provenance |
| Delegation | parent request、child lineage、child terminal result，以及 parent link / tool result 的幂等补偿 |
| Surface replacement | compaction 或明确裁剪产生的 positional replacement 及完整来源 |
| Recovery | repair transaction、`not-started`、`outcome-unknown` 和 open Turn/Step closers |
| Session lifecycle | resume、fork lineage、terminal failure 和显式 close |

纯 debug log、性能采样和可丢失 telemetry 不进入 Journal。插件只有在恢复语义确实依赖某项状态时才定义 durable event。

核心事件的字段命名和 TypeScript discriminated union 可以在实现中细化，但 golden fixtures 必须覆盖上表全部事实，且后续重命名必须增加 eventVersion upgrade，不能静默改变既有行的解释。

## 7. Surface

Surface 只包含三种模型可见节点：

- user message；
- assistant message；
- tool result。

Tool call、approval、policy、assistant stream chunk、usage 和控制事件保留在 Journal，但不自动成为独立模型消息。

Surface operation 只有两种：

1. `append`：追加一个经过核心 schema 验证的模型可见节点；
2. `replace`：用一个新节点 shadow 一段连续 Surface 位置，并引用被替换节点的全部 source event seq。

`replace` 不删除、覆盖或重排原始事件。若实现暴露 `replaceGeneration`，它只是成功提交 `replace` 的单调计数，用于派生缓存失效；普通 append 不增加它，它也不是 Runtime 或 Composition generation。

插件不得扩展 Surface node union。插件影响模型输入时，只能追加经过核心 schema 验证的 user message，或通过 Prompt / Context contributor 把完整贡献写进 logical request snapshot。

## 8. Logical request snapshot

每次 LLM dispatch 前必须追加完整、不可变的逻辑 request snapshot，至少包含：

- Provider route、exact model 和 capability selection；
- reasoning、max tokens、stop 和其他 Agent-facing call config；
- assembled system prompt；
- 有稳定 tool/contributor identity 和 schema digest 的完整 tool schemas；
- 从当前 Surface 派生的 boundary messages；
- 动态 Context contributor 的完整模型可见值、identity、version/digest 和排序结果；
- PreparedCall 实际解析出的 Adapter registration identity、defaults 和 durable retry policy；
- 必需的、版本化的 Adapter-private replay metadata；
- 对应 Surface source seq 和 runtime selection provenance。

固定顺序为：

```text
assemble request candidate
  -> create one-shot PreparedCall and acquire activation lease
  -> append exact logical request snapshot
  -> durability checkpoint
  -> dispatch the same PreparedCall
```

prepare 之前不能写一条猜测 exact Adapter/defaults 的 snapshot；checkpoint 之后不能重新解析 route。credential、proxy object、HTTP transport、`AbortSignal` 和最终 Provider wire payload 不进入 Session。

snapshot append、flush 或 pre-dispatch abort 失败时，调用边界必须释放尚未 dispatch 的 PreparedCall lease，并且不得发起 wire request。

## 9. EventCodecRegistry

### 9.1 发现顺序

Codec 发现与行为插件 activation 必须解耦：

```text
resolve installed plugin metadata
  -> validate codec descriptors and ownership
  -> load core and plugin codecs into EventCodecRegistry
  -> inspect/decode requested Sessions
  -> decide compatibility access state
  -> activate behavior plugins needed by the Runtime/Profile
```

Trusted Boot 从 Core 与全部显式登记、受信任且已安装的插件元数据发现 codec。ResolvedComposition、Header、runtime selection 和 event owner 只决定实际需要哪些 codec，不是发现来源的上限；否则 Header 创建后追加的后来插件事件将无法读取。Codec 装载阶段不能依赖 Session 行为 Service、credential、Agent Registry 或已经读取该 Session 才能建立的状态。Codec 的 validate、upgrade、invariant 和 projection hook 必须是确定性、无外部副作用的纯逻辑。Runtime 不扫描任意目录、不自动下载，也不因日志出现 plugin id 就执行未知代码。

同一 event `type` 只能有一个 owner。重复注册、owner 不匹配、版本链不连续或 codec descriptor digest 不匹配时，Startup Validation 必须失败。

### 9.2 Codec 契约

每个 codec 至少声明：

- `type` 和 `ownerPluginId`；
- `currentVersion`；
- 固定的 `required` 或 `ignorable` criticality；
- payload/envelope validation；
- 从旧 eventVersion 到当前内存视图的连续纯升级链；
- 与 Turn、Step、call/result 和 Surface 的关系不变量；
- 只读、确定性的 projection hooks。

插件事件默认 `required`。只有 codec 作者可以把纯信息、缺失后不会改变恢复或执行语义的事件定义为 `ignorable`。事件写入者不能逐次覆盖 criticality。

Codec upgrade 默认只生成内存视图，不覆写原始行。任何持久升级必须是显式、可审计、仅限 ActSpace v2 format family 的事务。

## 10. 兼容性与访问状态

`browse-only` 是打开整个 Session 后计算出的访问状态，不是第三种 event criticality。

| 条件 | Session 状态 | 允许 | 禁止 |
|---|---|---|---|
| 全部 required codec 和行为能力可用 | `read-write` | browse、export、resume、fork、compact、append | 无额外限制 |
| 只有 unknown/unsupported ignorable event | `degraded` | 保留 raw event，跳过其投影，browse/export；允许不依赖它的 resume/fork/append | 把未知数据解释为旧 schema |
| unknown required event、required eventVersion 过新，或继续执行所需行为 Provider 缺失 | `browse-only` | raw browse、诊断、canonical export | resume、execution fork、compact、repair、append |
| 已知 codec 的 payload/envelope/关系非法，或非尾部物理损坏 | `corrupt` | raw browse、诊断、forensic export | resume、fork、compact、普通 repair、append |

未知记录必须逐字节保留在原文件或 forensic artifact 中。读者不能通过丢弃 unknown required event 把 Session 降级成可继续运行。

Header 的 manifest digest 与当前 Runtime 不相等只产生 provenance 诊断，不单独改变访问状态。

## 11. Append、write-behind 与 durability

Persistence Coordinator 可以使用短窗口 write-behind，但必须提供以下语义：

- append 在内存中同步验证、冻结并按 Session 严格串行接纳事件；
- 同一时刻每个 Session 只有一个有效 writer lease；
- `flush(throughSeq)` 只有在不大于 `throughSeq` 的全部已接纳事件满足平台 durability contract 后才能成功返回；
- flush 失败时保留未提交 batch，writer 进入 blocked/fail-closed 状态，并向调用方返回原始 cause；
- blocked writer 在明确恢复前不接受会导致新模型请求、工具副作用或下一 Step 的工作；
- dispose 必须停止接纳、取消 batch window、drain 或报告失败，并等待 writer 和 lease 静止；
- inspect/browse 不获取 writer lease，也不隐式 repair 或改写文件。

至少在这些位置执行 durability checkpoint：

1. 完整 logical request snapshot 后、LLM dispatch 前；
2. tool call 接纳后，使崩溃可判断为尚未开始；
3. approval 已完成且 `tool/dispatch-started` 接纳后、进入可能有副作用的 tool body 前；
4. 上一 Step 的 assistant/tool results 和结束事实后、下一 Step 前；
5. graceful shutdown 发布 Session 已 flush 状态前。

checkpoint 失败必须 fail closed：不能发送模型请求、不能进入工具 body、不能开始下一 Step。该保证不等于 exactly-once。

具体文件描述符、lock primitive、租约心跳、`fsync`/`fdatasync`、目录同步和 rename/publish 序列由 execution plan 根据 macOS、Linux 和 Electron/CLI 目标确定，但必须通过跨进程并发、进程崩溃和断电模拟证明上述语义。

## 12. Writer lease

Desktop 与显式持久化的 CLI run 共享 Session root 时，持久 Session 必须使用跨进程 exclusive writer lease：

- 成功持有 lease 的进程才可 append、repair、compact 或提交 fork source transaction；
- lease identity 至少关联 Session、Host process identity 和本次 writer instance；
- 第二个 writer 不能偷取仍健康的 lease，也不能降级为无锁 append；
- stale lease recovery 必须先证明原 writer 已失效，并记录结构化诊断；
- lease 丢失后当前 writer 立即 fail closed，未确认 durable 的 batch 不得被报告为成功；
- browse/export 始终可以并发只读，但必须只读取一个经过验证的完整前缀。

锁文件、OS advisory lock、心跳和 stale timeout 的具体组合是实现细节；exclusive、可诊断、失效即停止写入是规范要求。

## 13. 崩溃恢复与 repair

恢复以最后一个可验证的完整事件前缀为输入，不通过删除已经 durable 的 open Turn、Step 或 call 让历史看起来完整。

保守分类固定为：

| durable tail | repair 结果 |
|---|---|
| 有 tool call，没有 `tool/dispatch-started` | 追加 `not-started` |
| 有 `tool/dispatch-started`，没有 terminal result | 追加 `outcome-unknown` |
| Step 未结束 | 追加 interrupted Step end |
| Turn 未结束 | 追加 interrupted Turn end |

`outcome-unknown` 的有副作用工具不得自动重试。用户确认后重试也必须创建新的 call identity，并保留与原 call 的 provenance。

Repair 是显式、幂等的逻辑事务：

- 每次 repair 有稳定 `repairId` 和被检查的 source boundary；
- 多条 repair facts 只有在对应 commit marker 可见后才进入有效 Journal 视图；
- 未提交 repair batch 在重试时不得重复产生第二组有效 closers；
- repair 只处理可证明的 crash-open tail，不能把非法 payload、未知 required event 或中间文件损坏改写成健康数据；
- torn final line 不能静默忽略。实现必须先保留 forensic bytes，再通过可恢复的发布流程产生新的规范完整前缀和 repair 证据；精确发布算法由 execution plan 决定。

## 14. Fork

Execution fork 只允许从 `read-write` 或满足所需 codec/能力的 `degraded` Session 中，选择一个平衡、完整且没有 dangling tool call 的边界。

Fork：

- 创建新的 Session id 和 Header；
- 在新 Header 的 lineage 中记录 parent Session 和 boundary seq；
- 复制或重放到该边界的逻辑 prefix，保持 source provenance；
- 不复制 API credential、进程内 Registry、Cordis Fiber、activation lease 或 writer lease；
- 按新 Host 和当前 Profile 重新解析目标 Preset 与 runtime capabilities；
- 在任何新文件发布前验证 codec、行为 Provider 和目标边界兼容性。

`browse-only` 或 `corrupt` Session 可以导出，但不能 execution fork。Fork 不选择或恢复一个全局 Composition Generation。

## 15. Compaction

Compaction 只改变未来 Request Assembly 看到的 Surface，不破坏 Journal：

1. compaction request 和使用 summary Provider 的模型调用遵守普通 request snapshot 与 checkpoint 规则；
2. summary 成功后追加一个原子的 Surface `replace` event；
3. replacement 精确引用被 shadow 的 Surface positions 和全部 source event seq；
4. 原始 user、assistant、tool、approval 和 request facts永久保留；
5. compaction 失败不留下半个 replacement，也不改变当前 Surface；
6. 同一 Journal 前缀和 codec set 必须派生出相同 Surface。

v2 的 token budget、触发阈值和 summary Provider 选择属于运行 policy，不属于文件格式。无论 policy 如何，不能通过 truncate、重写旧行或删除原始 Session 来压缩。

## 16. Provenance

Session 必须能回答：

- 创建时使用了哪个 Profile、Preset、runtime contract 和插件版本；
- 每次模型请求实际使用哪个 Adapter registration、route、model、defaults 和 retry policy；
- system prompt、tool schema 和动态 context 分别由哪个 contributor 贡献；
- Surface node 和 compaction summary 来自哪些原始 event seq；
- tool result 对应哪个 call、definition/executor registration 和 approval decision；
- repair、fork 和 runtime selection change 基于哪个已验证边界。

Header 只承担创建时 provenance。所有会影响后续模型输入或副作用解释的变化必须追加新事实或写入 request snapshot，不能只存在于 diagnostics 或进程内 Registry。

## 17. 安全与隐私

- 所有 Header/event 数据必须是 JSON-safe、经过 schema 验证的冻结快照；
- credential 只记录 `credentialRef`，不得记录解析后的 secret；
- 日志、错误、Provider metadata、tool argument summary 和 diagnostics 在进入 Session 前必须执行 secret redaction；
- 不能持久化 proxy credential、Authorization header、cookie、完整环境变量、`AbortSignal`、socket/client object 或任意可执行代码；
- codec 与 projection hook 不能执行网络、进程、文件写入或 credential 读取；
- 超过记录大小、递归深度或字符串限制的事件应在分配 `seq` 前拒绝，不能静默截断；
- cwd、用户文本、tool output 和 attachment ref 可能含敏感信息，export 必须显式区分 lossless canonical export 与经过脱敏的分享 export。

v2 插件按受信任同进程代码处理；EventCodecRegistry 不是不可信代码沙箱。信任边界见 [Cordis 运行时采用决策](./agent-decision-cordis-adoption.md)。

## 18. 版本轴与升级

四条版本轴不得混用：

| 版本 | 控制范围 |
|---|---|
| `formatVersion` | Header、Journal、Surface 和兼容性总语义 |
| `backendSchemaVersion` | raw JSONL 文件级布局和物理发布协议 |
| `eventVersion` | 单个 event type 的 data/schema 语义 |
| `runtimeContractVersion` | Runtime、插件 ABI 和领域 Service 契约 |

插件 package version 和 manifest digest 是 provenance，不代替任何 schema version。

Event Codec 可以对旧 eventVersion 做纯内存升级。format/backend 的持久升级必须显式获取 writer lease、先验证整个 source、以新文件发布并保留可审计证据；不能在普通 browse 时偷偷升级。

Session Format v1 只指 ActSpace v2 新格式。它与产品版本 v1 的旧 Session 没有兼容关系。

## 19. 明确不支持 v1 数据迁移

ActSpace v2：

- 不实现 v1 Session importer；
- 不兼容旧 `SessionEvent` union；
- 不读取 `context-state.json` 作为恢复事实；
- 不为 Kairos、fs-watch 或旧 Tool preview event 增加兼容 codec；
- 不在新 writer 中继续产生 v1 文件；
- 不因为“无迁移”自动删除旧数据。

删除旧数据目录必须在独立 execution plan 中重新解析并展示精确路径，经人工确认后执行，且不得触及 workspace、credential、artifact 或其他用户数据。

## 20. 必须成立的不变量

实现和 invariant validator 至少检查：

1. Header 第一行恰好一次，Header session id 与目录 identity 一致；
2. event `seq` 从 0 严格连续，无重复、回退或空洞；
3. event type、owner、criticality 和 eventVersion 与写入时 codec 一致；
4. Turn、Step 的 parent/开始/结束关系有效，terminal event 不重复；
5. request snapshot 位于对应 Step 内，先于 LLM dispatch boundary；
6. 每个 tool result/denied/aborted/recovery outcome 引用唯一既有 call；
7. `tool/dispatch-started` 位于 call 和 terminal result 之间；
8. concurrency-safe tool body 可以并行，但模型可见 result 按原 tool-call 顺序提交；
9. Surface append/replace 只引用已经接纳的 event，replace span 连续且 provenance 完整；
10. approval decision 引用既有 request 和 call；
11. repair transaction 未 commit 时不进入有效视图，已 commit repair 幂等；
12. completed Session 没有 open Turn、Step、LLM call 或 tool call；
13. request snapshot 足以重建 Agent-facing logical request；
14. read-write writer 始终持有有效 exclusive lease；
15. Session 中不存在已知 secret 字段或未脱敏 credential material；
16. main Inbox 的每个 message id 只有一次 enqueue，且最多进入 claimed 或 discarded 其中一个终态；claim 顺序遵守 target 和 enqueue seq，claimed Surface provenance 指回原 enqueue。

## 21. Golden acceptance cases

首个实现至少建立以下 golden fixtures 和跨 Host 测试：

1. 新建 Session，写入 user -> request snapshot -> assistant -> Turn end，重新加载后 Surface 完全一致；
2. 多 Step、多 tool call、并行安全 body 和有序 result 的完整关系；
3. request snapshot checkpoint 失败时没有 LLM wire request，PreparedCall lease 恰好释放一次；
4. tool call 已 durable 但没有 dispatch boundary 时恢复为 `not-started`；
5. tool dispatch boundary 已 durable 但没有 result 时恢复为 `outcome-unknown`，且不自动重试；
6. compaction 只追加 replacement，重载后 Surface 改变而原始 Journal 字节仍可审计；
7. unknown required、unknown ignorable、known-invalid 和 higher eventVersion 分别得到正确访问状态；
8. codec 在行为插件 activation 前可发现，重复 owner 和断裂 upgrade chain 使启动失败；
9. Desktop 与 CLI 竞争同一 writer lease 时只有一方可写，失败方不产生事件；
10. writer lease 丢失、write-behind 失败和 shutdown flush 失败均 fail closed 并输出诊断；
11. torn final line、未 commit repair batch 和重复 repair 使用稳定、幂等的恢复视图；
12. cold persisted Session 在平衡边界 fork，新 Session lineage 正确且不携带进程对象或 secret；
13. manifest digest 不同但 codec/行为兼容时允许 resume，并记录 provenance 诊断；
14. canonical export 是可逐行解析的 raw UTF-8 JSONL，不存在 compressed frame、SQLite 或 packed row；
15. Header、request snapshot、Provider error、tool output 和 diagnostics 经过 secret fixture 扫描；
16. v1 Session 和 `context-state.json` 被明确拒绝，不被静默解释或升级。
17. crash / resume 能从 Journal 重建 pending Inbox；claimed 不重复领取，discarded 不进入 Surface，`next-step` 与 `next-turn` 在正确边界消费。

## 22. 留给 execution plan 的实现细节

下列内容尚未固定为公共格式，但 execution plan 必须选择方案并用上述 acceptance cases 验证：

- macOS/Linux 的 writer lease primitive、stale detection timeout 和进程身份确认；
- write-behind 的最大窗口、batch 大小和 backpressure 参数；
- 文件描述符打开模式、`fsync`/`fdatasync`、目录同步和 atomic publish 序列；
- torn-tail forensic artifact 与 repair publish 的具体文件命名；
- TypeScript interface、Zod/JSON Schema 文件布局和生成方式；
- 可重建索引/projection cache 的格式、位置和淘汰策略；
- compaction token policy 和 summary Provider 选择；
- attachment/artifact store 的独立 API；
- 格式限制的具体字节数、递归深度和诊断码。

这些细节可以因平台调整，但不得改变 raw JSONL、append-only、唯一 Journal、required/ignorable、browse-only access state、durability checkpoint、fail-closed、repair/fork/compaction 和无 v1 迁移的已确认契约。

## 23. 相关设计

- [v2 总体架构](./agent-target-overall-architecture.md)
- [v2 已确认决策](./agent-decisions-v2-foundation.md)
- [Agent Core 目标边界](./agent-target-agent-core.md)
- [Session 与 Context 目标设计](./agent-target-session-and-context.md)
- [LLM Adapter 目标设计](./agent-target-llm-adapter.md)
- [Runtime 与 Composition 目标设计](./agent-target-runtime-architecture.md)
