# actspace 后端计划 A：全局数据契约与事件模型

## 目标

稳定后端 Agent Runtime 与桌面前端之间的共享契约，让后续 LLM、工具、上下文、执行引擎、持久化计划都围绕同一套类型推进。

本计划是后端并行开发的推荐第一步。它不实现完整运行时，只定义和验证跨模块数据边界。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `docs/ARCHITECTURE.md`
- `docs/RELIABILITY.md`
- `docs/FRONTEND.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/architecture.md`
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`

## 相关路径

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/index.ts`
- `packages/agent-core/src/types.ts`
- `packages/desktop/src/renderer/fixtures/`
- `packages/desktop/src/renderer/utils/`

## 范围

包含：

- 梳理 `SessionEvent` 的持久化事件类型。
- 梳理 `RuntimeStreamEvent` 的流式运行事件类型。
- 稳定 `ToolExecutionResult`、`ToolUiPreview`、`ContextUsageSnapshot`、`AgentTurnResult`。
- 定义 runtime event 到 session event 的 adapter 输入输出。
- 增加覆盖完整 turn 的 mock fixtures。
- 确保前端消息组件可由 session events 稳定派生。

不包含：

- 不实现真实 DeepSeek provider。
- 不实现真实文件工具。
- 不实现完整 `runAgentLoop`。
- 不改变 Electron IPC 主流程，除非发现契约缺口。

## 契约要求

### SessionEvent

首版必须覆盖：

- `user_message`
- `thinking`
- `tool_call`
- `tool_result`
- `diff_preview`
- `assistant_message`
- `context_snapshot`
- `error`

每个事件必须包含：

- `id`
- `sessionId`
- `turnId`
- `type`
- `timestamp`
- `schemaVersion`
- `payload`

### RuntimeStreamEvent

首版必须覆盖：

- turn started / finished / failed
- assistant text delta
- assistant thinking delta
- tool started / finished

Runtime event 可以不持久化，但必须能映射成最终 `SessionEvent`。

### ToolExecutionResult

必须区分：

- `rawOutput`：工具真实输出。
- `truncatedOutput`：裁剪后的可读输出。
- `modelOutput`：允许回填给模型的输出。
- `uiPreview`：前端组件渲染摘要。
- `rawOutputRef`：大输出引用，首版可用 inline 或 file。

### ContextUsageSnapshot

必须支持 Context popup：

- `totalTokens`
- `maxTokens`
- `percentUsed`
- `compressionCount`
- `cumulativeTokens`
- `buckets`

## Mock Fixtures

需要新增或整理 fixture，至少覆盖：

- 一轮普通用户消息。
- 一段 thinking。
- 一次 `read_file` 成功。
- 一次 `search_files` 或 `list_directory` 成功。
- 一次 `edit_file_diff`。
- 一条 assistant final reply。
- 一条 context snapshot。
- 一个工具失败事件。
- 一个 provider 失败事件。

这些 fixtures 应能被前端、后端测试和后续执行引擎计划复用。

## 验收

命令：

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm typecheck`

行为验收：

- session event fixtures 可以转换为中间消息区需要的 `MessageBlock`。
- edit diff fixture 可以生成会话级 diff summary。
- context snapshot fixture 可以驱动 Context popup。
- error fixture 不会导致 renderer 崩溃。

## 并行关系

- 本计划是其他后端计划的推荐前置地基。
- LLM、Tool、Context、Persistence 可在本计划类型草案稳定后并行。
- Execution Engine 最好等待本计划完成后再正式接线。

## 进度

- [ ] 审查现有 shared 类型。
- [ ] 明确 session event 与 runtime event 边界。
- [ ] 补齐或修正缺失 payload 类型。
- [ ] 增加完整 turn mock fixtures。
- [ ] 增加失败场景 fixtures。
- [ ] 验证前端消息 adapter 可消费 fixtures。
- [ ] 通过类型检查。
- [ ] 更新相关文档和 history。

## 决策记录

- 2026-05-23：以 `docs/design-docs/backend-agent-design.md` 作为后端契约设计来源，先统一 shared 契约再并行实现各后端模块。
