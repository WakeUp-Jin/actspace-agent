# actspace V1 Agent 运行层计划

## 目标

设计并实现 `actspace` 的 V1 Agent 运行层，使桌面端能够围绕 DeepSeek 跑通一次完整 Agent turn：构建上下文、调用模型、触发工具、回填结果、生成最终回复，并把完整事件流保存到本地 `jsonl`。

## 范围

- 包含：
  - `TypeScript` 版 Agent 运行层模块边界
  - DeepSeek provider 接入
  - 工具系统最小集合
  - 执行循环
  - session persistence
  - context usage 统计
- 不包含：
  - 长期记忆
  - 多 Agent 编排
  - MCP / Skill 完整运行时
  - 高级压缩策略
  - 多 provider 同时接通

## 背景

- 相关文档：
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `.agents/skills/llm-agent-dev/SKILL.md`
  - `docs/exec-plans/active/actspace-v1-foundation.md`
  - `docs/exec-plans/active/actspace-v1-workbench-ui.md`
  - `docs/exec-plans/active/actspace-v1-integration-and-acceptance.md`
- 版本目标：
  - `V1 基础版`
- 模型策略：
  - `DeepSeek 优先 + 可扩展抽象`

## 模块结构

- `LLM Service`
  - provider factory
  - DeepSeek provider
  - request/response normalization
- `Context Pipeline`
  - system prompt
  - session history
  - tool results
  - attachments / file references
  - context usage snapshot
- `Tool Registry`
  - tool definitions
  - input validation
  - permission boundary
  - output truncation
- `Execution Engine`
  - turn loop
  - tool call parsing
  - stop conditions
  - error handling
- `Session Persistence`
  - session directory layout
  - `session.jsonl`
  - `meta.json`

## 首版工具范围

- `read_file`
- `search_files`
- `edit_file_diff`
- `list_directory`

工具要求：
- 必须有清晰 description
- 必须有结构化输入输出
- 必须有输出裁剪
- 错误信息必须可被 LLM 正确理解

## 执行循环

1. 接收用户输入。
2. 读取当前 session 状态。
3. 构建本轮上下文。
4. 调用 DeepSeek provider。
5. 解析模型输出：
   - `thinking`
   - `tool calls`
   - `final reply`
6. 若有工具调用：
   - 执行工具
   - 裁剪输出
   - 写入 `tool result`
   - 回填上下文
   - 继续下一轮
7. 若得到 `final reply`：
   - 写入 session
   - 返回 renderer

## 本地存储与事件流

- 每个会话一个目录
- 至少包含：
  - `meta.json`
  - `session.jsonl`
  - `attachments/`
- `session.jsonl` 每行一个事件
- 事件类型至少包括：
  - `user_message`
  - `assistant_reply`
  - `thinking`
  - `tool_call`
  - `tool_result`
  - `diff_preview`
  - `context_snapshot`

## 关键接口

### `ModelProvider`

- `id: string`
- `label: string`
- `completeTurn(input): Promise<ModelTurnOutput>`

要求：
- 对上层隐藏 provider 差异
- 返回统一的 `thinking/tool_calls/final_reply` 结构

### `ToolExecutionResult`

- `toolName: string`
- `ok: boolean`
- `summary: string`
- `rawOutput: string`
- `truncatedOutput: string`
- `artifacts?: ToolArtifact[]`
- `error?: ToolExecutionError`

### `SessionEvent`

- `id`
- `sessionId`
- `turnId`
- `type`
- `timestamp`
- `payload`

payload 应根据 type 有明确 shape，不允许模糊字符串拼接作为唯一数据来源。

### `ContextUsageSnapshot`

- `totalTokens`
- `maxTokens`
- `percentUsed`
- `buckets`

`buckets` 至少包含：
- `systemPrompt`
- `tools`
- `rules`
- `skills`
- `mcp`
- `subagents`
- `conversation`

### `AgentTurnResult`

- `sessionId`
- `turnId`
- `events: SessionEvent[]`
- `finalReply?: AssistantReply`
- `contextSnapshot: ContextUsageSnapshot`
- `status: "completed" | "failed"`
- `error?: AgentTurnError`

这是 IPC 返回给 renderer 的最小统一结构。

## 风险

- 风险：provider 抽象过早做重
  - 缓解方式：首版只实现一个 DeepSeek provider，接口只保留最小扩展位
- 风险：工具输出膨胀污染上下文
  - 缓解方式：所有工具结果必须走 truncation
- 风险：session event shape 不稳定，前端难以消费
  - 缓解方式：先固定最小事件类型并版本化 shared types

## 里程碑

1. 定义 shared contracts 和 session event schema。
2. 接通 DeepSeek provider 与执行循环。
3. 实现四个首版工具与本地 persistence。
4. 输出前端可消费的 turn result 与 context snapshot。

## 验证方式

- 命令：
  - `pnpm typecheck`
  - `pnpm test` 或等价运行时验证
- 手工检查：
  - 一条输入能完成一个完整 turn
  - 工具调用顺序正确
  - `jsonl` 文件能写入并可重建消息流
- 观测检查：
  - provider 请求日志
  - tool execution 日志
  - session write 日志

## 进度记录

- [x] 定义 shared interfaces。
- [x] 接入 DeepSeek provider。
- [x] 搭建 execution engine。
- [x] 实现首版工具集合。
- [x] 实现 session persistence。
- [x] 输出 context usage snapshot。
- [x] 打通 renderer 消费链路。

## 决策记录

- 2026-05-21：首版只真实接入 DeepSeek，但 provider 接口必须预留未来扩展位。
- 2026-05-21：所有模型调用、文件操作和 session persistence 都通过 main 侧受控能力完成，不允许 renderer 绕过 IPC。
