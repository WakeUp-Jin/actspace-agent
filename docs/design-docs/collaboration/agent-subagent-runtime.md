# 一次性 Subagent 运行规范

> 状态：当前 v2 设计与实现事实。Subagent 是工具触发的一次性 child Session，不使用 v1 transcript sidecar，也不支持续跑。

公共契约见 [`agent-spec-agent-and-subagent.md`](../agent-plugin-runtime/agent-spec-agent-and-subagent.md)，实现位于 `packages/subagent/`。

## 定位

主 Agent 通过 `actspace.subagent/agent` 或 `actspace.subagent/explore` 工具委托一个独立任务。每次调用创建：

- 独立 `invocationId`；
- 独立 `childAgentId`；
- 独立 `childSessionId`；
- child `AgentScope`；
- 静态 Preset；
- 父 Agent 当前可见工具与 Preset 工具的交集；
- 与父 Tool Call 关联的 lineage。

主 Agent 只接收结构化 terminal result；需要查看完整过程时，Host 读取 child Session 的 Journal projection。

## Child Session

Subagent 不把内部事件写进父 Session，也不创建：

```text
subagents/<runId>.jsonl
```

它创建普通的 v2 Session：

```text
sessions-v2/<childSessionId>/journal.jsonl
```

Header lineage 固定包含：

- `origin: "delegation"`；
- `parentSessionId`；
- `parentBoundarySeq`；
- `parentCallId`；
- `seedDigest`；
- `delegationDepth`。

Child Session 不能通过主会话恢复入口当作普通 main Session 续跑。它的用途是一次委托、完整记录、终态发布和只读回放。

## 调用流程

```text
parent tool/call
→ delegation/requested
→ create child Session + child Scope
→ create AgentLoop with static Preset
→ child runTurn(task)
→ child flush
→ delegation/child-terminal
→ child close + scope dispose
→ parent delegation/completed
→ parent tool/result
```

父 Session 通过 `delegation/requested` 和 `delegation/completed` 记录稳定关联；child Session 通过 `delegation/child-terminal` 保存自己的 terminal publication。

如果 child 已经 durable 发布 terminal，但进程在父 Session 写回前中断，`repairSubagentPublications()` 可以扫描合法 child Session，按父 Tool Call 顺序补齐 parent link 和 tool result。它不能为没有 lineage、没有 terminal 或校验失败的 Session 猜测关系。

## Static Preset

Preset 是不可变启动配置：

```text
id / version
routeId / model
promptContributorIds
allowedToolIds
readOnly
maxSteps
maxDurationMs
maxDelegationDepth
```

当前内置：

- `actspace.agent`：一次性只读分析 Agent，当前只开放 read_file、list_directory、grep、glob 与父可见工具的交集；
- `actspace.explore`：只读 Explore，只允许 `read_file`、`list_directory`、`grep`、`glob`。

最终工具集是：

```text
parentVisibleToolIds ∩ preset.allowedToolIds
```

Preset 不能扩大父 Agent 看不到的能力，也不能超过 Host capability ceiling。

## 生命周期

- Provider 进入 quiescing 后拒绝新委托；
- 每个 invocation 有独立 AbortController；
- 父 AbortSignal 级联到 child；
- Preset timeout 会中止 child；
- Runtime shutdown 调用 `abortAll()`，再等待全部 inflight invocation settle；
- child Session、child Scope 和 publication cleanup 都必须等待完成；
- delegation depth 达到 Preset 上限时拒绝启动。

当前最大 delegation depth 为 1，因此 Subagent 不能继续创建新的 Subagent 层级。

## Terminal result

终态至少包含：

```text
invocationId
childAgentId
childSessionId
presetId
status
text
usage
toolUseCount
durationMs
artifacts
failure
```

`status` 可以是：

```text
completed
failed
denied
aborted
outcome-unknown
```

父 Agent 的 tool result 只包含完成任务所需的结构化摘要和 child reference，不展开复制 child Journal 全部工具过程。

## 当前不提供

- 后台 Subagent 和异步完成通知；
- 用户对 child Session 继续追问；
- continuable Subagent；
- 多层递归委托；
- 运行期自定义 Preset；
- Team / Room 长期成员 Runtime；
- 独立 transcript sidecar。

## 验收

- 每次委托都有独立 child Session 和 lineage；
- Explore 不能获得副作用工具；
- 父取消和 Runtime shutdown 会中止并等待 child；
- child terminal 已 durable、父 link 缺失时可以保守修复；
- child Session 不被普通 main Session resume；
- 父上下文不会包含 child 全量 Journal；
- child / parent 两侧都不会因失败留下未释放 Scope 或 writer lease。

当前内置 Agent / Explore 均采用 300 步（最后一步无工具总结）与 30 分钟时限。限制原因、部分结果及父子 live 活动关联见 [Explore 与 Agent 只读边界](agent-explore-subagent.md)。
