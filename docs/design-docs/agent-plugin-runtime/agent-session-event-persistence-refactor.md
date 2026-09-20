# Session 事件持久化重构设计

> 状态：核心行为已实施并通过自动验证。2026-09-20。
> 本文是 Session 接纳、持久化和检查点语义的真源；物理 `session-core` 包拆分仍由 P1-A 跟踪。
> [执行计划与验收记录](../../exec-plans/completed/20260920-session-event-persistence/README.md)

## 决策与依据

采用 DeepSeek Harness 的分层：生产者直接 append 运行事实；Session 接纳后发布事件；持久化插件订阅事件并负责落盘。撤回“所有事实都只能由 Agent Loop emit”的方向。

参考代码：`tmp/deepseek-harness/packages/core/session/src/index.ts` 的 append/flush、`packages/session/session-persistence/src/coordinator.ts` 的 installWritePath、`packages/session/session-checkpoint-policy/src/index.ts` 的 apply（后两个路径也相对于 tmp/deepseek-harness）。这些是源码参考，不是运行验收证据。

当前 ActSpace 的 `packages/core/agent-loop/src/loop.ts` 有 22 处 append，涉及以下 14 种记录： turn/start、user/message、step/start、request/header、request/context、assistant/chunk、assistant/message、llm/retry、llm/retry-started、step/end、turn/end、tool/call、tool-workflow/run-start、tool/result。这些生产者记录不等于 Journal 的“13 个核心 codec”分类。

## 职责与依赖

```text
Loop / Inbox / Todo / 审批 / Subagent
  -> Session Core.append
  -> Journal 校验、seq、不可变事实
  -> SessionStore 持久化接纳端口 -> coordinator 入队 -> JSONL backend
  -> session/event -> 投影、revision、英语学习观察
执行边界 -> checkpoint policy -> Session.flush -> session/flush -> 持久化屏障
```

- `session-journal`：纯事件、关系、Surface、重放；不依赖 Cordis 或文件系统。
- `SessionHandle`：只负责 Journal 接纳、live 状态和接纳/flush 回调；不再持有 write-behind。
- `SessionStore`：为持久 Session 建立唯一 coordinator，将必需持久化接纳与可选 observer 分开。
- `session-persistence`：中立契约、持久化协调器、队列、写入进度与错误；不导入 JSONL。入队字节计数由 backend 提供编码长度能力，不在通用队列 import encodeRows。
- `session-jsonl`：具体 backend、文件布局、writer、lease、编码和物理恢复。
- 新 `session-checkpoint-policy`：必需的执行边界处理器，通过 `session.runtime.getOpen()` 定位 live Session 并执行 `flush(throughSeq)`。
- `session-projection`：从只读事实构造投影；现有 projection-cache 不强行接线。

本次保持现有包兼容面：`SessionHandle/SessionStore` 暂留 `@actspace/session-persistence`，coordinator 已从 handle 中分离。把 live classes 物理迁入 `@actspace/session-core` 仍是 P1-A 的独立依赖迁移，不作为本次事件语义是否成立的前提。

`session.store` 是 live 对象唯一所有者。`session.runtime` 是 Host 门面，只委托 store；不维护第二份 live Session 注册表。文件路径和 artifact 操作保留在 Provider/Host 能力中，不由 Core 暴露。

## 写入与事件契约

- append 成功：事实校验、分配 seq、进入内存 Journal，并交给必需持久化消费者；不承诺落盘。保留 Promise 返回，以串行化接纳和错误传播；热路径不读锁文件。
- appendMany：先验证整批，再整批接纳和入队；验证失败零接纳。接纳后入队失败不回滚事实，标记 blocked。
- acceptedSeq 是最后接纳序号，durableSeq 是持久化连续前缀末序号，空日志为 -1。临时模式 durability.kind=memory，durableSeq=null，不能伪装为磁盘持久化。
- flush(throughSeq) 固定目标序号，等待该连续前缀持久化；未知目标报错。内部允许批次写过目标。不得在等待同一个 mutation 锁时回调 append，避免死锁。
- 持久模式恰好一个权威消费者；缺失或重复绑定在发布 Session 前失败。临时模式显式选择，不通过插件缺失推断。

| 事件 | 语义 | 处理 |
|---|---|---|
| session/created | 新建或恢复实例进入 live 管理 | Runtime 加入 live map 后发布；观察者错误被隔离 |
| session/event | Journal 已接纳且 coordinator 已接收入队 | 可选观察者获得事件；失败只进入诊断，不阻断持久化 |
| session/flush | coordinator 已完成目标 prefix 的屏障通知 | 观察者错误被隔离；真正的 durability failure 由 `flush` 本身传播 |
| session/disposed | close 尝试结束后的释放通知 | 携带成功/失败结果，观察者错误不覆盖 close 结果 |

事件使用已存在 Cordis 分发机制和 Session scope，不新增第二套总线。持久化接纳是 `SessionStore` 建立的必需端口；Cordis `session/event` 是接纳后的观察通知。这个顺序避免把 observer 容错误用到 durability，同时保持现有 envelope payload 兼容。

Journal 接纳前失败不发布。接纳后必需入队失败保留事实、报告原始 cause、阻止后续 append 和副作用，不自动重放业务。后台 I/O/lease 失败同样 blocked。可选 observer 错误分别诊断，不影响其他 observer，也不回滚事实。诊断不得递归写入失败的 Session。

## 生命周期与恢复

创建/打开：准备 backend 与 lease、验证 seed -> 建立唯一实例绑定 -> 发布 created 并等待就绪 -> ACTIVE。失败释放已取得资源，不发布可运行 handle。Core 不获取或读取 lease，backend 在物理写入、flush 和自身 heartbeat 边界校验所有权。

历史 seed 通过初始化交接，不逐条重发 session/event。恢复、fork 必须带精确连续前缀与持久游标，新增 suffix 仅写一次。物理修复由 JSONL 执行，逻辑 closers 由 Journal 规则生成。

关闭：阻止新工作 -> 允许受控收尾及 end-seed -> drain/flush -> 释放 backend/lease -> disposed。close 可重复调用，等待同一关闭结果。flush 失败仍尝试释放资源，但关闭结果保持失败，不能报告保存成功。Profile 仍采用重启式装配，不支持运行中切换 backend。

## 检查点和 Loop

保留 Loop 对运行事实的直接 append，保留 Inbox/Todo 等独立生产者；不重复记录通知。记录格式、顺序、seq 与工具执行语义保持。

- `llm/stream` 仅表示模型请求干预；新增 `llm/chunk` 表示可选增量通知，assistant/chunk 仍是持久事实。
- 真正 LLM dispatch 前检查最终 request/header 和 request/context 已保存；每次重试均经过同一边界。
- 工具最终 body 前检查 tool/call 和 tool-workflow/run-start 已保存；审批拒绝不执行 body；直接、批量、子 Agent 路径不能旁路。
- agent/pre-step 保存前一步事实；Turn 完成/失败/取消后的 settlement 检查点保存 closers 后再发布持久完成。
- shutdown 经 Core.close 排空。

实现使用具名且 awaited 的 `session/checkpoint` 必需处理入口，payload 包含 sessionId、throughSeq、reason（before-llm-dispatch/before-tool-body/before-next-step/after-turn-settled）。缺少处理器或处理器失败会阻止 LLM/tool 副作用。`llm/chunk` 只做增量通知，`llm/stream` 继续表示请求干预。

保留 agent/request、agent/request-error、工具前后处理等可选干预；默认重试策略仍留在现有运行逻辑。agent/status、agent/error、tools/result 等允许零观察者。通知 failures 有诊断，不增加空处理器。

## 消费者与兼容

session/event 从落盘后改为接纳后，是 ABI 行为变化：live revision 消费者必须读取 live 内存投影，不能立即依赖文件；冷 Session 读取 backend。英语学习消费已接纳消息，恢复 seed 不触发历史朗读。低延迟 onLiveEvent 回调保留，不作为持久完成证据。acceptedSeq/durableSeq 保留于运行时 contract，不改 JSONL envelope。

本轮保持当前 JSONL 文件格式、codec、历史读取、fork、torn-tail 和工具 outcome-unknown 规则，不迁移用户数据、不双写、不更换数据库、不修改具体工具 executor、不优化 Journal 的全量 fold、不建立新 UI 设置。

## 验收与风险

验证正常、重试、取消、失败、fork/resume、并行 Session、入队失败、fsync 失败、lease 丢失、缺失/重复消费者、观察者抛错、关闭并发、工具无旁路。持久化失败后 LLM/tool 调用次数不得继续增长。回放/Surface 与原有 golden 一致。

主要风险是通知提前引起磁盘读取过早，以及将观察者容错误用于必需处理器；两者必须有负向测试。自动化不代替真实 Provider、Electron reload/quit 和 UI 验收。

当前 JSONL 格式和用户数据未迁移。自动验证覆盖接纳先于写入、durable prefix、observer 隔离、必需处理器、Loop 检查点顺序和 Runtime 组装；真实 Provider、Electron reload/quit 和故障提示仍是人工验收边界。
