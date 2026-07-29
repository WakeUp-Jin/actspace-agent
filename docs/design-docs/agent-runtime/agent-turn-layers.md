# Agent Turn 四层职责规范

> 约束从前端用户输入到 Agent 执行结果返回的完整数据链路，明确每一层"做什么"和"不做什么"。

## 概览

```
Renderer ──IPC──▶ Main Process ──调用──▶ Bridge ──驱动──▶ Agent
   ◀──stream──      ◀──persist──       ◀──events──     ◀──loop──
```

| 层 | 包/文件 | 核心职责 | 输入 | 输出 |
|---|---|---|---|---|
| Renderer | `desktop/src/renderer/` | 收集用户输入，展示流式结果 | 用户交互 | `RunTurnInput`（经 IPC） |
| Main Process | `desktop/src/main/` | Electron 生命周期、IPC 路由、Agent 依赖准备、结果持久化 | `RunTurnInput` | `AgentTurnResult` |
| Bridge | `agent-core/src/engine/bridge.ts` | 将 Agent 内部事件翻译为 `RuntimeStreamEvent`，聚合为 `AgentTurnResult` | `AgentDeps` + turn 参数 | `AgentTurnResult` + stream 回调 |
| Agent | `agent-core/src/engine/agent.ts` + `loop.ts` | LLM 循环（思考→工具→回复），上下文管理，工具执行 | `ContextManager` + `LLMService` + `ToolManager` | `AgentEvent` 流 |

## 1. Renderer 层

**做什么：**
- 通过 `Composer.tsx` 收集 `{ model, thinkingEnabled, userInput }` 三个字段
- 调用 `window.api.runTurn(input)` 发起 IPC 请求
- 在 `App` 生命周期内只注册一次 `agent:stream` 监听，驱动 `ConversationView` 实时渲染
- 按 `{ sessionId, turnId }` 路由 turn 级事件，只有当前可见 turn 可以修改共享 streaming state
- 管理 UI 状态（loading、abort 按钮等）

**不做什么：**
- 不读取 `.env`，不接触 API Key
- 不构造 `LLMConfig`，不创建 LLM/Tool 实例
- 不直接导入 `@actspace/agent-core`

**前端传递的字段（`RunTurnInput`）：**

| 字段 | 类型 | 来源 | 用途 |
|---|---|---|---|
| `sessionId` | `string` | 前端 session 管理 | 会话标识 |
| `turnId` | `string` | 前端生成 | turn 标识 |
| `userInput` | `string` | 用户在 Composer 中输入 | 用户消息 |
| `model` | `ModelId?` | 用户在下拉菜单选择 | 选定的模型 |
| `thinkingEnabled` | `boolean?` | 用户切换 toggle | 是否启用思考 |
| `executionContext` | `TurnExecutionContextInput?` | 首轮 Workspace / Branch / Run on 选择 | 由 Main 在首轮发送前准备最终执行目录 |

首轮 Workspace / Branch / Run on 选择会作为一个 `executionContext` 快照随 `agent:run-turn` 一次性提交。Main 必须先完成 Git/worktree 准备并更新 SessionMeta，再构建 Agent；准备失败不能写入 `user_message`。已有 turn 的会话继续使用已锁定的 `SessionMeta.workspaceRoot`。

`RuntimeStreamEvent` 中所有 turn 级事件都必须携带 `sessionId` 与 `turnId`，包括 assistant delta、工具 streaming/start/finish、审批和 SubAgent 事件。`bash_task_update` 是例外：后台任务可能在原 turn 结束后继续变化，因此它保持 session 级作用域，只按 `sessionId` 路由。

切换会话只会把旧 turn 从当前可见 streaming state 脱离，不会隐式中止 main 进程中的执行。旧 turn 后续返回的 delta、结果和 finally 收尾都不能覆盖新会话或新 turn 的 UI。

流式 turn 完成并恢复 `SessionRecord` 时，Renderer 必须遵守以下交接不变量：

- 同一个 `turnId` 在一个渲染帧内只能来自 streaming blocks 或 persisted blocks，不能同时来自两份状态源。
- 恢复后的 `SessionRecord`、streaming blocks 清理和运行状态收尾必须在同一个同步交接阶段完成；会话列表、Review 等辅助刷新不能插在消息交接中间。
- `MessageBlock.id` 保留持久化事件身份，用于消息操作和数据引用；`MessageBlock.renderKey` 是 turn 级展示身份，流式块与持久化块通过相同 render key 复用 React DOM，避免完成时重新播放入场动画。

`/compact` 与 `/eval [失败说明]` 是例外命令路径：renderer 在普通 turn 前分流到独立 IPC。两者都不创建普通用户消息，不进入 `RunTurnInput.userInput`，也不进入主 Agent conversation。`/eval` 使用独立系统提示词和独立 ContextManager，在 `<userData>/eval-candidates/<candidateId>/` 生成回归 Candidate。

## 2. Main Process 层

**做什么：**
- Electron app 生命周期（`configureAppPaths`、`createMainWindow`）
- IPC handler 注册和路由
- 调用 `buildAgentConfig()` 构建配置（前端参数 + 内部读 env）
- 读取当前 session `meta.workspaceRoot`，缺省时回退应用默认 `workspaceRoot`
- 首轮存在 `executionContext` 时，在任何用户事件持久化前完成 branch/worktree 准备、校验和 SessionMeta 更新
- 调用 `await createAgentForSession(config, { sessionPath })` 创建运行时实例（会话历史在 ContextManager 构造阶段一次性恢复）
- Agent 依赖和上下文恢复完成后、真正执行 turn 前，先 append 本轮 `user_message`；这样审批等待或工具执行期间被中止时，用户输入也已经成为会话事实
- 调用 `runTurnWithAgent()` 执行 turn
- 持久化 `AgentTurnResult` 中剩余事件到 session store；bridge 在这条真实桌面端路径关闭重复的 user event 聚合
- 处理 `context:compact` 手动压缩：为当前 session 装配相同的 Agent deps，调用 `compactContextWithAgent()`，追加 `context_compaction` / `context_snapshot` 并刷新 `context-state.json`
- 处理 `eval:generate-candidate`：定位最近一个普通用户 Turn，以 Candidate 目录作为独立生成 Agent 的 workspace，完成后追加 `eval_candidate` 系统事件
- 管理 abort 闭包

**不做什么：**
- 不直接构造 `LLMConfig`（委托给 `buildAgentConfig`）
- 不直接读取 `process.env` 来拼 API Key（委托给 `resolveAgentEnvConfig`）
- **不读 `session.jsonl`、不调 `recoverMessages` / `sessionEventsToMessages`、不感知任何会话恢复细节**——只把 `sessionPath` 透传给 `createAgentForSession`，由 ConversationContext 自己完成读盘 + 转换 + 灌 message。
- 不处理 Agent 内部事件（委托给 Bridge）

**关键文件：**
- `main/index.ts`：Electron 生命周期 + IPC 路由（精简，不含 Agent 逻辑）
- `main/agent-turn.ts`：Agent turn 编排（`runAndPersistTurn`）
- `main/context-compact.ts`：手动上下文压缩编排（`compactAndPersistContext`）

**配置两步法：**
```typescript
const sessionPaths = createSessionStorePaths(join(roots.sessionRoot, input.sessionId));
const meta = await readMeta(sessionPaths.metaPath);
const prepared = input.executionContext
  ? await prepareExecutionContext(input.executionContext, roots)
  : null;
const workspaceRoot = prepared?.workspaceRoot ?? meta?.workspaceRoot ?? roots.workspaceRoot;
const config = buildAgentConfig({ model, thinkingEnabled }, workspaceRoot);
const deps = await createAgentForSession(config, { sessionPath: sessionPaths.sessionPath });
```

`createAgentFromConfig`（同步签名）保留，仅供 mock / 单元测试 / 纯内存场景使用。

## 3. Bridge 层

**做什么：**
- 接收 `AgentDeps` + turn 参数，启动 Agent
- 将 `AgentEvent` 流（来自 Agent 内部）翻译成 `RuntimeStreamEvent`（前端约定的协议）
- 根据工具的 `previewKind` 聚合执行结果为 `ToolUiPreview`
- 汇总所有事件为最终的 `AgentTurnResult`
- 使用 `AgentLoopResult.status` 判断 turn 终态；abort 不从最后一条 assistant message 的 `stopReason` 反推
- abort 时产出带 `{ sessionId, turnId }` 的 `turn_aborted` stream event，并聚合可持久化的同名 SessionEvent

**不做什么：**
- 不创建 LLM/Tool 实例（接收已创建好的）
- 不持久化数据
- 不处理 IPC 传输
- 不感知会话历史恢复——拿到的 `deps.contextManager` 在构造阶段就已经包含完整历史，`getContext()` 同步可见

## 4. Agent 层

**做什么：**
- 管理 LLM 对话循环（`runAgentLoop`）
- 上下文管理（system prompt、历史消息、token 估算）
- 工具执行（通过 `ToolManager`）
- 产出 `AgentEvent` 流（thinking、text、toolCall、toolResult 等）
- 支持 abort
- abort 是独立的 turn 终态；即使中止发生在 tool call、审批等待或尚未收到首条 assistant message 时，也返回 `status: "aborted"`

**不做什么：**
- 不知道 Electron 的存在
- 不持久化任何数据
- 不关心 IPC 协议或 `RuntimeStreamEvent` 格式

## 数据流向

```
用户输入 → Renderer
         → [IPC: RunTurnInput]
         → Main Process
           → prepare executionContext (first turn only)
           → update SessionMeta.workspaceRoot / worktree metadata
           → readMeta(session.metaPath).workspaceRoot ?? defaultRoot
           → buildAgentConfig(frontendInput, workspaceRoot)          → AgentConfig
           → await createAgentForSession(config, { sessionPath })    → AgentDeps（含已恢复历史的 ContextManager）
           → append user_message                                    → session.jsonl
           → runTurnWithAgent(input, deps, { onStreamEvent, includeUserEvent: false })
         → Bridge
           → new Agent(deps).run(userInput)
         → Agent
           ← AgentEvent stream
         ← Bridge: 翻译为 RuntimeStreamEvent，回调 onStreamEvent
         ← Main Process: 通过 webContents.send 推送给 Renderer
         ← Renderer: 单一监听按 sessionId + turnId 路由后实时渲染

Agent 结束
  → Bridge: 聚合为 AgentTurnResult
  → Main Process: 追加剩余事件到 session store，返回给 IPC caller
  → Renderer: 重新读取 SessionRecord
    → 同步完成 streaming → persisted 单一数据源交接
    → 使用稳定 renderKey 保留当前 turn DOM
    → 再刷新会话列表和 Review 等辅助状态
```

### Stop / Abort 收敛链路

```txt
Renderer: 点击 Stop
  → [IPC: agent:abort-turn]
  → Main Process: 命中 active turn abort closure
    → Agent.abort() 触发当前 turn AbortSignal
    → PendingApprovalRegistry.abortTurn(sessionId, turnId)
      → 若正在等待审批，立即 resolve 为 abort，executor 不启动
    → 若前台 Bash 已启动，signal listener 终止对应进程
  → Agent loop 返回显式 status: "aborted"
  → Bridge: 追加 turn_aborted SessionEvent，并推送 turn_aborted RuntimeStreamEvent
  → Main Process: append 剩余事件并更新 meta.turnCount
  → Renderer: getSession(sessionId)，清空临时 streamingBlocks，Composer 恢复输入
```

`Stopped` 不是 renderer 临时拼出的占位块，而是 `turn_aborted` SessionEvent 派生出的持久化状态块。因此切换 Session、发送下一轮消息或重启应用后，中止记录仍然存在。

abort 与 Allow/Run 可能同时发生。PendingApprovalRegistry 对 pending entry 采用先到先得的删除语义，scheduler 在 approval 返回后还会再次检查 `AbortSignal`；一旦 abort 获胜，工具 executor 不能启动。

手动 `/compact` 数据流：

```txt
Renderer: `/compact`
  → [IPC: CompactContextInput]
  → Main Process
    → readMeta(session.metaPath).workspaceRoot ?? defaultRoot
    → buildAgentConfig({ model }, workspaceRoot)
    → await createAgentForSession(config, { sessionPath })
    → compactContextWithAgent(input, deps, { onStreamEvent })
  ← RuntimeStreamEvent: context_compaction_started/progress/finished/failed
  → append context_compaction + context_snapshot
  → write context-state.json
  ← Renderer: 恢复 SessionRecord，消息流显示 context_compaction block
```

手动 `/eval` 数据流：

```txt
Renderer: `/eval [失败说明]`
  → [IPC: GenerateEvalCandidateInput]
  → Main Process
    → 定位最近一个普通 user_message Turn
    → 创建 <userData>/eval-candidates/<candidateId>/
    → buildAgentConfig(candidateRoot + 独立 system prompt)
    → 独立 Agent 用绝对路径只读 session.jsonl / 原工作区
    → write_file / edit_file 写 case.json + fixture/
    → 校验必要产物
    → append eval_candidate SessionEvent
  ← Renderer: 恢复 SessionRecord，显示 Candidate 成功/失败状态
```

## 新增代码时的检查清单

- [ ] 前端传递的字段是否只在 `RunTurnInput` 中定义？
- [ ] 配置构建是否通过 `buildAgentConfig` 完成？（不要在 main 直接拼 LLMConfig）
- [ ] Main 进程是否仅透传 `sessionPath` 给 `createAgentForSession`，没有自行读 `session.jsonl` 或调 `sessionEventsToMessages`？
- [ ] Agent 内部新增的事件是否在 Bridge 中有对应的 `RuntimeStreamEvent` 翻译？
- [ ] 新增的 turn 级 `RuntimeStreamEvent` 是否包含 `sessionId` 与 `turnId`？
- [ ] Renderer 是否继续保持单一 `agent:stream` 订阅，且旧 turn 收尾不会修改新 turn 状态？
- [ ] abort 是否同时覆盖 Agent signal、pending approval 和仍在前台等待的 Bash，且不会误杀已经 backgrounded 的 task？
- [ ] aborted turn 是否从持久化 `turn_aborted` 恢复，而不是依赖 renderer 临时状态？
- [ ] Agent 层的代码是否依赖了 Electron API？（不应该）
- [ ] 持久化是否只在 Main Process 层完成？
- [ ] Slash command 是否明确分流，不把命令文本写入主 Agent conversation？
