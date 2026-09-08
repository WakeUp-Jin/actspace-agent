# ActSpace v2 P07：Runtime Projection 与固定前端 DTO — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260822-actspace-v2-plugin-runtime/actspace-v2-plan-07-runtime-projection.md`
- **执行过程**：`docs/exec-runs/actspace-v2-plan-07-runtime-projection/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Shared Projection DTO | `packages/shared/src/runtime-v2/{projection,diagnostics,index}.ts` | 固定 Session、Tool、Live、Artifact、Diagnostics 合同 |
| Durable projection | `packages/agent-runtime/src/projection/durable-session.ts` | Journal/Surface -> canonical Session Snapshot |
| Live stream | `packages/agent-runtime/src/projection/{live-progress,cursor-stream}.ts` | cursor、ring buffer、gap/runtime resync、late event drop |
| Generic Tool DTO | `tool-dto.ts`、`artifact.ts`、`redaction.ts` | 五态工具视图、unknown outcome、通用 fallback、artifact safety |
| Diagnostics | `diagnostics.ts` | 去重、限长、credential/path 脱敏，独立于 Journal |

## Agent 已完成的验证

- P07 projection tests：5/5。
- 全部 `agent-runtime` tests：7 files、49/49。
- Shared 与 Agent Runtime TypeScript 5.9.3 strict typecheck：通过。
- `git diff --check`：待本轮统一文档检查时再次执行。

## 已知风险和遗留事项

- 当前行为测试已使用 workspace 锁定的 Vitest 3.2.4 重跑；fresh install 仍因外部 registry records 缺失而未验证。
- renderer allowlist 目前是纯后端 validator map；P13/P14 必须把它映射到构建时固定 renderer，而不是允许插件注入组件。
- Live buffer 是进程内内存结构；跨进程传输和 shutdown drain 由 P12-P15 负责。

## 后续建议

- P08 使用 Session Snapshot 的消息/compaction 语义，不新增第二历史源。
- P12 将 LiveProgressHub、DiagnosticsCollector 和 Durable Projection 统一收进 RuntimeHandle，但保留三种投影平面边界。
