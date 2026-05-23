# actspace 后端计划 E：Execution Engine — runAgentLoop 双层循环

## 目标

实现 Skill 推荐的纯函数 `runAgentLoop`，采用双层 while 循环架构。内层处理 tool calls + steering 消息，外层处理 follow-up 消息。通过事件回调（AgentEventSink）通知外部所有生命周期事件。支持 AbortSignal 取消和 shouldStopAfterTurn 安全阀。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`（核心：执行循环设计、双层 while、AgentEvent、Agent 入口类）
- `.agents/skills/llm-agent-dev/references/architecture.md`（V0/V1 执行循环定位）
- `.agents/skills/llm-agent-dev/examples/agent-loop.ts`（核心参考实现：runAgentLoop + Agent 类 + SubAgentTool）
- `docs/RELIABILITY.md`

## 相关路径

- `packages/agent-core/src/agent.ts`（当前实现，需要按 Skill 重构）
- `packages/agent-core/src/types.ts`（依赖计划 A 类型）
- `packages/shared/src/session.ts`
- `packages/desktop/src/main/index.ts`

## 范围

**V0 骨架（首要目标）：**

- 实现纯函数 `runAgentLoop(context, llm, config, emit, signal?)`：
  - 不持有任何状态，通过参数接收依赖，通过事件回调通知外部
  - context 应在调用前包含初始消息和 tools
  - loop 内部直接操作 context.messages
- 双层 while 循环：
  - **内层**：处理 tool calls + steering 消息
    - 流式调用 LLM（streamSimple）
    - 有 tool_calls → 通过 ToolManager/ToolScheduler 执行
    - 结果回填 context.messages
    - 继续循环
  - **外层**：处理 follow-up 消息
    - 内层结束后检查是否有排队的后续消息
    - 有则注入并重新进入内层
- 终止条件（任一满足即停止）：
  - LLM 返回非 toolUse 且无 steering/follow-up 消息
  - LLM 返回 error/aborted
  - `shouldStopAfterTurn` 返回 true
  - AbortSignal 被触发
  - **无硬编码 maxIterations**，安全阀通过回调实现
- 定义 `AgentEvent` 判别联合（四个层级）：
  - agent 级：agent_start / agent_end
  - turn 级：turn_start / turn_end
  - message 级：message_start / message_delta / message_end
  - tool 级：tool_start / tool_end
- 定义 `AgentEventSink = (event: AgentEvent) => Promise<void> | void`
- 实现 `streamAssistantResponse(context, llm, signal, emit)`：
  - 消费 LLM 流式响应
  - 通过 message_delta 转发增量
  - 通过 message_end 提交最终 AssistantMessage
  - LLM 错误不抛出，返回 stopReason='error' 的 AssistantMessage
- 实现 `executeToolCalls(scheduler, toolCalls, mode, emit)`：
  - 支持 sequential / parallel 两种模式
  - 通过 tool_start/tool_end 事件通知每个工具状态
  - 返回 ToolResultMessage[]
- 实现 `Agent` 极简入口类：
  - 只做三件事：组装模块引用、提供 `run(userText)` 方法、提供 `abort()` 取消
  - 不做状态管理（isStreaming 等是 UI 层关注点）
  - run 流程：构造 UserMessage → appendMessage → getContext → 附加 tools → runAgentLoop → 返回最终回复
- 实现 `AgentLoopConfig`：
  - scheduler
  - toolExecution（sequential/parallel）
  - shouldStopAfterTurn（接收 turnIndex，调用者自行决定上限）
  - getSteeringMessages（轮间注入）
  - getFollowUpMessages（停止前检查）
- Usage 累计：每轮 LLM 调用后累加 totalUsage
- 返回 `AgentLoopResult`：{ message: AssistantMessage, totalUsage: Usage, messages: Message[] }

**V1 增强（后续）：**

- 子智能体工具（createSubAgentTool 工厂函数）：
  - 子 Agent 作为普通 InternalTool 注册
  - 独立 Context（独立 systemPrompt + messages + tools）
  - 在隔离上下文中执行 runAgentLoop
  - 返回结构化结果（text + usage + toolUseCount）
- 异步子智能体（run_in_background）
- 级联取消（主 AbortController 创建子级 controller）
- Runtime event → Session event adapter（对接 Persistence）
- 更完善的错误分类和恢复

不包含：

- 不实现多 Agent 编排（Supervisor/Swarm/Hierarchical）
- 不实现后台常驻任务
- 不实现复杂多 turn steering
- 不实现高级权限审批

## 执行流程详解（对应设计文档 12 步）

```
1. renderer IPC → agent:run-turn
2. main 调用 agent-core，传入 session/turn/input
3. Agent.run(userText):
   a. 构造 UserMessage → appendMessage
   b. getContext() 获取 Context
   c. 附加 tools
   d. 创建 AbortController
4. runAgentLoop(context, llm, config, emit, signal):
   a. emit agent_start
   b. 外层 while(true):  ← follow-up 层
     c. 内层 while(hasToolCalls || pending):  ← tool calls + steering 层
       d. 注入 pending/steering 消息
       e. streamAssistantResponse(context, llm, signal, emit)
       f. 如果 stopReason === toolUse:
         g. executeToolCalls(scheduler, toolCalls, mode, emit)
         h. ToolResultMessage → context.messages
       i. turnIndex++, emit turn_end
       j. shouldStopAfterTurn 检查
       k. 获取 steering 消息
     l. 获取 follow-up 消息
     m. 有则继续，无则 break
   n. emit agent_end
5. 返回 AgentLoopResult
6. Agent 层组装 AgentTurnResult → main → renderer
```

## 失败模式处理

必须处理：

- **Provider 抛错**：streamAssistantResponse 捕获异常，返回 stopReason='error' 的 AssistantMessage，不抛出
- **Provider 返回异常结构**：同上
- **工具不存在**：ToolManager 返回 ToolResult { success: false, error: "unknown tool" }
- **工具输入非法**：同上
- **工具执行失败**：返回 ToolResultMessage { isError: true }，不中断循环
- **AbortSignal 中止**：每层循环开头检查 signal?.aborted，返回 stopReason='aborted'
- **安全阀触发**：shouldStopAfterTurn 返回 true 即停止

**关键原则：失败不崩溃。** 工具失败转为 recoverable ToolResultMessage 回填上下文，provider 失败转为 error AssistantMessage，都不让进程崩溃。

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`
- `pnpm build`

行为验收：

- mock provider 能跑出完整 turn（通过 Agent.run()）
- 完整 turn 至少包含：thinking + read_file + search_files 或 list_directory + edit_file_diff + assistant reply + context snapshot
- tool-call loop 正确执行：模型第一次调用返回 tool calls → 工具执行 → 结果回填 → 模型第二次调用返回 final reply
- AgentEvent 按正确顺序 emit（agent_start → turn_start → message_delta... → message_end → tool_start → tool_end → turn_end → agent_end）
- tool result 进入下一次 LLM 调用上下文（context.messages 包含 ToolResultMessage）
- provider 错误返回 stopReason='error' 的 AssistantMessage，不抛出异常
- abort 不会留下半崩溃状态
- shouldStopAfterTurn 可以限制最大 turn 数

## 并行关系

- 依赖计划 A 的全部类型（Message/Content/Context/Usage/AgentEvent）
- 推荐等待 B（LLM mock provider）、C（ToolManager）、D（ContextManager）的接口草案稳定后启动
- 可以先用 mock adapter 并行开发
- 最终接入 LLM Service、Tool Runtime、Context Pipeline
- Persistence（计划 F）在本计划外层 wrap 落盘逻辑

## 进度

- [x] 审查现有 `packages/agent-core/src/agent.ts`
- [x] 定义 AgentEvent 判别联合（四层级：agent/turn/message/tool）
- [x] 定义 AgentLoopConfig（toolManager/shouldStopAfterTurn/steering/followUp）和 AgentLoopResult
- [x] 实现 streamAssistantResponse（流式 LLM 消费 + 错误捕获 → stopReason='error'）
- [x] 实现 executeToolCalls（sequential/parallel + tool_start/tool_end 事件）
- [x] 实现 runAgentLoop（双层 while 循环 + AbortSignal + 安全阀）
- [x] 实现 Agent 极简入口类（run/runAndGetText/abort）
- [x] 迁移现有 agent.ts 为兼容层 + engine/index.ts 统一导出
- [x] 通过类型检查（agent-core + 全项目）
- [ ] 接入 mock LLM + ToolManager + ContextManager 验证完整 turn
- [ ] 增加失败场景测试
- [ ] 更新架构文档和 history

## 决策记录

- 2026-05-23：执行引擎采用纯函数和事件回调，不持久化状态；持久化由外层 adapter 负责。
- 2026-05-23：按 Skill `agent-patterns.md` 和 `examples/agent-loop.ts` 采用双层 while 循环架构。无硬编码 maxIterations，安全阀通过 shouldStopAfterTurn 回调实现。AgentEvent 四层级事件系统覆盖 agent/turn/message/tool。Agent 类只做组装+入口+取消，不做状态管理。V0 先做单智能体完整循环，V1 扩展子智能体工具。
