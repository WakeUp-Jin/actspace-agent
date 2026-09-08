# ActSpace v2 P11：one-shot Subagent、Agent 与 Explore — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-11-one-shot-subagent.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-11-one-shot-subagent/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Descriptor/Preset | `agent/subagent/{descriptor,preset}.ts` | Agent/Explore 共享 seam，静态不可变策略 |
| Child Session | `child-session.ts`、`session/header.ts` | parent call、seed digest、depth lineage |
| Provider | `provider.ts`、`terminal-result.ts`、`publication.ts` | synchronous invoke、cascade cancel、durable child terminal 与 parent link repair |
| Entry helpers | `agent-tool.ts`、`explore-tool.ts` | 两个用户可见入口映射到同一 provider |

## Agent 已完成的验证

- P11 subagent tests：1 file、4/4；RuntimeHandle 另有真实组合与 crash/resume 集成测试。
- Agent Runtime strict typecheck：通过。
- Explore write tool 被 allowlist 交集排除；delegation depth 超限 fail-closed；cascade shutdown 等待 child terminal 与资源静止。

## 已知风险和遗留事项

- P11 单元测试的 ChildLoopFactory 仍使用确定性 fake，但 P12 RuntimeHandle 集成已用真实 AgentLoop、Session writer、LLM 和 Tool Runtime 执行完整 Explore child turn。
- crash-window 已覆盖跨 RuntimeHandle resume 的 durable repair；packaged 进程强杀和真实 Provider/Browser 仍属于 P15 外部验收。
