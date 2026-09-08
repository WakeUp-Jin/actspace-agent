# ActSpace v2 Agent Scope 模型设计规范

> 状态：P0 Scope contract、fused dispatcher 与 main/child 生产接线已实现；真实 Host/Electron/Provider 与全仓库回归仍属于外部验收。
>
> 本文只定义 Agent Scope 的身份、父子关系、注册可见性、事件准入、资源所有权和 Agent subject 绑定。它不重新定义 Agent Loop 的 9 个事件、Session 的 13 个核心事件，也不重新定义工具执行本体；这些契约分别由 Agent Loop、Session 和 Tool Runtime 专题拥有。
>
> 本文是对 [Agent 与一次性 Subagent 规范](./agent-spec-agent-and-subagent.md) 中 Scope 小节的细化。实现应先通过本文的契约评审，再进入 execution plan。

## 1. 目标

ActSpace 需要一套同时服务于以下四类行为的 Scope 原语：

1. Agent、Preset 和 Subagent 的能力注册可见性；
2. Agent 事件的精确准入和父子观察关系；
3. Prompt、Tool、listener、timer、subprocess 等资源的生命周期所有权；
4. Agent subject 与事件 dispatch carrier 的身份一致性。

Scope 不是另一个权限系统，也不是把任意 Cordis Service 自动复制到子 Agent。它是同进程受信任插件之间的可见性、路由和清理边界。

本规范吸收 DSH 的 Scope 原语，但不把 DSH one-shot provider 的 flat registration 选择误认为唯一模型：ActSpace 的普通 child Agent 默认加入父 Scope chain；只有明确要求强注册隔离时，才创建 flat child Scope。

## 2. 核心决策

### 2.1 只有一套 Scope 身份

ActSpace 继续使用 `AgentScope` 作为领域层 facade，但底层必须拥有一个不透明、按对象 identity 比较的 `ScopeKey`。字符串 `agentId`、`presetId` 和 `descriptor.id` 只能用于诊断、持久化 lineage 和日志，不能单独充当事件路由身份。

同一个 live Agent 必须同时拥有：

- 一个唯一的公开 `agentId`，例如 `main:<sessionId>` 或随机 child id；
- 一个只属于该 Agent 实例的 `ScopeKey`；
- 一个绑定到该 `ScopeKey` 的 Agent subject；
- 一个由该 Scope 拥有的资源清理边界。

`descriptor.id` 是静态 Agent/Preset 身份，不能用作多个 live Agent 共用的 scope id。

### 2.2 父子关系同时支撑两种相反方向

Scope parent chain 只有一份，供两种消费方使用：

```text
runtime
└── preset（可选）
    └── agent
        └── child-agent
```

普通 child Agent 的默认关系是 `scopeParent(child) = parent`。child 仍然拥有自己的 `ScopeKey`，不能复用 parent key。需要阻断父级注册可见性时，调用方必须显式选择 `isolated child scope`；flat scope 不是普通 Subagent 的默认语义。

注册表沿链向下继承：子 Scope 看见祖先贡献，最近 Scope 对同名项具有 shadow 优先级。事件准入沿链向上扩展：事件发给某个 Scope 时，该 Scope、所有祖先 Scope 和无 Scope listener 可以收到；兄弟 Scope、祖先 Scope 的事件不会反向进入子 Scope。

| 方向 | 规则 |
|---|---|
| 注册/能力可见性 | parent → child；child 可读祖先，child-local 可 shadow |
| 事件监听准入 | child event → parent listeners；只向祖先扩大，不向兄弟或后代扩大 |
| 生命周期所有权 | registration → 注册它的 Scope；child dispose 不释放 parent registration |

这三个方向必须由同一份 Scope parent relation 驱动，不能分别维护三张不一致的树。

### 2.3 Scope 不等于安全边界

Scope 只约束同进程受信任插件的：

- 注册可见性；
- 事件路由；
- 资源所有权；
- Agent subject 关联。

文件、网络、credential、sandbox、Host capability 和跨进程权限仍由 Host ceiling、Tool Runtime、Approval 和 Browser Bridge 负责。把 `AgentScope` 传给一个插件，不表示该插件自动获得或失去任意 Cordis Service。

这里的“自动继承”只对明确采用 Scope-aware API 的注册表、事件 carrier 和 Effect ownership 生效。它不承诺任意 Cordis Service、进程全局变量或未声明的 Host capability 会随 parent Scope 自动复制。

### 2.4 Agent subject 和 Scope carrier 必须成对出现

所有 Agent-subject event 必须同时表达：

- payload 中的真实 Agent subject；
- dispatch 使用的 Scope carrier。

两者必须由同一个 Agent 实例创建。插件不能传入一个 Agent，再使用另一个 Agent 的字符串 scope id 进行 dispatch。运行时诊断应在开发/测试模式拒绝 subject 与 carrier 不一致的调用。

### 2.5 继承矩阵

普通 child Agent 自动绑定 parent Scope，但“继承”只适用于明确采用 Scope-aware 机制的能力：

| 能力或对象 | 普通 child 默认行为 | 说明 |
|---|---|---|
| Scope-aware listener / registry contribution | 继承可见性 | child 有本地 shadow；parent 不被 child 污染 |
| Agent event admission | 向 parent 祖先准入 | payload 仍携带 child Agent subject |
| Prompt / Tool contribution | 继承后重新求 effective view | child restriction、deny 和 Host ceiling 仍然生效 |
| Cordis Service | 不自动复制或变成独立实例 | 只有该 Service 自己声明 Scope-aware contract 才参与 |
| Session / writer / conversation | 不共享 | child 使用独立 Session 和模型输入边界 |
| credential / approval / Host capability | 不共享权限凭据 | child 必须重新解析并受 Host ceiling 约束 |
| cancel relationship | parent → child 传播 | child 不能反向取消 parent |

`isolated child Scope` 是显式的例外模式：它拥有独立 ScopeKey，但不绑定 parent Scope，因此不读取 parent-local Scope contribution；它仍然保持独立 Agent、Session、lineage 和资源所有权。

## 3. Scope 生命周期

### 3.1 创建

Scope 由创建者在一个仍然 active 的 Cordis Context 下 mint。创建结果至少包括：

- `ScopeKey`；
- `ScopeIdentity`（诊断和 lineage 数据）；
- 带 scope tag 的注册 Context；
- 可等待静止的 async disposer；
- 可选 parent Scope。

通过该 Context 注册的 listener、registry contribution、timer、subprocess lease 和其他 Effect 必须由该 Scope 拥有。ActSpace 的 `scopeContext(context, key, scope.disposer)` 会把 Cordis listener 的 remove handle 纳入 Scope disposer；未传 owner disposer 的只读 carrier 只负责路由，不宣称拥有注册生命周期。注册成功前不得发送会让外部观察者误以为已生效的通知。

### 3.2 Agent setup 与 publication

Agent 创建采用两个阶段：

```text
mint unpublished Scope
  → 注册 Prompt / Tool / policy / listener / cancel chain
  → 校验 required capability 和有效工具集合
  → publication point：发布 Session 与 Agent identity
  → 发出生命周期通知
```

setup 失败时只能清理 unpublished Scope。publication 途中失败时，已发布对象必须按逆序撤销；已经送达的创建通知必须有配对 disposal 通知。

### 3.3 dispose 与 quiescence

Scope dispose 必须是幂等且可等待静止的：

1. 先停止新注册和新事件进入；
2. 取消或拒绝新的 Agent/Tool/LLM 工作；
3. 等待已开始的 listener、stream、tool lease 和 child scope settlement；
4. 逆序撤销该 Scope 的注册和 Effect；
5. 最后释放 Scope 引用。

父 Scope dispose 必须包含其 child Scope 的清理，但 child Scope dispose 不能影响父 Scope 或兄弟 Scope。

## 4. 注册表语义

Scope-aware registry 需要同时支持 global layer、exact-scope layer 和沿 parent chain 的 effective view。

### 4.1 可见性

- global contribution 对所有 Scope 可见；
- exact-scope contribution 只在其 Scope 及后代 Scope 的 effective view 中可见；
- 同名项按 `global → 最远祖先 → 最近 Scope` 顺序合并，最近者胜出；
- parent 不会因为 child 注册了同名项而改变自己的 view；
- 只允许领域规则定义是否可 shadow，不能让通用 Scope 原语静默覆盖 required core contribution。

### 4.2 约束与限制

权限限制、只读工具集和 Host ceiling 不是普通 shadow。它们必须按领域规则组合，默认只能收窄，不能通过 child Scope 或 Preset 把父级 deny 重新放宽。

因此，parent Scope 的工具 contribution 可以被 child 看见，但 parent Agent 当前“有效工具集合”不能直接当作 child 的权限证明。child 的最终工具集仍需重新经过 Host ceiling、Profile/Preset contribution、父级 deny、child restriction、Approval 和 ToolRuntime policy 计算。

## 5. 事件准入语义

### 5.1 事件分类

| 事件主体 | dispatch carrier | 典型事件 | Scope 规则 |
|---|---|---|---|
| Agent | 目标 Agent carrier | `agent/*`、Agent Loop 9 个插入点 | 当前 Agent、祖先和 global listener 可见 |
| Session | Session carrier 或 owner Scope | `session/*` | 按 Session owner 规则过滤 |
| Registry | Registry subject | tool/provider registry events | 按事件契约，可保持 global |
| Runtime | 无 Scope 或 runtime carrier | boot、shutdown、diagnostics | 不自动进入 Agent child Scope |

不是所有事件都应该带 Agent scope。事件声明必须明确它的 subject、carrier、dispatch mode 和 failure policy。

### 5.2 四种调度模式

Scope 只负责准入，不改变事件调度模式。Agent Loop P0 事件计划负责定义各事件的 mode；Scope 设计只固定以下基础语义：

- `emit`：通知性质；每个 listener 独立捕获同步异常和 Promise rejection，不得阻断后续 listener 或主体生命周期；
- `parallel`：全部 listener 都启动并等待完成，不提供 waterfall veto；
- `serial`：按优先级和注册顺序依次执行，失败可以阻止后续链；
- `waterfall`：listener 通过 `next()` 包装下游结果；不调用 `next()` 即短路，调用后可以改写返回值。

Scope adapter 不得把真正的 `waterfall(next)` 降级为简单的 payload 顺序变换。

### 5.3 Scope admission 算法

对目标 Scope `S` dispatch 时：

1. 无标签 listener 始终可见；
2. 标签为 `S` 的 listener 可见；
3. 标签为 `S` 任一祖先的 listener 可见；
4. 标签为 `S` 的子孙、兄弟或无关分支的 listener 不可见；
5. `{ global: true }` 仅在事件契约允许时绕过过滤。

事件流向可以表示为：

```text
child-agent event
  → child-agent listener
  → parent-agent listener
  → preset listener
  → global listener
```

它不是传统的异常冒泡：listener 的注册、优先级和错误处理仍由 Cordis event system 决定。

## 6. Agent fused dispatcher

Agent 事件的公共 dispatch 入口必须是一个把 subject 和 scope carrier 融合起来的 dispatcher。它至少保证：

- 调用者只提供事件 payload 的业务字段，Agent subject 由 dispatcher 注入；
- dispatcher 在创建时捕获目标 Agent 实例和其 Scope carrier；
- `emit`、`parallel`、`serial`、`waterfall` 都复用同一个 carrier；
- payload 中若存在不同 Agent identity，调用立即失败或被安全覆盖；
- Agent dispose 后 dispatcher 不再接受新 dispatch。

dispatcher 不是第二个事件总线，也不拥有 listener registry；它只是把 Agent subject、Scope route 和 Cordis Context 绑定成一个不可错配的调用面。

## 7. Agent 与 Subagent 集成

### 7.1 main Agent

main Agent 的 scope identity 必须基于 live Agent instance，诊断 id 使用 `main:<sessionId>`。同一个 `MAIN_AGENT_DESCRIPTOR` 可以用于多个 Session，但不能让这些 Session 共享一个 Scope carrier 或 scoped listener。

### 7.2 child Agent

普通 child Agent 默认使用父 Agent Scope 作为 parent，创建独立的：

- child Scope key；
- child Agent identity；
- child Session；
- Inbox、Prompt/Tool effective view 和取消链。

child 看到父 Scope 允许继承的能力，但不获得父 Agent 的可变 conversation、writer、credential object 或 Agent identity。child 的 listener 只观察 child 及其后代；parent listener 可以按事件契约观察 child。

当任务要求注册隔离（例如不希望 child 看到 parent-local contribution）时，可以显式创建 flat child Scope。该模式仍保留 parent Agent、parent Session 和 child Session 的显式关系，但不建立 Scope parent link；它不能悄悄改变普通 child Agent 的默认语义。

### 7.3 lineage 与 Scope 的边界

`parentSession`、`parentCallId`、`delegationDepth` 和 `lineage` 是持久化/诊断事实；Scope parent 是进程内路由和生命周期关系。两者必须关联，但不能用 Session lineage 代替 live Scope，也不能把 Scope parent 写成模型可见的权限证明。

## 8. 实现状态与剩余差距

Scope P0 已完成以下代码接线：

1. `AgentScope` 为每个 live Agent mint 独立 opaque `ScopeKey`，parent chain 通过同一份 WeakMap relation 驱动；
2. `ScopedRegistry` 支持 global、exact-scope 和 ancestor-to-nearest effective view，并保留最近层 shadow；
3. `ScopeDisposer` 具备 active/quiescing/disposed 状态、逆序清理、并发 dispose 共享 Promise 和 in-flight work lease；
4. `createAgentEventDispatcher()` 将 Agent subject 与 Scope carrier 融合，统一 `emit`、`serial`、`waterfall` 的路由，并在 subject/carrier 不一致时 fail closed；
5. Agent Loop、生命周期通知、main Agent 和 one-shot child Agent 已使用 live subject + opaque carrier；普通 child 默认继承 parent Scope，显式 `isolatedChild()` 才建立 flat registration scope；
6. contract tests 已覆盖同 descriptor Agent 隔离、parent/child admission、sibling isolation、registry shadow、child cleanup、dispose race 和 mismatch。

仍属于后续验收或其他 P0 所有权的差距：

1. 真实 Host/Electron/Provider 与 CLI one-shot 进程 smoke 尚未在本计划中完成；
2. 全仓库回归尚未替代定向 package 回归；
3. Cordis 原生事件 ABI 的最终公共 API 和核心 Service 化由并行 P0 计划负责，本计划只消费其 dispatch hook；
4. 当前 Scope 自身仍通过 `ScopeDisposer` 管理领域资源，未把所有 Scope-owned registration 统一迁移为 Cordis fiber `ctx.effect`；这需要与 Service 生命周期改造一起验收。

## 9. 范围与非范围

### 本规范包含

- ScopeKey、ScopeIdentity、parent chain；
- registry visibility/shadow；
- event admission 和 Agent carrier；
- setup/publication/dispose/quiescence；
- main Agent、Preset 和 one-shot Subagent 的 Scope 关系；
- diagnostics、contract tests 和迁移边界。

### 本规范不包含

- Agent Loop 9 个事件的字段或顺序；
- Session 13 个核心事件和持久化后端；
- Tool executor、read/list/grep/bash/browser 的具体实现；
- Credential、sandbox、网络或跨进程安全隔离；
- Dynamic plugin marketplace、VM sandbox 或 live reload；
- 任意未声明为 Scope-aware 的 Cordis Service 自动子 Scope 继承。

## 10. 验收不变量

实现完成后，至少必须由自动测试证明：

1. 两个独立 main Agent 使用同一 descriptor 时，listener 不串线；
2. parent listener 可以收到 child Agent event，child listener 收不到 sibling event；
3. child registry 可读取祖先贡献，最近 scope shadow 生效，parent view 不被 child 污染；
4. child dispose 不删除 parent 或 sibling contribution；
5. Agent subject 与 carrier 不一致时 dispatch 被拒绝；
6. Scope dispose 等待 active listener、stream、tool lease 和 child scope 静止；
7. unpublished setup 失败不会发布半配置 Agent；
8. Agent descriptor id、preset id 变化或复用不会改变 live Scope identity；
9. Scope 路由不是权限旁路，工具有效集合仍由 Host/Tool policy 约束；
10. CLI one-shot、one-shot Subagent 和恢复后的主 Agent 使用同一 Scope 语义。
11. 普通 child Agent 自动绑定 parent Scope；显式 isolated child Scope 不读取 parent-local contribution，且两种模式都保持唯一 live Agent identity。
12. parent Scope 的工具 contribution 可被 child 发现，但 parent 的 deny、Host ceiling 和 Approval 不能被 child Scope 或 Preset 放宽。

## 11. 迁移策略与前提

推荐在现有 `AgentScope`、`ScopedRegistry` 和 `ScopeDisposer` 上演进，不另建第二套 Scope 树。迁移顺序是：

1. 先固定 Scope contract 和 identity tests；
2. 再加入 opaque key、parent-aware admission 和 carrier invariant；
3. 再让 Agent factory、Agent Loop 和 Subagent 使用唯一 live Agent identity；
4. 最后把 Scope registration 接到 Cordis tagged Context 和 `ctx.effect`。

本方案依赖另两个 P0 计划先固定 Cordis 原生事件调度和核心 Service 生命周期，但不要求 Scope 包等待所有 Service 重构完成才可单独验证。

最脆弱的前提是：所有 Agent-subject event 都能在同一进程内携带稳定的 live Agent subject，并由同一 Cordis Context dispatch。如果某类跨进程/远程 Agent 无法满足这一点，该类事件必须改成 registry/session subject 或显式 wire identity，不能伪装成 scoped Agent event。

## 12. DSH 参考证据

以下快照不随 Git 仓库分发，路径仅用于追溯本机研究证据；新检出无需具备这些文件。

本规范采用的机制对应 `tmp/deepseek-harness` 固定快照中的以下事实：

- `ScopeKey` 是按对象 identity 比较的 opaque object，parent chain 由 `WeakMap` 维护，`scopeTarget()` 只向目标 key 及其祖先准入事件；见 DSH Scope 原语（历史快照路径：`tmp/deepseek-harness/packages/core/scope/src/index.ts`）。
- Agent dispatch 将 live Agent subject 与 Scope carrier 绑定；见 DSH Agent dispatch（历史快照路径：`tmp/deepseek-harness/packages/core/agent/src/dispatch.ts`）。
- Preset composition 通过 standing mount 和显式 child composition 组织，而不是把 descriptor/preset id 当作 live Agent scope；见 DSH Agent preset composition（历史快照路径：`tmp/deepseek-harness/packages/preset/agent-presets/src/index.ts`） 与 DSH child composition（历史快照路径：`tmp/deepseek-harness/packages/subagent/subagent/src/child-agent.ts`）。
- DSH 的 one-shot provider 选择 fresh flat registration scope，是一种隔离策略；ActSpace 将其保留为显式 `isolated child Scope`，不覆盖普通 child 自动继承 parent Scope 的默认语义。
- Scope、工具 visibility、sandbox/approval policy 和 Session lineage 在 DSH 中是不同层次；见 DSH Scope README（历史快照路径：`tmp/deepseek-harness/packages/core/scope/README.zh.md`）、DSH Tools README（历史快照路径：`tmp/deepseek-harness/packages/core/tools/README.zh.md`） 和 DSH Session types（历史快照路径：`tmp/deepseek-harness/packages/core/session/src/types.ts`）。
