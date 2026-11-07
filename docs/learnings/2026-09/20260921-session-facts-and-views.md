# Session 事实与视图：共享事实，不共享视图

合并自六篇同主题学习记录（token usage 基础、Append-only Journal、Session 投影切换、事件折叠、usage 的 turn 视图、Todo 状态投影）。它们讲的是同一件事：**事实只有一份，视图可以有很多份，且视图必须能被丢弃并重建**。

## 1. 先分两类：事实与视图

- 事实回答“发生过什么”：`user_message`、`assistant_message`、`llm_usage`（`packages/util/shared/src/session.ts`）等，append-only。
- 视图回答“现在界面该展示什么”：Context 面板、聊天折叠行、轨迹、工具卡片、累计 usage。视图可以覆盖更新，也可以直接删掉重建。
- 只有事实流：历史完整，但每次读当前状态都要 replay，可编辑状态和不可变历史混在一起。只有当前状态：界面好做，但 token 统计、成本追溯、崩溃恢复都失去依据。
- 当前 Context entries 不放进 `session.jsonl`，因为用户以后会增删改它；它属于可覆盖的视图文件（`context-state.json`，见 `packages/session/session-persistence`）。`context_snapshot` 只是历史水位读数，不是当前 Context 的完整清单，不能当 source of truth。

## 2. Journal 只接受“已经成立的事实”

Agent Session 容易被做成不断覆盖的 `messages.json`，它无法回答：工具是否已开始产生副作用、重试用了哪份请求、崩溃前提交到哪里、压缩后原始事实还在不在。更稳的三层：

```text
Journal events -> Surface / domain projection -> Desktop / CLI DTO
      |                      |
 journal.jsonl        可删除并重建的 cache
```

- Journal 是只追加的领域事件：连续 `seq`、类型、版本、时间、来源、data；写入前过 codec 与关系校验，接受后不原位改写。这是“应用语义上的 immutable accepted facts”，不是密码学防篡改。
- 工具副作用前必须先过 durability checkpoint，否则崩溃后分不清“body 尚未开始”与“结果未知”——对文件、网络、Browser 动作，这决定能否安全重试。
- Surface 是模型可见历史，不是第二份真相：Compaction 用 replacement 事件让新摘要遮蔽旧节点，原始事件仍在；replacement 必须携带被遮蔽事件的 provenance；projection cache 丢失不会损坏 Session。
- 物理格式不绑死领域协议：逻辑事件版本、Session 格式版本、存储 backend 版本要分开。把 zstd frame / SQLite row 当领域事件，存储迁移就会污染 Agent Core。
- 动态插件事件若影响恢复或 Prompt，加载 Session 前必须先从当前 composition 建 codec registry：required codec 缺失 → 保留原文件并降为只读/browse-only；ignorable 只适用于不影响恢复与模型历史的信息事件；inspect 不偷偷迁移，continue/new write 才显式 migration；Header 记录 plugin set 与 codec digest 以解释为何不能 resume。

## 3. 同一事实，多个视图，各自转换

- `tool/result` 在聊天里折叠成一行，在轨迹里按 seq 展示请求与结果，在工具卡片里显示文件 diff。三者各自转换同一事件。
- 但 title、todo、累计 usage 这类状态应由 Host 计算，因为需要跨分页、跨重连、跨客户端一致。判断标准：只拿当前窗口算得对吗？加载较早消息会改变累计 usage，说明把全会话事实错放进了窗口投影；切换 Chat/Trajectory 要重新请求 title，说明领域状态被展示组件占有。
- checkpoint 不是第二个事实源：它保存 reducer 内部状态和所消费的 Journal 水位，恢复后继续折叠尾部，结果应等于完整 replay。只存展示 value 不够（usage 去重还需已计入的 requestId）；definition 语义改变必须使旧 checkpoint 失效。
- 两个容易混的水位：全会话 facts 可能到 seq 900，刚取的历史页只覆盖 100–199。历史页可补事件窗口，但不能把最新 title、usage、工具终态回退成旧值。accepted 与 durable 也要分开：进入内存 Journal 不等于完成持久化 barrier。

## 4. usage：事实粒度要细，视图粒度可以粗

- usage 的事实单位是**一次 LLM call**，不是一次 turn。一个 turn 里模型请求工具、拿到结果再回复，是多条 `llm_usage`；压缩与子 Agent 还会增加调用。turn、session、day 统计都从 `llm_usage` 聚合，不作为原始事实写入。
- 用户可读的 Usage 表一行一个 turn：运行时按 `sessionId + turnId` 分组（它是视图 key，不替代 `callId`），累加 token、`modelCallCount`，时间取组内最新 `llm_usage.timestamp`（不要拿 turn 第一条事件排“最新在前”）。
- 成本可写进 usage（当时配置下的计算结果），价格配置集中维护；不要把价格快照塞进每条 usage，除非做账单级审计。
- 不要只存聚合 token：会丢失多模型、多 call、缓存命中的分析能力。不要把 `cacheMissTokens` 改名成 Cache Write——miss 是未缓存输入，write 是 provider 特有指标，需要自己的事实字段。

## 5. 折叠与视图生成要分开

- 一个流式回答可有数千个 chunk，历史恢复只需最终可展示状态。若每个 chunk 后都重估上下文 token、生成预览、深拷贝视图，成本是“事件数 × 历史大小”；减少 DOM 节点修不了主进程里的这类开销。
- 恢复先依次运行 reducer，最后再生成一次视图；checkpoint 尾部带上 pending 事务（压缩开始到结束整体可见）；先验证连续序号，全部 reducer 成功后再提交，避免部分恢复污染已提交状态。
- 不要直接删 chunk：首 token 时间、usage、未完成回答、中断恢复可能依赖它；优化的是无用的派生计算。语义输入引用稳定时可复用昂贵计算，但水位、活动回合、时间语义逐项保留；冷重放与逐事件输入结果等价，是比“变快了”更重要的回归测试。
- 监控也有观察成本：默认关闭、低频、局部状态、清理生命周期；开启组 CPU 更低只说明测量噪声，不证明监控无开销。

## 6. 状态型工具（Todo）：事件需要显式状态投影

Todo、进度条、当前配置表达“现在是什么”，不是“发生过几次操作”。renderer 逐条展示事件会让每次更新多一张列表；恢复器“找最近相关事件”可能把筛选后的读取或失败写入误当权威。

```text
todo_write success rev 1  -> authoritative snapshot 1
todo_read filtered        -> observation only
todo_write failed         -> old snapshot remains authoritative
todo_write success rev 2  -> authoritative snapshot 2
```

- 规则是“找最近**满足权威条件**的事件”：同一 `sessionId + agentRunId`、工具为 `todo_write`、执行成功、结构化快照通过防御校验。读取、预览、失败默认不改变权威状态。
- 实时与恢复共用一个 view model：executor 成功后生成完整 snapshot → bridge 转成统一 UI preview → renderer 按 Run 级稳定 key 替换旧投影 → session selector 从持久化结果生成同样的 preview。raw args 只用于执行和审计。
- Partial JSON：字符串路径可从不完整参数安全提取，数组状态不能（半个对象缺 ID/状态会造成闪烁与错误完成数）。状态型工具参数未闭合时继续展示上一个稳定快照，等 executor 全量校验、原子提交后再切换。
- executor 全量校验后一次提交，失败时 revision 与旧快照都不变；持久化结构化状态，不在恢复时解析模型文案或压缩后的 output。

## 自检

1. 删除所有 projection cache，能否只靠 Header 与 Journal 重建模型可见历史？
2. 工具 body 崩溃时，日志能否区分 not-started 与 outcome-unknown？
3. 翻历史页会改变累计 token 吗？切换视图会丢消息身份吗？（应为：否、否）
4. required 插件 codec 缺失时是 fail-closed，还是静默丢掉影响恢复的状态？
5. 用户以后手动删一个 context entry，应覆盖 `context-state.json`，还是改写历史 `context_snapshot`？
6. 模型价格变了，历史统计该重算还是读当时落盘的 `cost`？

来源：token usage 基础（2026-05）、v2 cutover（`docs/histories/2026-08/20260823-0958-actspace-v2-cutover.md`）、Todo 工具 V1（`docs/histories/2026-08/20260809-0010-agent-todo-tools.md`）、usage 请求详情（`docs/histories/2026-06/20260604-1954-usage-request-details.md`）、[Session 投影切换执行摘要](../../exec-runs/20260921-session-projection-cutover/execution-summary.md)。
