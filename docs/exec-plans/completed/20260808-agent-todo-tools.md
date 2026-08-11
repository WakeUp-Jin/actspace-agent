# Agent Todo 工具 V1 执行计划

状态：已完成（自动化验收通过；真实 Electron 视觉与点击验收保留为人工边界）

本计划只有在用户明确审核通过设计规范和本计划后才进入实现。审核期间不得修改 `packages/` 代码；如设计发生变化，先更新设计规范和本计划，再开始实现。

## 目标

在 ActSpace 主 Agent 的一次 `AgentRun` 内提供可恢复的 Todo 清单：Agent 使用 `todo_read` 和 `todo_write` 维护清单，消息区以独立 Todo 块展示实时/恢复状态；实现不侵入 Agent Team 的未来 `TeamTask` 模型。

## 范围

包含：

- `TodoStatus`、`TodoItem`、`TodoSnapshot`、`TodoUiPreview` shared 契约。
- `todo_read`、`todo_write` 的 definition、schema、executor、ToolManager 注册和无审批执行路径。
- AgentRun 作用域的 TodoStore、全量写入/按 ID 合并、原子校验、revision 和 session JSONL 恢复。
- bridge/streaming preview、session selectors 和 Desktop `TodoListBlock` 消费路径。
- 主 Agent prompt 使用规则、针对工具/桥接/恢复/renderer 的自动化测试，以及文档和 history 收尾。

不包含：

- Cursor/Claude Code 的 `Task`、子 Agent 调度、后台任务、await 或 `TaskV2`。
- `todo_create`、`todo_update`、`todo_get`、`todo_list` 额外工具。
- Team owner、依赖图、租约、文件锁、跨 Agent Run 或跨会话共享。
- workspace TODO 文件、独立 Todo 数据库、独立 IPC 通道、用户直接编辑清单。

## 预先阅读与约束

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/tool-system/agent-todo-tools.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `docs/design-docs/collaboration/agent-form-team.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`

实现中遵循现有 `agent-core -> shared session events -> Desktop renderer` 边界；renderer 不解析 raw tool args，Todo 的展示只消费 `TodoUiPreview`。

## 允许修改的主要文件范围

- `packages/shared/src/session.ts`、`packages/shared/src/session-selectors.ts` 及对应 shared 测试。
- `packages/agent-core/src/tools/index.ts`、`packages/agent-core/src/tools/types.ts`、`packages/agent-core/src/tools/tools/todo/`、`packages/agent-core/src/engine/bridge.ts`、`packages/agent-core/src/engine/streaming-preview-extractors.ts`、`packages/agent-core/src/persistence/recovery.ts`、`packages/agent-core/src/prompt/main-agent.ts` 及对应测试。
- `packages/desktop/src/renderer/components/messages/TodoListBlock.tsx`、`packages/desktop/src/renderer/components/ConversationView.tsx`、相关消息转换/样式和 renderer 测试。
- 实现完成后按仓库约定更新 `docs/histories/`；不在本次审核阶段新增 history。

## 阶段与验收

### 0. 审核闸门（已完成）

- [x] 用户确认 Todo/Task 边界、两个工具的输入输出和 AgentRun 作用域。
- [x] 用户确认不做 Team Task、用户编辑、跨会话共享和额外工具入口。
- [x] 用户批准后将本计划状态改为“执行中”，并记录最终决策。

验收：只检查两份文档内容和链接；本阶段不运行代码、不改 `packages/`。

### 1. Shared 契约和状态核心

- [x] 在 `packages/shared/src/session.ts` 增加 `TodoStatus`、`TodoItem`、`TodoSnapshot`、`TodoUiPreview`，并加入 `ToolUiPreview` 联合类型。
- [x] 在 `packages/agent-core/src/tools/tools/todo/` 实现 TodoStore 和纯函数更新逻辑：replace、merge、ID 生成、时间戳、revision、唯一 `in_progress` 校验。
- [x] 为空内容、未知状态、重复 ID、多个进行中项、失败不部分提交补充测试。

验收命令：`pnpm --filter @actspace/shared exec vitest run src/test/session-transcript.test.ts` 与对应 agent-core Todo 测试；预期全部通过，TypeScript 类型通过。

### 2. Agent-core 工具接入

- [x] 在 `packages/agent-core/src/tools/tools/todo/` 增加 `todo_read`、`todo_write` definition/executor，并在 `packages/agent-core/src/tools/index.ts` 注册。
- [x] 将 TodoStore 绑定到 `sessionId + agentRunId`，确保同一 Run 的连续调用共享快照，新 Run 不读取旧 Run。
- [x] 将成功结果同时放入结构化 tool result 和 `uiPreview`；失败返回稳定错误码/短模型信息，不改变旧快照。
- [x] 更新 `packages/agent-core/src/prompt/main-agent.ts`：多步骤请求使用 Todo，遵守单个 `in_progress` 和及时完成规则。

验收：ToolManager 注册测试、executor 测试、prompt 断言；执行 `pnpm --filter @actspace/agent-core exec vitest run src/tools/test/manager.test.ts src/test/prompt.test.ts` 及新增 Todo 测试。

### 3. 流式、持久化和恢复

- [x] 在 `packages/agent-core/src/engine/bridge.ts` 为 `kind: "todo"` 生成 running/finished preview，按 `toolCallId` 原地更新。
- [x] 在 `packages/agent-core/src/engine/streaming-preview-extractors.ts` 注册 Todo extractor；partial JSON 不完整时不推断半成品数组。
- [x] 在 `packages/shared/src/session-selectors.ts` 和 `packages/agent-core/src/persistence/recovery.ts` 增加 Todo preview 的实时聚合与最近成功快照恢复。
- [x] 覆盖“写入后重启恢复”“无 Todo 事件为空”“失败写入保持旧 revision”“实时与恢复结果相同”的测试。

验收：`pnpm --filter @actspace/agent-core exec vitest run src/engine/test/bridge.test.ts src/engine/test/streaming-preview-extractors.test.ts src/persistence/test/recovery.test.ts` 及新增回归测试。

### 4. Desktop Todo 展示

- [x] 新增 `packages/desktop/src/renderer/components/messages/TodoListBlock.tsx`，只消费 `TodoUiPreview`/消息块，不读取 raw args。
- [x] 在 `ConversationView.tsx` 的消息分流中接入独立 Todo block；不要把 Todo 重复渲染成普通工具行。
- [x] 实现 running 默认展开、完成后可折叠、完成数和三种状态的主题感知样式；V1 不提供直接编辑。
- [x] 为空列表、长内容、进行中、全部完成、失败恢复补充 renderer 测试。

验收：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/conversation-view-tooltip.test.tsx` 与新增 Todo 组件测试；随后按 `docs/FRONTEND_VERIFICATION.md` 做浏览器 renderer 检查。Electron IPC/持久化验收保留到实现收尾，由用户或具备 Computer Use 的 Agent 完成。

### 5. 收尾和交付

- [x] 运行 `pnpm typecheck`、`pnpm build`，必要时运行受影响包的定向 Vitest。
- [x] 运行 `git diff --check`，检查文档链接和 session JSONL 恢复样例。
- [x] 按 `docs/HISTORY_GUIDE.md` 记录实现事实、验证结果和未覆盖的 Electron 人工验收，并将本计划移动到 `docs/exec-plans/completed/`。
- [x] 在执行摘要和最终回复中区分自动化验证、浏览器 renderer 验证和 Electron/真实持久化未验证边界。

## 风险与回退

| 风险 | 缓解 | 最小回退 |
| --- | --- | --- |
| ToolUiPreview 联合类型扩大导致旧 renderer 分支不完整 | 先补 shared 类型守卫和恢复测试，再接 UI | 暂时保留 generic preview，移除 Todo UI 分支，但保留工具状态测试 |
| ToolManager 重建导致 Todo 状态丢失 | 以 `sessionId + agentRunId` 注入 store，并用最近成功 tool result 恢复 | 仅在单次 AgentRun 内启用，明确关闭跨重启恢复 |
| prompt 诱导出过多/过少 Todo | 增加多步骤、简单请求和目标变化的 prompt/loop 回归 | 保留工具但撤回 prompt 自动建议，由调用方显式使用 |
| Todo 与 TeamTask 概念混淆 | 保持独立类型、目录和存储边界，补架构测试/文档断言 | 暂停 Team 集成，Todo 只做单 AgentRun 本地展示 |
| UI 视觉或 Electron IPC 验收未完成 | 自动化和 renderer 验证与 Electron 验收分层记录 | 不宣称桌面端完成，等待用户截图或手工验收 |

## 决策记录

- 2026-08-08：V1 选择 `todo_read` + `todo_write` 两个入口；完整替换/按 ID 合并覆盖当前主 Agent 需要，额外 CRUD 会扩大协议但不增加能力。
- 2026-08-08：Todo 绑定 `sessionId + agentRunId`，复用现有 session JSONL 和 ToolUiPreview，不引入 TeamTask 的共享存储、owner、依赖和并发机制。
- 2026-08-08：用户审核通过前不修改 `packages/`，本计划保持“待用户审核”。
- 2026-08-08：用户明确批准执行本计划；Todo/Task 边界、工具契约、AgentRun 作用域和 V1 排除项保持不变，计划进入实现阶段。
- 2026-08-09：V1 实现和自动化验收完成。浏览器控制器没有可用实例，Electron 39.8.10 在应用窗口创建前两次原生崩溃，因此视觉、点击和真实进程重启恢复保留为人工验收，不阻塞计划归档。
