# actspace 工具权限调度流程计划

## 目标

建立工具调用从 LLM tool call 到执行结果回填的完整调度流程，为 Bash 审核、未来 Write/Edit 审核和外部网络工具审核提供统一状态机。

本计划只负责工具调度协议和后端状态机，不实现 Bash executor，也不实现前端审核样式。

## 范围

- 包含：
  - 工具调用生命周期：`validating -> awaiting_approval -> scheduled -> executing -> success/error/cancelled`。
  - `ToolCallRecord`、`ToolPermissionResult`、`ToolApprovalRequest`、`ToolApprovalDecision` 的核心类型。
  - `ToolManager` 到 `ToolScheduler` 的职责拆分。
  - 工具级 `checkPermissions` 调用、参数清洗、硬拒绝和可审核风险输出。
  - 只读工具并行、非只读工具串行的调度策略。
  - 输出进入上下文前的 render result 和截断钩子位置。
- 不包含：
  - Bash 命令执行器。
  - Electron IPC approve/deny。
  - 前端审核面板。
  - 会话切换后 pending 状态恢复策略的具体实现。
  - 全局权限配置中心。

## 设计来源

- `docs/design-docs/agent-权限设计规则和原则.md`
- `.agents/skills/llm-agent-dev/references/tools/tool-scheduling.md`
- `.agents/skills/llm-agent-dev/references/tools/tool-definition.md`

## 相关代码路径

- `packages/agent-core/src/internal-tools.ts`
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/types.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/shared/src/session.ts`

## 核心设计

### 状态机

工具调用必须有稳定状态：

- `validating`：解析参数，调用工具 `checkPermissions`。
- `awaiting_approval`：可审核风险需要用户确认，调度器暂停该工具调用。
- `scheduled`：权限满足，进入执行队列。
- `executing`：调用 executor。
- `success`：执行成功并完成结果渲染。
- `error`：执行失败或工具内部异常。
- `cancelled`：权限拒绝、用户拒绝、超时或上层 abort。

### 权限结果

`checkPermissions` 只做安全检查和参数清洗，不做业务执行。

权限结果的决策只有三种：

- `allow`：可直接执行。
- `deny`：硬拒绝，不进入审核面板。
- `ask`：可审核风险，需要生成 approval request。

权限结果还可以携带随决策返回的上下文信息。它们不是额外的决策状态：

- `sanitizedArgs`：清洗后的参数。
- `reason`：给用户和日志看的原因。
- `summary`：人类可读动作摘要。
- `riskLevel`：低、中、高或等价分层。

### 调度职责边界

- `ToolManager`：注册工具、查找工具、提供基础执行入口。
- `ToolScheduler`：管理生命周期、权限检查、等待审核、执行顺序、结果渲染和状态记录。
- 单个工具：提供 definition、executor、`checkPermissions` 和可选 `renderResult`。
- engine loop：接收 scheduler 事件，把 awaiting approval 交给上层运行时处理。

### 执行顺序

- 只读工具可以并行。
- 非只读工具必须串行。
- 混合调用时，只读工具先并行完成，非只读工具按顺序进入验证和执行。
- `awaiting_approval` 的工具不能阻塞同一批里已安全完成的只读结果记录，但会阻塞依赖该工具结果的后续 Agent 回合。

## 重点问题

1. `awaiting_approval` 是 scheduler 内部 Promise 暂停，还是向 engine 抛出可恢复事件？
   - 倾向：scheduler 产出 pending event，由 engine/runtime 管理恢复，避免工具层直接依赖 Electron。
2. `ToolCallRecord` 是否落 session？
   - 倾向：状态变化以精简事件落 session，完整参数和输出只进本地 run log。
3. `checkPermissions` 的 `ask` 是否允许 executor 参与？
   - 不允许。executor 只能在权限满足后执行。
4. 工具输出截断在哪里做？
   - executor 返回结构化结果；scheduler 调 `renderResult` 后再截断给 LLM。

## 里程碑

1. 定义工具状态和权限结果类型。
   - 验证：类型覆盖 allow、deny、ask、cancelled、expired。
2. 抽出 `ToolScheduler` 或等价调度层。
   - 验证：现有 Read/Search/List/Edit 工具调用行为不变。
3. 接入 `checkPermissions`。
   - 验证：单测证明 deny 时 executor 不会被调用，sanitized args 会进入 executor。
4. 接入 awaiting approval 的后端事件。
   - 验证：单测能产出 pending approval request，并在模拟 decision 后继续或取消。
5. 增加结果渲染和截断钩子。
   - 验证：大输出不会完整进入 LLM context。

## 验证方式

- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/shared test`
- `pnpm typecheck`

单测至少覆盖：

- 只读工具直接执行。
- 非只读工具 allow 后执行。
- deny 后 executor 不执行。
- ask 后产生 approval request。
- approve 后只执行一次。
- deny decision 后 cancelled。
- 重复 decision 幂等。
- abort 时 pending 工具 cancelled。

## 与其他计划关系

- 被 `docs/exec-plans/completed/actspace-bash-tool-plan.md` 消费：Bash 使用这里定义的权限结果和调度入口。
- 被 `docs/exec-plans/completed/actspace-bash-approval-ui-plan.md` 消费：UI 使用这里定义的 approval request 状态。
- 被 `docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md` 消费：暂停恢复、会话切换和进程边界在该计划落细。

## 进度记录

- [x] 定义 agent-core 工具权限三态决策和调度记录类型。
- [x] 抽出工具调度层。
- [x] 接通工具权限检查。
- [x] 支持 awaiting approval 的结构化结果。
- [x] 将 approval request 扩展为 engine/runtime 事件。
- [x] 完成单测与文档同步。

## 决策记录

- 2026-05-24：工具权限调度从审核面板计划中拆出。原因是调度状态机是后端主流程，必须先独立稳定，再让 Bash 和 UI 消费。
- 2026-05-24：权限结果采用 `allow`、`deny`、`ask` 三态；`sanitizedArgs`、`reason`、`summary`、`riskLevel` 仅作为 metadata，不作为额外状态。
