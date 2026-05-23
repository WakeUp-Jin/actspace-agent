# actspace 后端计划 E：Execution Engine

## 目标

实现 `runAgentLoop` 风格的后端执行引擎，把 LLM Service、Context Pipeline、Tool Scheduler 串成可取消、可观测、可恢复的一轮 Agent turn。

## 设计来源

- `docs/design-docs/backend-agent-design.md`
- `docs/RELIABILITY.md`
- `.agents/skills/llm-agent-dev/SKILL.md`
- `.agents/skills/llm-agent-dev/references/agent-runtime/agent-patterns.md`
- `.agents/skills/llm-agent-dev/examples/agent-loop.ts`

## 相关路径

- `packages/agent-core/src/agent.ts`
- `packages/agent-core/src/runtime/`
- `packages/agent-core/src/types.ts`
- `packages/shared/src/session.ts`
- `packages/desktop/src/main/index.ts`

## 范围

包含：

- 实现纯函数执行循环。
- 支持 LLM streaming event 消费。
- 支持 tool-call loop。
- 支持 runtime event emit。
- 支持 `AbortSignal`。
- 支持 turn 安全阀。
- 将 runtime events 聚合为 `AgentTurnResult`。
- 保持 mock provider 可运行。

不包含：

- 不实现子 Agent。
- 不实现后台异步任务。
- 不实现复杂多 turn steering。
- 不实现高级权限审批。

## 执行流程

一轮 turn：

1. 接收 `AgentTurnInput`。
2. emit `turn_started`。
3. 追加 `user_message`。
4. 调 Context Pipeline。
5. 调 LLM Service stream。
6. 收集 thinking/text/tool calls。
7. 如果有 tool calls，交给 Tool Scheduler。
8. 追加 tool call/result events。
9. 工具结果回填 Context Pipeline。
10. 再次调用 LLM。
11. 直到 final reply 或安全阀触发。
12. 追加 context snapshot。
13. 返回 `AgentTurnResult`。

## 失败模式

必须处理：

- provider 抛错。
- provider 返回异常结构。
- 工具不存在。
- 工具输入非法。
- 工具执行失败。
- AbortSignal 中止。
- 达到最大 turn 安全阀。

失败时要求：

- 进程不崩溃。
- 返回结构化 `error`。
- 可写入 `error` session event。
- 前端能渲染错误块。

## 验收

命令：

- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm typecheck`
- `pnpm build`

行为验收：

- mock provider 能跑出完整 turn。
- 完整 turn 至少包含 thinking、read/search 或 list、edit diff、assistant reply、context snapshot。
- 工具调用顺序与模型输出顺序一致。
- tool result 会进入下一次 LLM 调用上下文。
- provider 错误返回 failed result。
- abort 不会留下半崩溃状态。

## 并行关系

- 推荐等待计划 A 类型稳定后启动。
- 可以先用 B/C/D 的 mock adapter 开发。
- 最终需要接入 LLM Service、Tool Runtime、Context Pipeline、Persistence。

## 进度

- [ ] 审查现有 `agent.ts`。
- [ ] 定义 runtime event。
- [ ] 实现 runAgentLoop。
- [ ] 接入 mock LLM stream。
- [ ] 接入 Tool Scheduler。
- [ ] 接入 Context Pipeline。
- [ ] 聚合 AgentTurnResult。
- [ ] 增加失败场景。
- [ ] 通过类型检查和构建。
- [ ] 更新架构文档和 history。

## 决策记录

- 2026-05-23：执行引擎采用纯函数和事件回调，不持久化状态；持久化由外层 adapter 负责。
