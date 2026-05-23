# actspace 后端计划 D：Context Pipeline

## 目标

建立后端上下文管道，让每轮 LLM 调用都由统一的 Context Pipeline 组装输入、裁剪工具输出、统计 token，并生成前端 Context popup 所需的 `ContextUsageSnapshot`。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `docs/design-docs/frontend-ui/聊天输入框规范.md`
- `docs/RELIABILITY.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/context/overview.md`
- `.agents/skills/llm-agent-dev/references/context/mgmt-context-architecture.md`
- `.agents/skills/llm-agent-dev/references/context/mgmt-token-strategies.md`
- `.agents/skills/llm-agent-dev/references/context/type-system-prompt.md`

## 相关路径

- `packages/agent-core/src/context.ts`
- `packages/agent-core/src/types.ts`
- `packages/agent-core/src/context/`
- `packages/shared/src/session.ts`

## 范围

包含：

- 定义内部 Context 输入结构。
- 组装 system prompt。
- 组装 session history。
- 组装 tool definitions。
- 组装附件摘要。
- 将工具结果的 `modelOutput` 回填上下文。
- 建立 token estimator。
- 生成 `ContextUsageSnapshot`。
- 预留压缩判断入口。

不包含：

- 不实现高级自动压缩。
- 不实现长期记忆。
- 不实现 RAG。
- 不实现 Skill/MCP 完整 runtime。

## Context 输入来源

首版来源：

- 用户本轮输入。
- 当前会话事件历史。
- 附件元信息。
- 工具定义。
- 最近工具结果。
- 系统行为约束。
- workspace 摘要。

Context Pipeline 不能无脑把全部内容塞给模型，应遵守：

- 工具原始输出默认不回填。
- 只回填裁剪后的 `modelOutput`。
- 历史消息可以按 turn 和 token 上限裁剪。
- 错误消息要保留足够诊断信息，但避免噪音。

## ContextUsageSnapshot

必须输出：

- `totalTokens`
- `maxTokens`
- `percentUsed`
- `compressionCount`
- `cumulativeTokens`
- `buckets`

Buckets 首版：

- `systemPrompt`
- `tools`
- `rules`
- `skills`
- `mcp`
- `subagents`
- `conversation`

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`

行为验收：

- 空会话可以生成有效 context。
- 包含工具定义时 `tools` bucket 非空。
- 包含会话历史时 `conversation` bucket 非空。
- 工具大输出只把 `modelOutput` 回填上下文。
- Context popup fixture 能显示 token、压缩次数和 buckets。
- token estimator 不要求精确，但应稳定、可解释。

## 并行关系

- 依赖计划 A 的 `ContextUsageSnapshot` 契约草案。
- 可与 LLM Service、Tool Runtime、Persistence 并行。
- Execution Engine 通过本计划产物获取每次 LLM 调用上下文。

## 进度

- [ ] 审查现有 `context.ts`。
- [ ] 定义 Context Pipeline 输入输出。
- [ ] 实现 system prompt 组装。
- [ ] 实现 session history 组装。
- [ ] 实现 tool definitions 组装。
- [ ] 实现 tool result feedback。
- [ ] 实现 token estimator。
- [ ] 生成 ContextUsageSnapshot。
- [ ] 通过类型检查。
- [ ] 更新架构文档和 history。

## 决策记录

- 2026-05-23：上下文管道首版重点是可见、可裁剪、可统计，暂不做高级压缩和长期记忆。
