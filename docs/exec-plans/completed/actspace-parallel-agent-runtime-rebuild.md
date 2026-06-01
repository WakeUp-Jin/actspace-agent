# actspace 并行计划 3：Agent 后端运行时按 Skill 重建（已拆分）

## 当前状态

本计划已被 `docs/design-docs/agent-backend-design.md` 拆分为更细的后端并行计划，不再作为 active 执行入口保留。

新的 active 后端计划包括：

- `docs/exec-plans/active/actspace-backend-contracts-events.md`
- `docs/exec-plans/active/actspace-backend-llm-service.md`
- `docs/exec-plans/active/actspace-backend-tool-runtime.md`
- `docs/exec-plans/active/actspace-backend-context-pipeline.md`
- `docs/exec-plans/active/actspace-backend-execution-engine.md`
- `docs/exec-plans/active/actspace-backend-persistence-recovery.md`

以下内容保留为历史方案和拆分依据。

## 目标

按照 `.agents/skills/llm-agent-dev` 的架构约束，把当前 mock 后端重建为 V1 基础版 Agent Runtime：包含 LLM Service、Context Pipeline、Tool Registry、Execution Engine、Session Persistence，并通过 IPC 向桌面前端提供稳定、可裁剪、可恢复的事件流。

## 并行边界

本计划可以和前端计划、契约计划并行执行。

- 如果契约计划尚未完成，本计划先在 `agent-core` 内部实现 adapter，最终输出映射到 `packages/shared` 的事件结构。
- 如果前端计划尚未完成，本计划通过 CLI-like 单元测试或 mock IPC 验证，不等待 UI。
- 本计划优先保证运行时结构正确，不追求一次实现完整生产级 Agent。

## 新会话启动必读

- `AGENTS.md`：仓库导航和工作规则。
- `docs/ARCHITECTURE.md`：当前工程结构和 Electron 边界。
- `docs/RELIABILITY.md`：错误处理、观测性、稳定性原则。
- `docs/SECURITY.md`：本地文件、外部模型、工具权限安全边界。
- `docs/FRONTEND.md`：理解前端需要的事件和 IPC。
- `docs/design-docs/front-中间消息区规范.md`：理解后端事件如何对应消息组件。
- `.agents/skills/llm-agent-dev/SKILL.md`：本计划主要执行依据。
- `.agents/skills/llm-agent-dev/references/architecture.md`：V0/V1 结构选择。
- `.agents/skills/llm-agent-dev/references/context/overview.md`：上下文管道。
- `.agents/skills/llm-agent-dev/references/tools/overview.md`：工具系统。
- `.agents/skills/llm-agent-dev/references/llm/llm-service.md`：模型服务层。
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`：执行循环。

## 相关代码路径

- `packages/agent-core/src/agent.ts`
- `packages/agent-core/src/context.ts`
- `packages/agent-core/src/llm.ts`
- `packages/agent-core/src/tools.ts`
- `packages/agent-core/src/persistence.ts`
- `packages/agent-core/src/types.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/index.ts`

## 当前问题

- `agent-core` 目前更像 mock demo，不是完整运行时。
- `read_file / search_files / list_directory` 没有真实文件系统能力。
- `edit_file_diff` 只是返回 diff 字符串，没有明确 patch 计划、权限或应用边界。
- LLM provider 只有 mock，没有 DeepSeek provider 的真实接口抽象。
- Context Pipeline 只有空 bucket 和简单 token 快照，没有上下文组装、裁剪、工具输出回填策略。
- Execution Engine 只有一轮模型输出后顺序执行工具，没有真正的 tool-call loop。
- Persistence 写入格式和 shared 契约不一致。

## 范围

包含：

- 重构 `agent-core` 模块边界。
- 建立 `ModelProvider` / `LLMService` 抽象。
- 增加 DeepSeek provider 的接口骨架，可先用 mock transport，不强制真实 API key。
- 建立 Context Pipeline：系统提示词、会话历史、工具说明、附件摘要、token 统计。
- 建立 OutputTruncator：工具输出裁剪后再进入上下文。
- 建立 Tool Registry：工具定义、输入校验、执行结果、错误结构。
- 实现真实最小工具：`read_file`、`search_files`、`list_directory`。
- `edit_file_diff` 首版只生成 reviewable diff，不自动写盘，除非后续明确授权。
- 建立 Execution Engine：模型调用、工具调用解析、工具执行、结果回填、循环直到 final reply。
- 修复 Session Persistence：jsonl 每行事件可恢复。

不包含：

- 不做长期记忆。
- 不做子 Agent 编排。
- 不做完整 MCP runtime。
- 不做自动压缩高级策略。
- 不做云同步。
- 不做未授权的真实文件修改。

## 推荐模块结构

```txt
packages/agent-core/src/
  index.ts
  runtime/
    createAgentRuntime.ts
    executionEngine.ts
    turnEvents.ts
  llm/
    modelProvider.ts
    llmService.ts
    deepseekProvider.ts
    mockProvider.ts
  context/
    contextPipeline.ts
    tokenEstimator.ts
    outputTruncator.ts
    contextUsage.ts
  tools/
    toolRegistry.ts
    readFileTool.ts
    searchFilesTool.ts
    listDirectoryTool.ts
    editFileDiffTool.ts
  persistence/
    sessionStore.ts
    jsonl.ts
    migrations.ts
```

不要求一次完全按此目录落地，但最终边界应接近此结构。

## 核心接口要求

### ModelProvider

```ts
type ModelProvider = {
  id: string;
  label: string;
  complete(input: ModelProviderInput): Promise<ModelProviderOutput>;
};
```

### ToolExecutionResult

必须包含：

- `toolName`
- `ok`
- `summary`
- `rawOutput`
- `truncatedOutput`
- `artifacts`
- `error`
- `tokenEstimate`

### Execution Engine

首版循环：

1. 接收用户输入。
2. 追加 `user_message`。
3. Context Pipeline 组装上下文。
4. 调用 LLM。
5. 如果有 thinking，追加 `thinking`。
6. 如果有 tool call，追加 `tool_call`。
7. 执行工具。
8. 裁剪工具输出。
9. 追加 `tool_result`。
10. 工具结果回填上下文。
11. 继续循环，直到 final reply 或达到最大轮次。
12. 追加 `assistant_reply` 和 `context_snapshot`。
13. 写入 jsonl。

## 工具安全边界

- renderer 不直接访问文件系统。
- 所有文件能力必须在 main/agent-core 中执行。
- 文件路径需要限制在允许 workspace 或用户明确选择的路径内。
- `edit_file_diff` 首版默认不写盘，只产出 diff preview。
- 工具错误必须准确，避免上下文污染。

## 验收方式

命令：

- `pnpm typecheck`
- `pnpm build`

后端行为验收：

- mock provider 能跑完整 turn。
- 至少包含一次 `thinking + read_file + search_files 或 list_directory + edit_file_diff + assistant_reply`。
- 工具输出经过裁剪。
- `context_snapshot` 有非空 buckets 和 token 统计。
- `session.jsonl` 能恢复为完整事件流。

失败场景验收：

- 文件不存在时返回结构化工具错误。
- provider 抛错时返回 `AgentTurnResult.status = "failed"` 或等价错误事件。
- 工具输入非法时不会崩溃。
- jsonl 写入失败时错误能被 main 捕获并传给 renderer。

## 与其他计划的接口

- 从契约计划接收：`SessionEvent`、`AgentTurnResult`、`ContextUsageSnapshot`、`ToolExecutionResult`。
- 给前端计划输出：稳定事件流和可恢复 session。
- 如果 shared 契约暂未稳定，后端先实现内部类型，再通过 adapter 输出 shared 类型。

## 风险

- 风险：后端重构范围过大，拖成长期工程。
- 缓解：以 V1 基础版最小闭环为目标，先保证 mock provider + 真实工具 + 稳定事件流。

- 风险：真实 DeepSeek 接入牵涉网络、密钥、错误重试，影响主线。
- 缓解：provider 层先做接口和 mock transport，真实 HTTP 接入作为后续小切片。

- 风险：工具直接写盘带来安全风险。
- 缓解：首版 edit 只产出 diff preview，不自动应用。

## 进度记录

- [ ] 阅读 `llm-agent-dev` 关键 reference。
- [ ] 收敛 V1 基础版模块边界。
- [ ] 重构 provider/LLM service。
- [ ] 重构 context pipeline。
- [ ] 重构 tool registry 和最小真实工具。
- [ ] 实现 execution engine loop。
- [ ] 修复 persistence 与 jsonl。
- [ ] 增加失败场景处理。
- [ ] 通过类型检查与构建。
- [ ] 更新架构文档和 history。

## 决策记录

- 2026-05-22：后端重建按 `llm-agent-dev` V1 基础版推进，但真实 DeepSeek HTTP 接入不阻塞运行时结构落地。
