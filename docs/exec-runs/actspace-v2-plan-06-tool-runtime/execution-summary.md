# ActSpace v2 P06：Tool Runtime、审批与有序提交 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-06-tool-runtime.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-06-tool-runtime/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Tool ABI | `packages/agent-runtime/src/tools/{definition,executor,registry}.ts` | 数据 definition 与不可序列化 executor 分离 |
| Admission | `prepared-execution.ts`、`policy.ts`、`approval-port.ts`、`core-guards.ts` | 固定安全顺序和 fail-closed boundary |
| Lease/commit | `activation-lease.ts`、`ordered-commit.ts` | registration draining 与模型顺序提交 |
| Scheduler | `scheduler.ts`、`runtime.ts` | exclusive barrier + bounded parallel body |
| Result/redaction | `result.ts`、`redaction.ts`、`errors.ts` | generic model result、structured failure、secret redaction |

## 人工验证指引

### 必须验证

1. **真实 executor parity**
   - 验证方式：P09 为每个保留 executor 通过 `ToolRuntime.register()` 接入并执行旧行为对照。
   - 预期结果：executor 不直接写 Journal、不拿 approval/credential/renderer 对象，所有结果经过本 Runtime pipeline。

### 建议验证

1. **Host approval**
   - 验证方式：P13 Desktop、P14 CLI 分别提供 ApprovalBroker，覆盖 stale、cancel、timeout 和 definition digest mismatch。
   - 预期结果：失配请求 fail-closed，不复用旧 decision。

## Agent 已完成的验证

- P06 execution contract：10/10。
- 全部 `agent-runtime` tests：6 files、44/44。
- TypeScript 5.9.3 strict NodeNext typecheck：通过。
- Tool source isolation：未引入 SessionEvent、Electron、renderer、旧 Agent Core、Cordis 或 pi-ai。
- `git diff --check`：通过。

## 已知风险和遗留事项

- Tool Runtime 当前使用轻量 JSON Schema 子集，P09 迁移的复杂 schema 需要逐项 parity 验证；若需要完整 draft support，应替换 validator 实现而不改变 ABI。
- approval promise 超时后上游 Host 若不响应，当前调用仍由 result path 释放 lease；Host adapter 必须对 abort signal 做协作取消。

## 后续建议

- P07 只消费 `ToolExecutionResult` 与 Session projection，建立固定 renderer DTO；P09 再接入具体 executor。
