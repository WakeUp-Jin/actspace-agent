# Agent Todo 工具设计规范

状态：V1 已实现

## 1. 目标

为 ActSpace 的主 Agent 增加一个轻量、可恢复、可展示的执行清单。主 Agent 在处理多步骤请求时可以维护当前工作项，用户可以在消息流中看到进度；清单只表达当前 Agent Run 的执行状态，不承担文件、团队协作或子 Agent 调度职责。

V1 只提供两个工具：

- `todo_read`：读取当前 Agent Run 的清单，可按状态或 ID 筛选。
- `todo_write`：创建、替换或合并清单，并更新工作项状态。

不单独提供 `todo_create`、`todo_update`、`todo_get` 或 `todo_list`。完整写入和按 ID 合并已经覆盖主 Agent 的最小闭环，也避免为同一份状态建立多个修改入口。

## 2. Todo 与 Task 的边界

Todo 和 Task 是两个不同层级的概念，不能因为都叫“任务”而共用同一份领域模型。

| 维度 | Todo（本设计 V1） | Task（后续多智能体） |
| --- | --- | --- |
| 目的 | 让当前主 Agent 展示和维护执行清单 | 在多个 Agent 之间分派、认领、阻塞和交付工作 |
| 权威范围 | 单个 `AgentRun` | Team/Project 的共享任务列表 |
| owner | 无 | 有成员 owner、认领和转派 |
| 依赖 | V1 不表达依赖 | 支持 `blockedBy`、`blocks` 等依赖 |
| 并发 | 同一个 Agent Run 内串行更新 | 需要原子更新、版本、租约或锁 |
| 结果 | 状态和内容 | 状态、结果、引用、交付记录 |
| UI | 当前对话中的 Todo 清单 | Team/成员/任务工作台 |

ActSpace 已有 Agent Team 设计中的 `TeamTask` 保留为未来 Task 的契约。本设计不把 Todo 写入 Team Task 存储，不增加 owner、assignmentVersion、lease、mailbox 或跨成员锁。未来接入多智能体时，可以让 Todo 作为 Leader 的本地视图，或由 Task 状态投影生成，但不能反过来把 V1 Todo 当作共享 Task。

## 3. 使用规则

主 Agent 应遵循以下规则：

1. 预计至少有三个相互独立的步骤时创建 Todo；问答、解释、单文件小改动等简单请求不创建。
2. 创建后最多保持一个 `in_progress` 工作项；开始处理某项前将其设为 `in_progress`。
3. 一项工作真正完成后立即设为 `completed`，不要提前标记，也不要把多个步骤合并成含糊的一项。
4. 任务目标发生变化时，用一次 `todo_write` 提交新的完整快照或合并更新，不依赖前端修改。
5. 全部工作项完成后保留最终清单，供用户回看；不再自动清空历史。

这些规则写入主 Agent system prompt，但工具执行器仍负责校验结构和状态不变量，不能只依赖 prompt。

## 4. 数据契约

### 4.1 状态和实体

```ts
type TodoStatus = "pending" | "in_progress" | "completed";

type TodoItem = {
  id: string;          // 后端生成的稳定不透明 ID
  content: string;     // 用户可读的工作项，不能为空
  status: TodoStatus;
  activeForm?: string; // 可选的进行时文案，V1 UI 可暂不使用
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
};

type TodoSnapshot = {
  todos: TodoItem[];
  totalCount: number;
  revision: number;    // 当前 Agent Run 内单调递增
};
```

约束：

- `id` 在一次 Agent Run 内唯一；客户端不能指定重复 ID，也不能依赖 ID 的排序语义。
- 输入携带 `id` 时，该 ID 必须已存在于当前 Agent Run；未知 ID 返回 `TODO_NOT_FOUND`。新项一律省略 `id`，由后端生成。
- `content` 去除首尾空白后仍为空时拒绝写入。
- V1 只允许一个 `in_progress`；违反时返回结构化错误，不静默改写另一个工作项。
- `completed` 是终态；V1 不支持 `cancelled`，取消或删除通过下一次完整写入时省略该项表达。
- `createdAt` 首次创建后不变，`updatedAt` 每次实际变更更新。
- `revision` 每次成功写入加一；读取不改变 revision。

### 4.2 `todo_read`

输入（均可选）：

```ts
type TodoReadArgs = {
  statusFilter?: TodoStatus[];
  ids?: string[];
};
```

不传参数返回当前 Agent Run 的完整快照。传入筛选条件时使用 AND 关系：先按 ID 集合过滤，再按状态过滤；结果仍按清单原有顺序返回。不存在的 ID 不报错，只返回匹配项为空的结果。

成功返回 `TodoSnapshot` 的筛选版本，并额外保留 `totalCount` 为筛选后的数量。失败只可能来自参数 schema 不合法。

### 4.3 `todo_write`

输入：

```ts
type TodoWriteArgs = {
  todos: Array<{
    id?: string;
    content: string;
    status: TodoStatus;
    activeForm?: string;
  }>;
  merge?: boolean; // 默认 false
};
```

- `merge: false`（默认）：用输入数组替换当前清单。无 `id` 的项由后端生成 ID；保留已有 ID 的项时沿用其 `createdAt`。
- `merge: true`：按 `id` 合并；无 `id` 的项追加为新项；已有项只更新输入中出现的字段，未出现的项保持不变。合并结果仍按当前清单顺序，新增项追加到末尾。
- 成功返回 `{ todos, totalCount, wasMerge, revision }`，其中 `todos` 是完整的规范化快照，供模型和前端使用。
- schema、重复 ID、未知状态、空内容或多个 `in_progress` 都返回可读的结构化失败；失败不得部分写入。

工具名称使用 snake_case；展示语义通过 `ToolUiPreview.kind = "todo"` 传递，renderer 不根据内部工具名反推。

## 5. 生命周期、存储和恢复

- TodoStore 由 `agent-core` 持有，作用域为 `sessionId + agentRunId`；renderer 不直接持有权威状态。
- V1 复用现有 `tool_call` / `tool_result` / session JSONL 链路，不新建 `~/.actspace/tasks`、workspace TODO 文件或独立 IPC 通道。
- 每次成功 `todo_write` 的完整 `TodoSnapshot` 写入工具结果的结构化数据和 `uiPreview`；`todo_read` 只记录读取结果，不改变状态。
- session 恢复时，从该 Agent Run 最近一次成功的 `todo_write` 结果恢复快照；失败写入和 `todo_read` 都不能成为恢复事实源。没有 Todo 事件时视为空清单。恢复不得从模型自然语言或 raw output 猜测状态。
- V1 不做跨进程并发锁。若未来 Task 共享到多个 Agent，必须另立 TaskStore、版本和原子更新设计，不能悄悄扩大 TodoStore 的职责。

## 6. 工具流与 UI 契约

### 6.1 ToolUiPreview

新增 shared 类型：

```ts
type TodoUiPreview = {
  kind: "todo";
  todos: TodoItem[];
  totalCount: number;
  completedCount: number;
  revision: number;
  displayText: string; // 例如 "3 of 5 To-dos Completed"
};
```

`tool_started` 可以只发送当前快照和 `displayText`；最终 `tool_finished` 必须发送完整快照。`tool_call_streaming` 不解析 Todo 的半成品数组，首期只发送稳定的空/已有快照，避免在 JSON 尚未完整时渲染错误清单。后续 `todo_write` 的空 partial preview 不得覆盖上一版有效快照；首次运行且没有有效条目时不渲染空 Todo 区域。

### 6.2 消息区表现

- Todo 清单与本轮已发送用户消息组成同一张执行卡片：共用外框、背景与圆角，Todo 位于用户请求下方；执行过程（`Worked for`）和最终回复位于卡片之外。
- 用户请求卡片作为一个整体参与 turn 的 sticky/滚动布局，Todo 不再作为 assistant body 中的独立消息块滚动。
- 同一轮只显示最新的 Todo 快照，避免每次 `todo_write` 更新都在消息流中追加一张列表。
- 标题行从左到右显示折叠箭头和动态的 `completedCount of totalCount To-dos Completed`；运行中的清单展开，全部完成后默认折叠，用户点击标题可查看完整条目。
- 展开后 pending 使用空心圆，in-progress 使用主题感知的旋转图标，completed 使用弱化完成图标和删除线；必要时在进行中条目下显示 `activeForm`。
- V1 不提供用户直接编辑、拖拽排序、删除按钮或手动勾选；状态唯一来源是 Agent 工具调用。
- 同一 `toolCallId` 的 running/finished 事件原地更新；session 恢复与实时流使用同一 `TodoUiPreview` 类型。
- 同一 Agent Run 出现多个 Todo 工具调用时，实时状态和历史消息都只展示 revision 最新的快照，不累积多张 Todo 列表。
- 遵循现有主题 token、工具预览和前端验证规范，不新增硬编码颜色或独立的卡片套卡布局。

## 7. 权限和失败语义

- `todo_read` 是本地只读工具；`todo_write` 只修改当前 Agent Run 的内存/会话状态，不读写 workspace 文件，不请求用户审批。
- 工具错误必须区分参数校验失败和执行器状态冲突，返回短模型可读信息，同时保留结构化错误码供测试和日志使用。
- 写入采用全量校验后一次提交；任何失败都保持旧快照和旧 revision 不变。

## 8. 明确不做

- 不实现 Cursor/Claude Code 的 `Task`、子 Agent、后台任务、await、团队成员分派。
- 不实现 `todo_create`、`todo_update`、`todo_get`、`todo_list` 四个额外入口。
- 不实现跨会话、跨 workspace、跨 Agent Run 的全局 Todo。
- 不把 Todo 映射成 Agent Team 的 `TeamTask`，也不为 V1 引入文件锁、租约、依赖图或结果引用。
- 不把 raw tool args、模型自然语言或前端本地 state 作为 Todo 权威事实源。

## 9. 验收标准

1. 主 Agent 能在一个多步骤请求中创建、读取、逐项完成并最终保留清单。
2. 非法状态、重复 ID、空内容和多个 `in_progress` 均原子失败，旧快照不变。
3. 实时消息和 session 恢复显示相同的清单、顺序、状态和完成数。
4. 新会话/新 Agent Run 不读取其他 Run 的 Todo；同一 Run 重启后可恢复最近快照。
5. Todo 不触发 workspace 权限审批，不改变 Team Task 或 Bash 后台任务行为。

## 10. 实现入口

- Shared 契约与历史折叠：`packages/shared/src/session.ts`、`packages/shared/src/session-selectors.ts`。
- 状态与工具：`packages/agent-core/src/tools/tools/todo/`、`packages/agent-core/src/tools/index.ts`。
- 流式与恢复：`packages/agent-core/src/engine/bridge.ts`、`packages/agent-core/src/engine/streaming-preview-extractors.ts`、`packages/agent-core/src/persistence/recovery.ts`。
- Desktop 展示：`packages/desktop/src/renderer/components/messages/TodoListBlock.tsx`、`packages/desktop/src/renderer/components/ConversationView.tsx`、`packages/desktop/src/renderer/App.tsx`。

自动化测试已覆盖 replace/merge、原子校验、工具注册、bridge、partial args、session JSONL 恢复、历史折叠和 Desktop 实时聚合。真实 Electron 视觉与点击链路仍按 `docs/exec-runs/20260808-agent-todo-tools/execution-summary.md` 人工验收。
