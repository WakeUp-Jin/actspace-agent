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
- 监听 `agent:stream` 事件，驱动 `ConversationView` 实时渲染
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

## 2. Main Process 层

**做什么：**
- Electron app 生命周期（`configureAppPaths`、`createMainWindow`）
- IPC handler 注册和路由
- 调用 `buildAgentConfig()` 构建配置（前端参数 + 内部读 env）
- 调用 `await createAgentForSession(config, { sessionPath })` 创建运行时实例（会话历史在 ContextManager 构造阶段一次性恢复）
- 调用 `runTurnWithAgent()` 执行 turn
- 持久化 `AgentTurnResult` 到 session store
- 管理 abort 闭包

**不做什么：**
- 不直接构造 `LLMConfig`（委托给 `buildAgentConfig`）
- 不直接读取 `process.env` 来拼 API Key（委托给 `resolveAgentEnvConfig`）
- **不读 `session.jsonl`、不调 `recoverMessages` / `sessionEventsToMessages`、不感知任何会话恢复细节**——只把 `sessionPath` 透传给 `createAgentForSession`，由 ConversationContext 自己完成读盘 + 转换 + 灌 message。
- 不处理 Agent 内部事件（委托给 Bridge）

**关键文件：**
- `main/index.ts`：Electron 生命周期 + IPC 路由（精简，不含 Agent 逻辑）
- `main/agent-turn.ts`：Agent turn 编排（`runAndPersistTurn`）

**配置两步法：**
```typescript
const config = buildAgentConfig({ model, thinkingEnabled }, workspaceRoot);
const sessionPaths = createSessionStorePaths(join(roots.sessionRoot, input.sessionId));
const deps = await createAgentForSession(config, { sessionPath: sessionPaths.sessionPath });
```

`createAgentFromConfig`（同步签名）保留，仅供 mock / 单元测试 / 纯内存场景使用。

## 3. Bridge 层

**做什么：**
- 接收 `AgentDeps` + turn 参数，启动 Agent
- 将 `AgentEvent` 流（来自 Agent 内部）翻译成 `RuntimeStreamEvent`（前端约定的协议）
- 根据工具的 `previewKind` 聚合执行结果为 `ToolUiPreview`
- 汇总所有事件为最终的 `AgentTurnResult`

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

**不做什么：**
- 不知道 Electron 的存在
- 不持久化任何数据
- 不关心 IPC 协议或 `RuntimeStreamEvent` 格式

## 数据流向

```
用户输入 → Renderer
         → [IPC: RunTurnInput]
         → Main Process
           → buildAgentConfig(frontendInput, workspaceRoot)          → AgentConfig
           → await createAgentForSession(config, { sessionPath })    → AgentDeps（含已恢复历史的 ContextManager）
           → runTurnWithAgent(input, deps, { onStreamEvent })
         → Bridge
           → new Agent(deps).run(userInput)
         → Agent
           ← AgentEvent stream
         ← Bridge: 翻译为 RuntimeStreamEvent，回调 onStreamEvent
         ← Main Process: 通过 webContents.send 推送给 Renderer
         ← Renderer: 实时渲染

Agent 结束
  → Bridge: 聚合为 AgentTurnResult
  → Main Process: 持久化到 session store，返回给 IPC caller
  → Renderer: 更新最终状态
```

## 新增代码时的检查清单

- [ ] 前端传递的字段是否只在 `RunTurnInput` 中定义？
- [ ] 配置构建是否通过 `buildAgentConfig` 完成？（不要在 main 直接拼 LLMConfig）
- [ ] Main 进程是否仅透传 `sessionPath` 给 `createAgentForSession`，没有自行读 `session.jsonl` 或调 `sessionEventsToMessages`？
- [ ] Agent 内部新增的事件是否在 Bridge 中有对应的 `RuntimeStreamEvent` 翻译？
- [ ] Agent 层的代码是否依赖了 Electron API？（不应该）
- [ ] 持久化是否只在 Main Process 层完成？
