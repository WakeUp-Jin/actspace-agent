# ActSpace v2 P10：main Agent、Turn / Step Loop、Inbox 与 Todo — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-10-main-agent-loop-inbox-and-todo.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-10-main-agent-loop-inbox-and-todo/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Agent registry/publication | `packages/agent-runtime/src/agent/{descriptor,agent,registry,publication}.ts` | 完整构造后发布和 reverse compensation |
| Agent Loop | `agent/loop.ts`、`main-agent.ts` | Session/LLM/Tool/Prompt 的唯一 main turn driver |
| Inbox | `agent/inbox.ts` | durable FIFO enqueue/claim/discard，无 sidecar |
| Todo | `agent/todo.ts`、`session/core-codecs.ts` | revisioned durable event projection |

## Agent 已完成的验证

- P10 Agent tests：1 file、3/3。
- 全部 `agent-runtime` tests：14 files、62/62。
- TypeScript 5.9.3 strict NodeNext typecheck：通过。
- Agent 模块未导入 Electron、TTY、stdout、process.exit、旧 engine 或旧 TodoStore。

## 已知风险和遗留事项

- AgentLoop 已具备 tool-call stream 收集和 P06 batch dispatch，但 P09 真实 executor parity 尚未完成，需 P15 用真实工具链覆盖。
- crash repair 复用 P04 open Turn/Step/Tool recovery；P15 仍需做进程级 fault injection，不能只依赖单进程单元测试。
- `next-turn` 自动 wake 驱动将在 RuntimeHandle/Host 接入时完成，当前 Inbox 已有 durable queue 与 claim 语义。
