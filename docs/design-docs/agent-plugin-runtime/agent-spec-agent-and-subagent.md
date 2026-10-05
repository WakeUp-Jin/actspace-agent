# ActSpace v2 Agent 与一次性 Subagent 设计规范

> 状态：v2 产品与行为契约基线；应用操作通过 Profile App Service，启动生命周期见 [Runtime 与 Composition](agent-target-runtime-architecture.md)。精确事件名以 [DSH 事件模型](agent-spec-dsh-event-model.md)为准；下文 enqueue/claim 等描述表达行为，不新增同名 wire event。
>
> 本文固定 v2 的 Agent 产品形态、Preset、子 Agent 生命周期、Session lineage、工具限制、取消和结果提交语义。字段名、TypeScript API、事件名称与预算数值可以在 execution plan 中细化，但不得改变本文已经确认的产品范围。
>
> 确认日期：2026-08-22。

## 1. 产品范围

ActSpace v2 采用一个主 Agent 和统一的一次性 Subagent seam：

- **main Agent** 拥有用户的多轮 Session，接收 Desktop / CLI Host 发起的 turn，并保留最终决策权；
- 现有 **Agent** 与 **Explore** 能力都重写为同一 Subagent seam 上的内置委派入口；
- 每次委派创建独立 child Session、独立 Agent scope，并执行一次有明确终点的任务；
- **static Preset** 决定子 Agent 的 Prompt、模型路由、工具边界和预算；
- 子 Agent 只向父 Agent 返回一个可持久化的终态结果，不把自己的可变 conversation 合并进父 Session；
- Todo 状态使用 durable event 表达，由 Session 投影给模型和固定前端。

这里的“一次性”指一次委派从创建运行到一个 terminal result 后结束。它不是可在以后继续发消息、恢复控制权或长期驻留的 Agent identity。

## 2. 五个核心概念

| 概念 | 语义 |
|---|---|
| main Agent | 用户 Session 的顶层执行者；一个 Session 同时最多一个 active turn |
| Subagent invocation | 父 Agent 发起的一次有界委派，也是父 Session 中可审计的调用事实 |
| child Session | 子任务自己的 append-only Journal、Surface、lineage 和恢复证据 |
| Agent scope | 子 Agent 的身份、贡献可见性和资源所有权，不是安全沙箱 |
| static Preset | Boot 时解析并验证、Runtime ready 后不可变的 Agent 配方 |

“Agent”与“Explore”在本文中指两个内置委派 Preset / 入口，不再指各自拥有一套 ContextManager、ToolManager、Loop 和 SessionEvent bridge 的旧 executor。

## 3. main Agent

main Agent 必须遵守 ActSpace Agent Core 的共同不变量：

- 从 root Session Surface 和 scoped contributors 组装每次不可变 logical request；
- Adapter dispatch 前写入 request snapshot 并通过 durability checkpoint；
- Tool call、result、Turn 和 Step 关系都进入同一 root Session Journal；
- 一个 Session 只有一个 active turn，Desktop Host 通过 App Service run / abort，headless 通过 runner 和取消端口接入；
- Subagent 结果作为一种受 Tool Runtime 顺序约束的委派结果回到 main Agent；
- main Agent 保留如何使用子结果、是否继续调用工具以及何时结束 Turn 的决定权。

子 Agent 不是控制权永久转移。父 Agent 不把自己的 Agent identity、writer、credential object 或可变 conversation 交给子 Agent。

## 4. Agent 与 Explore 的重写

现有两项能力保留角色价值，替换执行实现：

| 内置入口 | 保留 | 新实现边界 |
|---|---|---|
| Agent | 通用子任务 prompt、结果摘要和已验证行为测试 | 使用统一 Subagent seam 和通用任务 Preset；工具由显式策略裁剪 |
| Explore | 面向代码库或信息探索的 prompt、摘要和只读行为测试 | 使用同一 seam 和 Explore Preset；不得获得写入或其他副作用工具 |

两者不得直接创建旧 ContextManager、旧 ToolManager、旧 loop 或旧 SessionEvent。它们只提交委派请求；Agent Registry、Session、Scope、Tool Runtime 和 Agent Loop 负责真正执行。

Explore 的“只读”是 Runtime policy，不是 prompt 建议。即使某个写工具在父 scope 可见，也不能进入 Explore child 的 prepared tool set。

## 5. Static Preset

Preset 是 JSON-safe、声明式的 Agent 配方。它至少表达以下语义字段组：

| 字段组 | 语义 |
|---|---|
| Identity | 稳定 preset id、版本和角色说明 |
| Prompt | 要启用的 system / context contributor identity 和确定性顺序 |
| Model | LLM route、模型选择和允许的 fallback 边界 |
| Tools | allow / deny、只读要求、并发与副作用 policy |
| Budget | token、Step、时间、工具调用和 delegation depth 上限 |
| Result | 终态结果必须产生的摘要、artifact 和 provenance 类别 |

Preset 可以由受信任的后端插件作为 Effect-owned contribution 注册，但 v2 具有以下固定约束：

- Preset 在 Boot / Startup Validation 阶段完成解析、依赖检查和冲突检查；
- Profile ready 后，当前 Runtime 中的 Preset descriptor 不再变化；
- 每个 Agent 创建时捕获 preset identity、版本和解析后的策略，并写入 Session provenance；
- Preset 只引用稳定 contribution / capability identity，不携带运行期 secret 或任意可执行回调；
- Preset 变化必须重启 Runtime，不能 live reload。

Preset 的 Tool policy 只能继续收窄 Tool definition 和 Host policy 已声明的安全属性：它可以从 allow 变为 deny、从并发变为 exclusive、从可写变为只读集合，但不能把有副作用工具重分类为只读、把 unknown / exclusive 工具改成 concurrency-safe，或关闭不可绕过的 approval 与 durability guard。

当前 static Preset registry 由 Host 持有，不使用 StandingMount；descriptor 变化仍走 Host 重启。Harness 是另一条生命周期边界：每次子 Run 独立取得当前组合租约，旧 Run 使用原组合直到释放，不在执行中替换 Loop。

## 6. 一次委派的完整流程

```text
main Agent tool call
  -> parent Journal 接纳 delegation request 并 checkpoint
  -> 解析 static Preset 与有效工具上限
  -> 创建 child Session header / lineage
  -> 在 unpublished child scope 中完成 Agent setup
  -> 按固定 publication point 发布 child identity 与 Session
  -> child Agent 执行一次任务到 terminal state
  -> child Journal 提交 terminal result 并 flush
  -> parent Journal 幂等提交一个 linked delegation result
  -> dispose child scope 和其全部 Effect-owned 资源
  -> main Agent 继续当前 Turn
```

任何步骤失败都必须留下可解释的父调用结果，不能产生“父 Session 认为已委派、Registry 却没有 child”或“child 已完成、父 Session 永远悬空”的静默状态。

setup 必须先在 unpublished scope 中完成。只有 child Session writer、Preset、Prompt、Tools、LLM route 和取消链全部就绪后，才到达 publication point：先同步、按固定顺序发布 Session 和 Agent identity，再通知观察者。若 publication 途中失败，必须逆序撤销已发布项；如果成功通知已经送达，还必须发出配对 disposal。这里是有序发布与补偿回滚，不承诺跨 Registry、Journal 和观察者的数据库原子事务。

## 7. Child Session 与 Lineage

每次通过创建 admission 的 Subagent invocation 都有独立 child Session。若 Preset、权限或 required capability 在 admission 阶段被拒绝，父 Session 记录失败结果，但不制造空的 child Session。persistent Profile 将已接纳的 child 写入独立持久 Journal；ephemeral Profile 仍使用同样的逻辑 Session / Event 语义，只是不承诺 crash durability。

child Session header 和创建事实至少表达这些 lineage 语义：

- parent session identity；
- 触发委派的 parent event / tool call identity；
- seed boundary，即子任务基于父 Journal 的哪个已提交前缀；
- origin 与选中的 preset identity / version；
- delegation depth；
- 创建时的 Runtime / codec provenance。

子 Agent 不继承父 Agent 的完整 conversation。它只接收经过确定性组装并写入 child Journal 的任务 brief、必要约束、允许的上下文引用和自己的 Prompt / Tool schema。父进程中的隐式对象或未持久化状态不能影响 child 的模型输入。

child Session 独立拥有：

- user seed、assistant、tool call / result 和 request snapshots；
- approval、abort、failure 和 terminal facts；
- child 自己的 Todo durable state；
- usage、artifact reference 和可审计结果 provenance。

父 Session 只保存委派请求、状态和最终 linked result，不复制 child transcript。固定前端和诊断可以通过 lineage 查看 child Session，但这不等于把它并入父模型上下文。

## 8. Agent Scope

本节保留 Agent/Subagent 的产品边界；Scope 的完整身份、父子链、注册可见性、事件准入、carrier 和资源所有权契约以独立的 [Agent Scope 模型设计规范](./agent-spec-agent-scope-model.md) 为准。

child Agent 使用 ActSpace 自有的 Scope 语义子集：

- 每个 scope 有由 Runtime 签发的不透明稳定 identity 和可选 parent；该 identity 用于关联与 Registry 可见性，不是抵御同进程恶意代码的安全防伪边界；
- scope-aware Registry 支持祖先可见性和本地 shadow，但注册冲突仍遵循领域规则；
- 生产 child 从自己取得的 Harness lease 派生 Scope，不继承父 Run 的策略 Scope；父权限上限、workspace 和取消通过显式输入传入。无 Harness lease 的库级调用才默认继承 parent Scope，也可显式选择 flat child；
- child 创建的 Tool lease、listener、timer、subprocess 和其他资源都由 child activation Effect 拥有；
- child terminal 后等待资源静止，再完成 scope dispose。

Scope parent chain 只定义 Scope-aware contribution 的可见性和生命周期归属，不代表权限继承。Session lineage 记录父子委派关系；生产子 Run 的 Scope 则属于所选 Harness，两者不是同一棵树。

## 9. 工具限制

child 的有效工具集是以下边界的交集：

1. Host capability ceiling；
2. 当前 Profile 中 active 的 Tool contributions；
3. 父 Agent 本次委派允许继续下放的能力；
4. static Preset 的 allow / deny 和只读策略；
5. child invocation 的进一步收窄项。

任何一层都只能减少能力，deny 始终优先。child invocation 不能通过请求参数扩大 Preset 或 Host 权限；父 Agent 自己可用的工具不能直接作为 child 的权限证明，最终有效集合仍需按 child policy 重新计算。

限制必须在 Tool discovery、request snapshot 和 prepared execution 三处保持一致。仅从 system prompt 隐藏工具、执行时仍可按名称调用，不符合本规范。

v2 内置 Explore Preset 只允许只读能力。v2 child Preset 不授予再次委派能力；如果未来开放嵌套委派，也必须另立设计、复用同一 seam、记录 delegation depth，并由显式最大深度 fail-closed，不能演化出旁路 Agent factory。

## 10. Cascade Cancel 与资源回收

取消关系固定为父到子的单向级联：

- parent turn abort、parent Session 关闭或 Runtime shutdown 必须取消所有未终止 child；
- child cancellation 使用父 signal 的派生 signal，但 child 自己失败或取消不自动终止父 Agent；
- pending approval、尚未 dispatch 的 LLM / Tool preparation 和可协作取消的 in-flight work 都进入同一取消链；
- child 必须先写入 aborted / interrupted 等终止事实，再按持久化策略 flush 和 dispose；
- parent 收到结构化 aborted result 后决定继续还是结束 Turn；
- 已提交的 terminal result 不因父 Agent 随后的取消而被改写或删除。

不允许 orphan child 在父 Agent、Session writer 或 Runtime 已 dispose 后继续运行。强制 shutdown 无法完成 drain 时，diagnostics 必须列出未终止 child 和可能的 outcome-unknown 外部副作用。

## 11. Terminal Result

每次 Subagent invocation 对父 Agent 只产生一个终态结果。语义 schema 至少包含：

- 调用的稳定引用，以及 child identity 已分配时对应的 child Agent / child Session 引用；
- completed、failed、denied、aborted 或 outcome-unknown 等终态类别；
- 给父模型使用的有界 final text / summary；
- usage、duration 和工具使用摘要；
- 可安全共享的 artifact references；
- 脱敏后的错误类别、重试提示和结果 provenance。

child 的中间 stream、完整 transcript、credential 和未裁剪工具输出不直接成为父 Agent 的 tool result。需要深入查看时，Host 或后续工具通过 child Session 引用按权限读取。

提交顺序必须满足：

1. child terminal fact 先进入 child Journal 并完成要求的 checkpoint；
2. parent 再按原始模型 tool-call 顺序接纳 linked result；
3. parent result 以 delegation identity 幂等，恢复时不得重复追加两个逻辑结果；
4. 如果进程在两次提交之间崩溃，恢复逻辑以 child terminal fact 和 parent link 共同判断，补齐缺失结果或标记 outcome-unknown，不自动重跑有副作用的 child。

## 12. Todo Durable Event

Todo 保留用户价值，但必须按新 Session 模型重写：

- Todo 创建、更新、完成、取消和必要的排序变化都写成经过 Event Codec 验证的 durable events；
- 当前 Todo state 是 Journal projection，不存放在 `ToolUiPreview`、bridge 私有缓存或独立可变 sidecar；
- 模型上下文和固定前端分别从同一 durable facts 投影，不互相反向生成状态；
- child Todo 归 child Session，不能在没有显式父事件的情况下修改 parent Todo；
- 未知 required Todo event 按 Session 兼容规则阻止 resume 和新写入，原始日志仍可 browse / export。

Todo 可以继续通过工具形态供模型操作，但工具 result 不是状态唯一来源；durable event 才是恢复依据。

## 13. 失败与恢复语义

| 场景 | 必须行为 |
|---|---|
| Preset 或 required Tool / LLM 缺失 | child 创建前失败，父 Session 收到结构化失败结果 |
| unpublished setup 失败 | 回滚 child writer、scope 和注册，不发布半配置 Agent |
| child 执行失败 | child 写 terminal failure，父 Agent 收到一个 linked failed result |
| parent 取消 | 级联取消 child，等待有界 flush / dispose，返回 aborted 事实 |
| child 已完成但 parent result 未提交即崩溃 | 恢复时幂等补齐 link，不重新执行 child |
| child 尚未完成时进程崩溃 | repair child 的 open Turn / Step / Tool，父调用提交 aborted 或 outcome-unknown；不通过 public continuation 恢复旧 child activation |
| 外部副作用结果无法确认 | 标记 outcome-unknown，禁止把它伪装成未开始后自动重试 |
| Runtime shutdown | 停止新委派，取消并 drain active child，flush 后再 dispose root Context |

一次性 child Session 可以被检查、导出和用于审计，但不能通过 public continuation API 恢复为可继续对话的同一个 Subagent。

## 14. Startup Validation 与诊断

Base Profile 的 Startup Validation 至少确认：

- main Agent、Agent 与 Explore 的 static Preset identity 唯一；
- Preset 引用的 Prompt、Tool policy、LLM route、Event Codec 和 Agent Loop 均 active；
- Explore 的只读约束没有被后续层扩大；
- child Session lineage 和 delegation result codec 可在行为执行前解码；
- Host ceiling 能满足每个 required Preset 的能力要求。

Runtime diagnostics 至少展示 preset identity / version、child / parent lineage、当前 terminal state、被裁剪的工具能力、取消来源、pending child disposer 和恢复异常。diagnostics 不进入模型上下文，也不替代 Session facts。

## 15. 用户任务与后台通知

用户首发、排队和指定“当前 Run 读取”统一经过 `AgentService.submit` 与 TaskLedger。队列只保存内容；当前配置在交付 Run/下一请求的约定边界读取。接纳返回 durable receipt，不把接纳等同于执行完成。

同一条 pending Task 可以调整顺序、指定交付、撤回或删除；不再维护 next-step/next-turn 两套用户队列。停止当前 Run 会暂停队列，显式继续后再调度；重启恢复不重复领取已结算内容。详细字段、幂等性和模式限制见[Task/Run 规范](agent-task-run-lifecycle.md)。

Agent Inbox 仍用于后台 `task_notification` 等领域输入，因此对应 codec/replay 不能删除。它不再拥有主用户任务队列。one-shot child 不提供公开续聊入口；重新执行需新 invocation/child Session，并在启动时取得当前 Harness 租约。

## 16. 明确不做

v2 明确不包含：

- 通用 Workflow / DAG / 条件节点 / 重试编排引擎；
- 可继续发送消息、resume、reopen 或 handoff 控制权的 continuable Subagent；
- 长期驻留、无人持有或跨 main turn 自主运行的 background Agent；
- Preset StandingMount、旧 Preset generation 保留和资源回收协议；
- 已运行 Run 中更换 Loop 或 Harness；后续 Run 可采用新 Harness。
- 旧 Agent / Explore executor、ContextManager、ToolManager 和 bridge 的兼容壳；
- Kairos 作为 Agent 形态或候选插件。

main Agent 自身仍是正常的多轮 Session，并通过 TaskLedger 接受用户输入；“不可 continuation”只约束一次性 Subagent。

## 17. 实现前字段级评审清单

以下内容需要在 Agent / Subagent implementation plan 前形成 JSON Schema、golden Session fixtures 和失败用例；它们不是重新选择产品形态：

- Preset descriptor、delegation request、child Session lineage 和 terminal result 的精确字段名；
- main / child Agent、invocation、Preset 和 parent link 的 id 规则；
- Agent / Explore 的 Prompt、模型 route 和精确工具 allowlist；
- token、Step、时间、工具调用、并发 child 和 delegation depth 的默认预算；
- child seed context、artifact 引用和父 Session 摘要的大小与脱敏规则；
- cancellation、timeout、denied、failure 和 outcome-unknown 的稳定错误码；
- child completion 与 parent link 的幂等键、repair transaction 和 writer lease 细节；
- Todo event payload、projection schema 和 fixed renderer 的 generic 展示 DTO；
- child Session browse / export 的 Host 权限和 retention policy；
- Task、Run 与后台通知的字段以各自类型及 codec 为准，不能重新引入旧 public Inbox API。
